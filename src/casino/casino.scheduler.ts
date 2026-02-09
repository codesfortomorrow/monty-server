import { Injectable, UseFilters } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CasinoService } from './casino.service';
import { SentryExceptionFilter, UtilsService } from '@Common';

@Injectable()
export class CasinoScheduler {
  constructor(
    private readonly casinoService: CasinoService,
    private readonly utils: UtilsService,
  ) {}

  @UseFilters(SentryExceptionFilter)
  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshStats() {
    if (!this.utils.isMaster()) {
      return;
    }
    await this.casinoService.refreshMostPlayedMaterializedView();
  }
  // @Cron(CronExpression.EVERY_30_SECONDS)
  // async test() {
  //   console.log('Test Refresh Scheduling');
  // }
}
