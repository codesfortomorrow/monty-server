import { BaseService, SentryExceptionFilter, UtilsService } from '@Common';
import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  UseFilters,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CompetitionsProcessor } from 'src/competitions/competitions.processor';
import { EventsProcessor } from 'src/events/events.processor';
import { MarketProcessor } from 'src/market/market.processor';

@Injectable()
export class SportsOrchestratorProcessorService
  extends BaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private isShuttingDown = false;
  private isRunning = false;

  constructor(
    private readonly utils: UtilsService,
    private readonly competitionsProcessor: CompetitionsProcessor,
    private readonly eventsProcessor: EventsProcessor,
    private readonly marketsProcessor: MarketProcessor,
  ) {
    super({
      loggerDefaultMeta: { service: SportsOrchestratorProcessorService.name },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.utils.isMaster() || !this.utils.isProductionApp()) {
      this.logger.info(
        'Skipping orchestrator bootstrap (not master / not production)',
      );
      return;
    }

    this.logger.info('Sports Orchestrator bootstrapped successfully');
  }

  async onApplicationShutdown(signal: string): Promise<void> {
    this.logger.warn(`Shutdown signal received: ${signal}`);
    this.isShuttingDown = true;
  }

  @UseFilters(SentryExceptionFilter)
  @Cron(CronExpression.EVERY_2_HOURS, { name: 'competitions-sync' })
  async syncCompetitions() {
    if (!this.utils.isMaster()) return;

    await this.safeRun('Competitions Sync', async () => {
      await this.competitionsProcessor.fetchCompetitionAndEventsOfDeafultProvider();
      await this.competitionsProcessor.handleCompetitionSync();
      await this.competitionsProcessor.fetchRaceMarketCompttionAndEvents();
    });
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
  @Cron(CronExpression.EVERY_2_HOURS, { name: 'markets-sync' })
  async syncMarkets() {
    if (!this.utils.isMaster()) return;

    await this.safeRun('Markets Sync', async () => {
      await this.marketsProcessor.syncMarkets();
    });
  }

  @UseFilters(SentryExceptionFilter)
  @Cron(CronExpression.EVERY_3_HOURS, { name: 'markets-sync' })
  async syncRaceMarkets() {
    if (!this.utils.isMaster()) return;

    await this.safeRun('Markets Sync', async () => {
      await this.marketsProcessor.syncRaceMarkets();
    });
  }

  @UseFilters(SentryExceptionFilter)
  @Cron(CronExpression.EVERY_2_HOURS, { name: 'duplicate-event-mapping' })
  async syncDuplicateEvents() {
    if (!this.utils.isMaster()) return;

    await this.safeRun('Duplicate Event Mapping', async () => {
      await this.eventsProcessor.fetchDuplicateMap();
    });
  }

  private async safeRun(
    jobName: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn(`${jobName} skipped (shutdown in progress)`);
      return;
    }

    if (this.isRunning) {
      this.logger.warn(`${jobName} skipped (another job already running)`);
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info(`START ${jobName}`);
      await fn();
      this.logger.info(
        `END ${jobName} in ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      );
    } catch (error) {
      this.logger.error(`${jobName} failed`, error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  public async manualRun(): Promise<string> {
    if (this.isRunning) {
      return 'Another orchestration already running';
    }

    this.syncMarkets();
    return 'Markets sync triggered manually';
  }
}
