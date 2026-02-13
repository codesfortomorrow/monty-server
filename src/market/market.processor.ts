// import os from 'os';
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { MarketType, SportType, StatusType } from '@prisma/client';
import { PrismaService } from 'src/prisma';
import { BaseService, UtilsService } from '@Common';
import { sportConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { MarketApiResponse } from './market.type';
import { RedisService } from 'src/redis';
import { ExtraMarketPayload } from 'src/market-mapper/market.type';
import { EventsService } from 'src/events/events.service';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { Sentry } from 'src/configs/sentry.config';
export const SPORT_ID_MAP = {
  Cricket: 4,
  Soccer: 1,
  Tennis: 2,
  Football: 1,
  Basketball: 5,
  GreyhoundRacing: 4339,
  HorseRacing: 7,
  Other: 9,
} as const;

export type SportName = keyof typeof SPORT_ID_MAP;
import { AlertService } from 'src/alert/alert.service';

@Injectable()
export class MarketProcessor
  extends BaseService
  implements OnApplicationBootstrap
{
  private readonly REQUEST_TIMEOUT_MS = 5000; // 5 seconds
  private readonly CACHE_TTL = 60 * 60 * 24 * 1; // 1 days
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
    private readonly eventService: EventsService,
    private readonly alertService: AlertService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { processor: MarketProcessor.name } });
  }
  async onApplicationBootstrap() {
    if (!this.utils.isMaster()) return;
    this.startMissingMarketProcessor();
  }

  /**
   * 1️⃣ Sync Market — runs every 5 hours
   */
  async syncMarkets(sport: 'Cricket' | 'All' = 'Cricket') {
    try {
      const activeEvents = await this.getActiveOrLiveEvents(sport);
      if (!activeEvents.length) {
        this.logger.info('No active/live events found, skipping...');
        return;
      }
      const baseUrl = this.sportConfig.sportBaseUrl;

      if (!baseUrl)
        throw new Error(
          'Base Url is not configured, aborting competition sync',
        );

      // Use Utils.batchable for concurrent batch processing
      await this.utils.batchable(activeEvents, async (event) => {
        await this.utils.rerunnable(
          async () =>
            await this.processEventMarkets(
              baseUrl,
              event.id,
              event.externalId,
              SPORT_ID_MAP[event.sport],
              event.provider?.externalId,
            ),
          3,
        );
        await this.utils.sleep(2000);
      });

      this.logger.info(
        `✅ Market sync completed for ${activeEvents.length} events`,
      );
    } catch (err) {
      this.logger.error('❌ Error in MarketFetchScheduler', { error: err });
    }
  }
  async syncRaceMarkets() {
    try {
      const activeEvents = await this.getActiveOrLiveRaceEvents();
      if (!activeEvents.length) {
        this.logger.info('No active/live events found, skipping...');
        return;
      }
      const baseUrl = this.sportConfig.sportBaseUrl;

      if (!baseUrl)
        throw new Error(
          'Base Url is not configured, aborting competition sync',
        );

      // Use Utils.batchable for concurrent batch processing
      await this.utils.batchable(activeEvents, async (event) => {
        await this.utils.rerunnable(
          async () =>
            await this.processEventMarkets(
              baseUrl,
              event.id,
              event.externalId,
              SPORT_ID_MAP[event.sport],
              // '2',
            ),
          3,
        );
        await this.utils.sleep(2000);
      });

      this.logger.info(
        `✅ Market sync completed for ${activeEvents.length} events`,
      );
    } catch (err) {
      this.logger.error('❌ Error in MarketFetchScheduler', { error: err });
    }
  }
  /**
   * 2️⃣ Fetch and process markets for an event
   */
  private async processEventMarkets(
    baseUrl: string,
    eventId: bigint,
    externalEventId: string,
    sportId: number,
    externalProviderId?: string | null,
  ): Promise<void> {
    try {
      let url: string;
      if (!externalProviderId)
        url = `${baseUrl}/markets/getMarketlist?eventId=${externalEventId}&sportId=${sportId}`;
      else
        url = `${baseUrl}/markets/by-provider?eventId=${externalEventId}&providerId=${externalProviderId}`;

      let response: MarketApiResponse | null = null;
      try {
        response = await this.utils.rerunnable(async () => {
          const res = await firstValueFrom(
            this.httpService
              .get<MarketApiResponse>(url)
              .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
          );
          return res.data;
        }, 3);
      } catch (error) {
        // Call Alert Service
        this.alertService.notifyApiFailure({
          url,
          meta: {
            'Event Id': eventId,
            'External Event Id': externalEventId,
            'External Provider Id': externalProviderId,
          },
          error: error.message,
        });
      }
      const markets = response?.sports || [];

      if (!markets?.length) {
        this.logger.warn(`No markets found for eventId=${externalEventId}`);
        return;
      }

      // Batch insert/update markets
      await this.utils.batchable(markets, async (market) => {
        await this.upsertMarket(
          eventId,
          {
            marketId: market.marketId,
            marketName: market.marketName,
            runners: market.runners,
            startTime: new Date(market.marketStartTime),
            type: MarketType.Normal,
          },
          externalEventId,
        );
      });

      this.logger.info(`Markets synced for eventId=${externalEventId}`);
    } catch (err) {
      this.logger.error(
        `Failed fetching markets for eventId=${externalEventId}`,
        { error: err },
      );
    }
  }

  /**
   * 3️⃣ Upsert markets in DB
   */
  async upsertMarket(
    eventId: bigint,
    market: {
      marketId: string;
      startTime: Date;
      marketName: string;
      runners: object[];
      type: MarketType;
    },
    externalEventId: string,
  ): Promise<void> {
    try {
      await this.utils.occrunnable(async () => {
        await this.prisma.market.upsert({
          where: {
            eventId_externalId: { eventId, externalId: market.marketId },
          },
          update: {
            name: market.marketName,
            startTime: new Date(market.startTime),
            runner: market.runners,
            updatedAt: new Date(),
            type: market.type,
          },
          create: {
            eventId,
            externalId: market.marketId,
            name: market.marketName,
            startTime: new Date(market.startTime),
            runner: market.runners,
            status: StatusType.Active,
            type: market.type,
          },
        });
      });

      const redisKey = `market:exists:${externalEventId}:${market.marketId}`;
      await this.redis.client.setex(redisKey, this.CACHE_TTL, '1');
    } catch (error) {
      this.logger.error(`Error to upsert market. error: ${error.message}`);
    }
  }

  async syncMarketByEvent(externalEventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        externalId: externalEventId,
        status: {
          in: [
            StatusType.Active,
            StatusType.Live,
            StatusType.Upcoming,
            StatusType.Open,
            StatusType.Inactive,
          ],
        },
      },
      include: {
        provider: true,
      },
    });

    if (!event) return;

    await this.processEventMarkets(
      this.sportConfig.sportBaseUrl!,
      event.id,
      event.externalId,
      SPORT_ID_MAP[event.sport],
      event.provider?.externalId,
    );

    const updated = await this.prisma.event.update({
      where: { id: event.id, NOT: { status: StatusType.Closed } },
      data: { isSubscribed: true, status: StatusType.Active },
    });

    if (updated.status === StatusType.Active)
      this.logger.info(`Activated event for eventId ${externalEventId}`);
  }

  /**
   * Helper — fetch all live or active events
   */
  private async getActiveOrLiveEvents(sport: 'Cricket' | 'All') {
    const sportType = sport === 'Cricket' ? SportType.Cricket : undefined;
    return this.prisma.event.findMany({
      where: {
        status: {
          in: [
            StatusType.Active,
            StatusType.Live,
            StatusType.Upcoming,
            StatusType.Open,
          ],
        },
        sport: sportType,
      },
      include: {
        provider: {
          select: {
            id: true,
            externalId: true,
          },
        },
      },
      // select: { id: true, externalId: true, },
    });
  }
  async getActiveOrLiveRaceEvents() {
    return this.prisma.event.findMany({
      where: {
        status: {
          in: [
            StatusType.Active,
            StatusType.Live,
            StatusType.Upcoming,
            StatusType.Open,
          ],
        },
        sport: { in: [SportType.GreyhoundRacing, SportType.HorseRacing] },
      },
      include: {
        provider: {
          select: {
            id: true,
            externalId: true,
          },
        },
      },
      // select: { id: true, externalId: true, },
    });
  }

  async startMissingMarketProcessor() {
    if (!this.utils.isMaster()) return;

    this.logger.info('🚀 Missing market processor started');

    while (true) {
      try {
        await this.processMissingMarkets();
      } catch (err) {
        Sentry.captureException(err);
        this.logger.error('Missing market processor error', err);
      }

      // 🔴 IMPORTANT: sleep 10 sec
      await this.utils.sleep(60 * 1000);
    }
  }

  async processMissingMarkets() {
    if (!this.utils.isMaster()) return;

    const keys = await this.redis.client.keys('market:missing:*');

    for (const key of keys) {
      // ✅ FULL eventID safely nikala
      const eventID = key.replace('market:missing:', '');

      const lockKey = `market:sync:lock:${eventID}`;
      const locked = await this.redis.client.set(lockKey, '1', 'EX', 300, 'NX');

      if (!locked) continue;

      try {
        // ✅ SET se marketIds lao
        const marketIds = await this.redis.client.smembers(key);

        if (!marketIds.length) {
          await this.redis.client.del(key);
          continue;
        }

        // DB check (optional but safe)
        const existingMarkets = await this.prisma.market.findMany({
          where: {
            event: { externalId: eventID },
            externalId: { in: marketIds },
          },
          select: { externalId: true },
        });

        const existingSet = new Set(existingMarkets.map((m) => m.externalId));
        // ✅ EXISTS flag set
        for (const marketId of existingSet) {
          const updated = await this.prisma.event.updateMany({
            where: { externalId: eventID, NOT: { status: StatusType.Closed } },
            data: { status: StatusType.Active, isSubscribed: true },
          });
          if (updated.count > 0)
            this.logger.info(`Activated event for eventId ${eventID}`);
          await this.redis.client.setex(
            `market:exists:${eventID}:${marketId}`,
            this.CACHE_TTL,
            '1',
          );
        }

        // Agar koi bhi missing hai → sync
        if (existingSet.size < marketIds.length) {
          // this.logger.info(`🔄 Syncing missing markets for event ${eventID}`);
          await this.syncMarketByEvent(eventID);
        }

        // ✅ cleanup
        await this.redis.client.del(key);
      } catch (err) {
        this.logger.error(`Market sync failed ${eventID}`, err);
      } finally {
        await this.redis.client.del(lockKey);
      }
    }
  }
}
