import { BaseService, UtilsService } from '@Common';
import { sportConfigFactory } from '@Config';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
// import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Competition,
  ResultProvider,
  SportType,
  StatusType,
} from '@prisma/client';
import { firstValueFrom, timeout } from 'rxjs';
import { PrismaService } from 'src/prisma';
import { getSportEnum, getSportId, getStatusEnum } from 'src/utils/sports';
import { CloseEventResponse, EventResponse } from './events.type';
import { RedisService } from 'src/redis';
import { EventsService } from './events.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class EventsProcessor extends BaseService {
  private readonly CACHE_TTL = 60 * 60 * 24 * 2; // 2 days
  private readonly REQUEST_TIMEOUT_MS = 10000; // 10 seconds

  private isRunning = false;
  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
    private readonly eventService: EventsService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { processor: EventsProcessor.name } });
  }

  async syncEvents() {
    try {
      const baseUrl = this.sportConfig.sportBaseUrl;
      const sports = this.sportConfig.sports;

      if (!baseUrl || !sports)
        throw new Error(
          'Base Url or Sports are not configured, aborting competition sync',
        );

      const competitions = await this.prisma.competition.findMany({
        where: { status: StatusType.Active },
        include: { provider: true },
      });

      await this.utils.batchable(competitions, async (competition) => {
        if (!competition.provider || !competition.provider?.externalId) return;
        const providerId = competition.provider.externalId;
        const sportId = getSportId(sports, competition.sport);
        if (!sportId) return;
        await this.utils.rerunnable(async () => {
          await this.processEvents(baseUrl, competition, providerId, sportId);
        }, 3);
        await this.utils.sleep(2000);
      });
      this.logger.info('✅ Event fetch scheduler completed successfully');
    } catch (err: any) {
      this.logger.error(`❌ Scheduler failed: ${err.message}`);
    }
  }

  async processEvents(
    baseUrl: string,
    competition: Competition,
    providerId: string,
    sportId: number,
  ) {
    const url = `${baseUrl}/event/by-provider-and-competition?sportId=${sportId}&providerId=${providerId}&competitionId=${competition.externalId}`;
    this.logger.info(`📦 Fetching event data from ${url}`);

    try {
      const response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(this.http.get<EventResponse[]>(url));
        return res.data;
      }, 3);
      if (!response.length) {
        this.logger.warn(`⚠️ No events found for ${competition.name}`);
        return;
      }

      await this.utils.batchable(response, async (event) => {
        await this.upsertEvents(
          event,
          competition.id,
          competition.providerId!,
          competition.sport,
        );
        await this.utils.sleep(2000);
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to sync events for competition ${competition.name} (sport=${competition.sport}): ${error?.message ?? error}`,
      );
    }
  }

  async upsertEvents(
    event: EventResponse,
    competitionId: number,
    providerId: number,
    sprotName: string,
  ) {
    try {
      const status =
        getSportEnum(sprotName) !== SportType.Cricket
          ? StatusType.Inactive
          : getStatusEnum(event.status);
      await this.prisma.event.upsert({
        where: {
          competitionId_externalId: {
            competitionId,
            externalId: event.eventId,
          },
        },
        update: {
          startTime: new Date(event.startTime),
          status: status,
          isFancy: event.isFancy,
          isBookmaker: event.isBookmaker,
          isPopular: event.isPopular,
          inplay: status === StatusType.Live,
        },
        create: {
          externalId: event.eventId,
          name: event.eventName,
          sport: getSportEnum(sprotName),
          startTime: new Date(event.startTime),
          status: status,
          isFancy: event.isFancy,
          isBookmaker: event.isBookmaker,
          isPopular: event.isPopular,
          inplay: status === StatusType.Live,
          competitionId,
          providerId,
        },
      });

      // const redisKey = `event:exists:${event.eventId}`;
      // await this.redis.client.setex(redisKey, this.CACHE_TTL, '1'); // 2-day TTL
    } catch (error: any) {
      this.logger.error(`Error to upsert event. error: ${error.message}`);
    }
  }

  async fetchDuplicateMap() {
    try {
      const baseUrl = this.sportConfig.sportBaseUrl;

      if (!baseUrl)
        throw new Error('Base Url is not configured, aborting sync');

      const events = await this.prisma.event.findMany({
        where: {
          status: {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Upcoming,
              StatusType.Open,
            ],
          },
          providerId: null,
        },
        include: { provider: true },
      });

      await this.utils.batchable(events, async (event) => {
        await this.utils.rerunnable(async () => {
          await this.processDuplicateEventsMap(
            baseUrl,
            event.id,
            event.externalId,
          );
        }, 3);
        await this.utils.sleep(2000);
      });
      this.logger.info(
        '✅ Duplicate event mapping fetch scheduler completed successfully',
      );
    } catch (err: any) {
      this.logger.error(`❌ Scheduler failed: ${err.message}`);
    }
  }

  private async processDuplicateEventsMap(
    baseUrl: string,
    betfairEventId: bigint,
    betfairEventEXternalId: string,
  ) {
    const url = `${baseUrl}/event/sr-eventid-by-bf-eventid/${betfairEventEXternalId}`;
    this.logger.info(`📦 Fetching event mapping data from ${url}`);

    try {
      const response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(this.http.get(url));
        return res.data;
      }, 3);
      if (!response) {
        this.logger.warn(
          `⚠️ No event mapping found for ${betfairEventEXternalId}`,
        );
        return;
      }
      const sportsRadarExternalId = response.secondaryEventId;
      if (!sportsRadarExternalId) return;
      const sportsRadarEvent = await this.prisma.event.findFirst({
        where: { externalId: sportsRadarExternalId },
      });
      if (!sportsRadarEvent) return;

      await this.prisma.betfairSportsRadarEvents.upsert({
        where: { betfairEventId },
        update: {},
        create: {
          betfairEventId,
          sportsRadarEventId: sportsRadarEvent.id,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to sync events mapping for event ${betfairEventEXternalId}: ${error?.message ?? error}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCloseEventCorn() {
    if (!this.utils.isMaster()) return;
    if (this.isRunning) return;
    this.logger.info(`Started closed event cornjob`);
    await this.processCloseEvent();
    this.logger.info(`Completed close event cornjob`);
  }

  private async processCloseEvent() {
    try {
      this.isRunning = true;
      const sports = this.sportConfig.sports;
      await this.utils.batchable(Object.keys(sports), async (sport) => {
        const url = `${this.sportConfig.sportBaseUrl}/event/closed-event?sport=${sport}`;
        const response = await this.utils.rerunnable(async () => {
          const res = await firstValueFrom(
            this.http
              .get<CloseEventResponse[]>(url)
              .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
          );
          return res.data;
        }, 3);
        if (!response.length) {
          this.logger.warn(`No Result Found In Close Event Webhook`);
          return;
        }

        await this.utils.batchable(response, async (event) => {
          this.logger.debug(`Close Event - ${JSON.stringify(event, null, 2)}`);
          await this.eventService.checkAndCloseEvent(
            event?.externalId,
            ResultProvider.Webhook,
          );
        });
      });
    } catch (error: any) {
      this.logger.error(`Error to process close event: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
