import { Injectable, UseFilters } from '@nestjs/common';
import { CommissionService } from './commission.service';
import { BaseService, SentryExceptionFilter, UtilsService } from '@Common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CommissionProcessor extends BaseService {
  constructor(
    private readonly commissionService: CommissionService,
    private readonly utils: UtilsService,
  ) {
    super({
      loggerDefaultMeta: { processor: CommissionProcessor.name },
    });
  }

  //Every Wednesday at Midnight
  @UseFilters(SentryExceptionFilter)
  // @Cron('0 0 * * 1')
  // @Cron(CronExpression.EVERY_WEEKEND)
  @Cron('0 1 * * 1')
  async weeklyCommission() {
    if (!this.utils.isMaster()) {
      this.logger.info(
        'Skipping Weekly Commission (not master / not production)',
      );
      return;
    }
    this.logger.info('🚀 Weekly Commission Job: STARTED');
    try {
      // 1. Refresh materialized view
      this.logger.info('🔄 Step 1: Refreshing User Weekly Summary View...');
      await this.commissionService.refreshUserWeeklySummaryView();
      this.logger.info(
        '✅ Step 1 Completed: User Weekly Summary View Refreshed',
      );

      // 2. Update active status of affiliate referrals
      this.logger.info(
        '🔄 Step 2: Updating Active Status of Affiliate Referrals...',
      );
      await this.commissionService.activeStatusOfAffiliateRefral();
      this.logger.info('✅ Step 2 Completed: Active Status Updated');

      // 3. Execute weekly commission batch processing
      this.logger.info('🔄 Step 3: Running Weekly Commission Batch...');
      await this.commissionService.runWeeklyCommissionBatchable();
      this.logger.info('🏁 Step 3 Completed: Weekly Commission Batch Executed');

      this.logger.info('🎉 Weekly Commission Job: COMPLETED SUCCESSFULLY');
    } catch (err) {
      this.logger.error('❌ Weekly Commission Job FAILED');
      this.logger.error(`Error Message: ${err.message}`);
      if (err) this.logger.error(`Stack Trace: ${err}`);
    }
  }

  // @Cron('*/30 * * * * *')
  // async weekly() {
  //   console.log("Cron running every 30 seconds");
  // }
}
