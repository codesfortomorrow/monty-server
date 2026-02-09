import { Module } from '@nestjs/common';
import { BetResultService } from './bet-result.service';
import { BetResultController } from './bet-result.controller';
import { PrismaModule } from 'src/prisma';
import { WalletsModule } from 'src/wallets/wallets.module';
import { EventsModule } from 'src/events/events.module';
import { MarketModule } from 'src/market/market.module';
import { BetResultProccessor } from './bet-result.processor';
import { TurnoverModule } from 'src/turnover/turnover.module';
import { RedisModule } from 'src/redis';
// import { BonusModule } from 'src/bonus/bonus.module';
import { BonusModule } from 'src/bonus/bonus.module';
import { SettledBetBatchProcessor } from './bet-partnership.processor';
import { AlertModule } from 'src/alert/alert.module';
import { UsersModule } from 'src/users';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    EventsModule,
    MarketModule,
    TurnoverModule,
    RedisModule,
    // BonusModule,
    BonusModule,
    AlertModule,
    UsersModule,
  ],
  controllers: [BetResultController],
  providers: [BetResultService, BetResultProccessor, SettledBetBatchProcessor],
  exports: [BetResultService],
})
export class BetResultModule {}
