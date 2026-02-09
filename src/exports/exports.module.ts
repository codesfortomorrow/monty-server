import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { CasinoModule } from 'src/casino/casino.module';
import { TransactionsModule } from 'src/transactions/transactions.module';
import { WalletTransactionsModule } from 'src/wallet-transactions';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { BankerModule } from 'src/banker/banker.module';
import { ReportsModule } from 'src/reports/reports.module';
import { UsersModule } from 'src/users';
import { ActivityModule } from 'src/activity';
import { BussinessReportModule } from 'src/bussiness-report/bussiness-report.module';
import { AffiliateModule } from 'src/affiliate/affiliate.module';
import { BonusModule } from 'src/bonus/bonus.module';

@Module({
  imports: [
    PrismaModule,
    CasinoModule,
    TransactionsModule,
    WalletTransactionsModule,
    UsersModule,
    BankerModule,
    ActivityModule,
    ReportsModule,
    BussinessReportModule,
    AffiliateModule,
    BonusModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
