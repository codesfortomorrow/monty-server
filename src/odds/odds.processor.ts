import { BaseService, SentryExceptionFilter, UtilsService } from '@Common';
import { Injectable, OnApplicationBootstrap, UseFilters } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma';
import { OddsService } from './odds.service';
import _ from 'lodash';
import { StatusType } from '@prisma/client';
import { RedisService } from 'src/redis';
// import { getStatusEnum } from 'src/utils/sports';
import { Sentry } from 'src/configs/sentry.config';

@Injectable()
export class OddsProcessor
  extends BaseService
  implements OnApplicationBootstrap
{
  private isRunning = false;
  private isRunningMarketName = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oddsService: OddsService,
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
  ) {
    super({ loggerDefaultMeta: { processor: OddsProcessor.name } });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.utils.isMaster()) return;

    this.logger.info('Sports inplay bootstrapped successfully');

    this.init().catch((err) =>
      this.logger.error('Sports inplay syncing system crashed', err),
    );
  }

  private async init() {
    while (true) {
      try {
        await Promise.allSettled([
          this.triggerInplay(),
          this.triggerMarketNameSync(),
        ]);
      } catch (err) {
        this.logger.error(`Sprots inplay syncing loop error ${err}`);
        Sentry.captureException(err);
      }

      await this.utils.sleep(60 * 1000);
    }
  }

  private async triggerInplay() {
    try {
      if (this.isRunning) {
        this.logger.warn(
          `Sprots inplay syncing process already running, skipping new run`,
        );
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      this.logger.info(`START Sprots inplay syncing`);

      this.handleInplaySync()
        .catch((err) => {
          this.logger.error(
            `Unhandled error in Sprots inplay syncing process ${err}`,
          );
        })
        .finally(() => {
          this.isRunning = false;
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          this.logger.info(`FINISHED Sports inplay syncing in ${duration}s`);
        });
    } catch (error) {
      this.logger.error(
        `Error in Sprots inplay syncing process, error: ${error.message}`,
      );
    }
  }

  private async triggerMarketNameSync() {
    try {
      if (this.isRunningMarketName) {
        this.logger.warn(
          `Sprots market icon syncing process already running, skipping new run`,
        );
        return;
      }

      this.isRunningMarketName = true;
      const startTime = Date.now();

      this.logger.info(`START Sprots market icon syncing`);

      this.handleSyncMarket()
        .catch((err) => {
          this.logger.error(
            `Unhandled error in Sprots market icon syncing process ${err}`,
          );
        })
        .finally(() => {
          this.isRunningMarketName = false;
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          this.logger.info(
            `FINISHED Sports market icon syncing in ${duration}s`,
          );
        });
    } catch (error) {
      this.logger.error(
        `Error in Sprots market icon syncing process, error: ${error.message}`,
      );
    }
  }

  @UseFilters(SentryExceptionFilter)
  // @Cron(CronExpression.EVERY_MINUTE) // every 30 seconds
  async handleInplaySync() {
    if (!this.utils.isMaster()) return;
    await this.syncInplayEvents();
    // this.logger.info('[Inplay Sync]', result);
  }

  async syncInplayEvents() {
    // 1️⃣ Fetch all active events with "Match Odds" market
    const events = await this.prisma.event.findMany({
      where: {
        startTime: {
          gte: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // past 1 days
          lte: new Date(Date.now() + 60 * 1000), // next 2 days
        },
        status: {
          in: [
            StatusType.Active,
            StatusType.Live,
            StatusType.Open,
            StatusType.Upcoming,
          ],
        },
        competition: { deletedAt: null },
      },
      include: {
        markets: true,
      },
    });

    if (!events.length)
      return { updated: 0, message: 'No active events found' };

    // 2️⃣ Map odds from Redis
    const enriched = await this.oddsService.mapEventsWithOdds(events);

    // Reset all previously inplay events to false (optional)
    await this.prisma.event.updateMany({
      where: { inplay: true },
      data: { inplay: false },
    });

    // 3️⃣ Extract inplay event IDs (those having at least one market inplay)
    const inplayEventIds = enriched
      .filter((e) => {
        return e.inplay;
      })
      .map((e) => e.id);

    if (!inplayEventIds.length) {
      return { updated: 0, message: 'No inplay events found' };
    }

    // 4️⃣ Update those events’ inplay flag in DB in parallel (batchable)
    const BATCH_SIZE = 10; // adjust for DB throughput
    const batches = _.chunk(inplayEventIds, BATCH_SIZE);

    await this.utils.batchable(batches, async (batch) => {
      await this.prisma.event.updateMany({
        where: { id: { in: batch } },
        data: { inplay: true },
      });
    });

    // const statusUpdates: { id: bigint; status: StatusType }[] = [];

    // for (const e of enriched) {
    //   let newStatus: StatusType = getStatusEnum(e.status); // default

    //   // Rule 1: If inplay → Live
    //   if (e.inplay) {
    //     newStatus = StatusType.Live;
    //   }
    //   // Rule 2: Future start → Upcoming
    //   else if (e.startTime && e.startTime > new Date()) {
    //     newStatus = StatusType.Upcoming;
    //   }
    //   // Rule 3: Default → Active
    //   else {
    //     newStatus = StatusType.Active;
    //   }

    //   statusUpdates.push({ id: e.id, status: newStatus });
    // }

    // // Batch update statuses
    // const statusBatches = _.chunk(statusUpdates, BATCH_SIZE);

    // await this.utils.batchable(statusBatches, async (batch) => {
    //   // Prisma cannot update multiple rows with different status in one query.
    //   // So we update one-by-one inside batch.
    //   await Promise.all(
    //     batch.map((item) =>
    //       this.prisma.event.update({
    //         where: { id: item.id },
    //         data: { status: item.status },
    //       }),
    //     ),
    //   );
    // });

    return {
      updated: inplayEventIds.length,
      message: `${inplayEventIds.length} events marked as inplay`,
    };
  }

  @UseFilters(SentryExceptionFilter)
  // @Cron(CronExpression.EVERY_30_SECONDS)
  async handleSyncMarket() {
    if (!this.utils.isMaster()) return;
    await this.syncMarketName();
    // this.logger.info('[Market Available Sync]', result);
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, batch] = await this.redis.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  private async syncMarketName() {
    try {
      // Step 1: Scan all keys by category
      const [extraKeys, fancyKeys, bookmakerKeys] = await Promise.all([
        this.scanKeys('extra:*'),
        this.scanKeys('fancy:*'),
        this.scanKeys('bookmaker:*'),
      ]);

      // Step 2: Extract event IDs
      const extractIds = (keys: string[]) =>
        keys.map((key) => key.split(':')[1]);
      const extraIds = new Set(extractIds(extraKeys));
      const fancyIds = new Set(extractIds(fancyKeys));
      const bookmakerIds = new Set(extractIds(bookmakerKeys));

      // Step 3: Collect all unique event IDs
      const allEventIds = Array.from(
        new Set([...extraIds, ...fancyIds, ...bookmakerIds]),
      );

      this.logger.debug(
        `[syncMarketName] Found total ${allEventIds.length} unique events to sync.`,
      );

      // Step 4: Batch update for better performance
      await this.utils.batchable(allEventIds, async (eventId) => {
        const isPremiumFancy = extraIds.has(eventId);
        const isFancy = fancyIds.has(eventId);
        const isBookmaker = bookmakerIds.has(eventId);

        await this.prisma.event.updateMany({
          where: { externalId: eventId },
          data: { isPremiumFancy, isFancy, isBookmaker },
        });

        this.logger.debug(
          `[syncMarketName] Updated event ${eventId} → { isPremiumFancy: ${isPremiumFancy}, isFancy: ${isFancy}, isBookMaker: ${isBookmaker} }`,
        );
      });

      return {
        updated: allEventIds.length,
        message: `${allEventIds.length} events marked with market type`,
      };
    } catch (error) {
      this.logger.error('[syncMarketName] Failed to sync market names', error);
    }
  }
}
