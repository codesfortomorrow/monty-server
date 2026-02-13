import { BaseService, SentryExceptionFilter, UtilsService } from '@Common';
import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  UseFilters,
} from '@nestjs/common';
import { AlertService } from 'src/alert/alert.service';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { CompetitionsProcessor } from 'src/competitions/competitions.processor';
import { EventsProcessor } from 'src/events/events.processor';
import { MarketProcessor } from 'src/market/market.processor';
import { RedisService } from 'src/redis';

@Injectable()
export class SportsOrchestratorProcessorService
  extends BaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private isShuttingDown = false;
  private isRunningCompetition = false;
  private isRunningDuplicateEvent = false;
  private isRunningMarket = false;
  private readonly COMPETITION_KEY = 'competitionTimestamp';
  private readonly MARKET_KEY = 'marketTimestamp';
  private readonly DUPLICATE_EVENT_KEY = 'duplicateEventTimestamp';

  constructor(
    private readonly utils: UtilsService,
    private readonly competitionsProcessor: CompetitionsProcessor,
    private readonly eventsProcessor: EventsProcessor,
    private readonly marketsProcessor: MarketProcessor,
    private readonly redis: RedisService,
    private readonly alertService: AlertService,
  ) {
    super({
      loggerDefaultMeta: { service: SportsOrchestratorProcessorService.name },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.utils.isMaster()) {
      this.logger.info('Skipping orchestrator bootstrap (not master)');
      return;
    }

    if (this.utils.isProductionApp()) {
      await this.bootstrap();
    }

    setInterval(() => this.initSportSync(), 1 * 60 * 1000);
    this.logger.info('Sports Orchestrator bootstrapped successfully');
  }

  async onApplicationShutdown(signal: string): Promise<void> {
    this.logger.warn(`Shutdown signal received: ${signal}`);
    this.isShuttingDown = true;
  }

  async bootstrap() {
    // wait sometimes for bootstrap
    await this.utils.sleep(5000);
    await this.redis.client.del(
      this.COMPETITION_KEY,
      this.DUPLICATE_EVENT_KEY,
      this.MARKET_KEY,
    );
    await this.initSportSync();

    const activeKeys = 'event:active:*';
    const closedKeys = 'event:closed:*';
    await this.redis.deleteKeysByPattern(activeKeys);
    await this.redis.deleteKeysByPattern(closedKeys);
  }

  async initSportSync() {
    if (this.isShuttingDown) {
      this.logger.warn(`Sports Sync skipped (shutdown in progress)`);
      return;
    }
    const now = Date.now();
    const competitionTimestamp = now + 2 * 60 * 60 * 1000;
    const marketTimestamp = now + 2 * 60 * 60 * 1000;
    const duplicateEventTimestamp = now + 2 * 60 * 60 * 1000;

    let storedCompetitionTimestamp = Number(
      (await this.redis.client.get(this.COMPETITION_KEY)) ?? 0,
    );
    let storedMarketTimestamp = Number(
      (await this.redis.client.get(this.MARKET_KEY)) ?? 0,
    );
    let storedDuplicateEventTimestamp = Number(
      (await this.redis.client.get(this.DUPLICATE_EVENT_KEY)) ?? 0,
    );
    if (!storedCompetitionTimestamp) {
      storedCompetitionTimestamp = now;
      await this.redis.client.set(
        this.COMPETITION_KEY,
        storedCompetitionTimestamp,
      );
    }

    if (!storedMarketTimestamp) {
      storedMarketTimestamp = now;
      await this.redis.client.set(this.MARKET_KEY, storedMarketTimestamp);
    }

    if (!storedDuplicateEventTimestamp) {
      storedDuplicateEventTimestamp = now;
      await this.redis.client.set(
        this.DUPLICATE_EVENT_KEY,
        storedDuplicateEventTimestamp,
      );
    }

    if (storedCompetitionTimestamp <= now) {
      try {
        if (!this.isRunningCompetition) {
          this.isRunningCompetition = true;
          await this.syncCompetitions();
          await this.redis.client.set(
            this.COMPETITION_KEY,
            competitionTimestamp,
          );
        } else {
          this.logger.warn(
            `Competitions sync skipped (another job already running)`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Error During Competion & Event Syncing, Error: ${error.message}`,
        );
        this.alertService.notifySportSyncFailure({
          meta: {
            'Sync Type': 'Competition & Events',
            Source: SportsOrchestratorProcessorService.name,
          },
          error: error.message,
        });
      } finally {
        this.isRunningCompetition = false;
      }
    }

    if (storedDuplicateEventTimestamp <= now) {
      try {
        if (!this.isRunningDuplicateEvent) {
          this.isRunningDuplicateEvent = true;
          await this.syncDuplicateEvents();
          await this.redis.client.set(
            this.DUPLICATE_EVENT_KEY,
            duplicateEventTimestamp,
          );
        } else {
          this.logger.warn(
            `Duplicate event sync skipped (another job already running)`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Error During Duplicate Event Syncing, Error: ${error.message}`,
        );
        this.alertService.notifySportSyncFailure({
          meta: {
            'Sync Type': 'Duplicate Events',
            Source: SportsOrchestratorProcessorService.name,
          },
          error: error.message,
        });
      } finally {
        this.isRunningDuplicateEvent = false;
      }
    }

    if (storedMarketTimestamp <= now) {
      try {
        if (!this.isRunningMarket) {
          this.isRunningMarket = true;
          await this.syncMarkets();
          await this.redis.client.set(this.MARKET_KEY, marketTimestamp);
        } else {
          this.logger.warn(`Market sync skipped (another job already running)`);
        }
      } catch (error: any) {
        this.logger.error(
          `Error During Market Syncing, Error: ${error.message}`,
        );
        this.alertService.notifySportSyncFailure({
          meta: {
            'Sync Type': 'Markets',
            Source: SportsOrchestratorProcessorService.name,
          },
          error: error.message,
        });
      } finally {
        this.isRunningMarket = false;
      }
    }
  }

  @UseFilters(SentryExceptionFilter)
  // @Cron(CronExpression.EVERY_2_HOURS, { name: 'competitions-sync' })
  async syncCompetitions() {
    await this.competitionsProcessor.fetchCompetitionAndEventsOfDeafultProvider();
    await this.competitionsProcessor.fetchRaceMarketCompttionAndEvents();
    // await this.competitionsProcessor.handleCompetitionSync();
  }

  // @UseFilters(SentryExceptionFilter)
  // @Cron(CronExpression.EVERY_3_HOURS, { name: 'events-sync' })
  // async syncEvents() {
  //   if (!this.utils.isMaster()) return;

  //   await this.safeRun('Events Sync', async () => {
  //     await this.eventsProcessor.syncEvents();
  //   });
  // }

  @UseFilters(SentryExceptionFilter)
  // @Cron(CronExpression.EVERY_2_HOURS, { name: 'markets-sync' })
  async syncMarkets() {
    await this.marketsProcessor.syncMarkets();
  }

  @UseFilters(SentryExceptionFilter)
  // @Cron(CronExpression.EVERY_2_HOURS, { name: 'duplicate-event-mapping' })
  async syncDuplicateEvents() {
    await this.eventsProcessor.fetchDuplicateMap();
  }

  // private async safeRun(
  //   jobName: string,
  //   fn: () => Promise<void>,
  // ): Promise<void> {
  //   if (this.isShuttingDown) {
  //     this.logger.warn(`${jobName} skipped (shutdown in progress)`);
  //     return;
  //   }

  //   if (this.isRunning) {
  //     this.logger.warn(`${jobName} skipped (another job already running)`);
  //     return;
  //   }

  //   this.isRunning = true;
  //   const startTime = Date.now();

  //   try {
  //     this.logger.info(`START ${jobName}`);
  //     await fn();
  //     this.logger.info(
  //       `END ${jobName} in ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
  //     );
  //   } catch (error) {
  //     this.logger.error(`${jobName} failed`, error.stack);
  //   } finally {
  //     this.isRunning = false;
  //   }
  // }

  public async manualRun(): Promise<string> {
    if (
      this.isRunningCompetition ||
      this.isRunningDuplicateEvent ||
      this.isRunningMarket
    ) {
      return 'Another orchestration already running';
    }

    await this.redis.client.del(
      this.COMPETITION_KEY,
      this.DUPLICATE_EVENT_KEY,
      this.MARKET_KEY,
    );
    this.initSportSync();

    return 'Sport sync triggered manually';
  }
}
