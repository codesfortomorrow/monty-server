import { Module } from '@nestjs/common';
import { BetService } from './bet.service';
import { BetController } from './bet.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { BetconfigModule } from 'src/betconfig/betconfig.module';
import { HttpModule } from '@nestjs/axios';
import { WalletsModule } from 'src/wallets/wallets.module';
import { ExposureModule } from 'src/exposure/exposure.module';
import { UsersModule } from 'src/users';
import { EventsModule } from 'src/events/events.module';
import { MarketModule } from 'src/market/market.module';
import { BetResultModule } from 'src/bet-result/bet-result.module';
import { SportsPermissionModule } from 'src/sports-permission/sports-permission.module';
import { TurnoverModule } from 'src/turnover/turnover.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    BetconfigModule,
    HttpModule,
    WalletsModule,
    ExposureModule,
    UsersModule,
    EventsModule,
    MarketModule,
    BetResultModule,
    SportsPermissionModule,
    TurnoverModule,
  ],
  controllers: [BetController],
  providers: [BetService],
  exports: [BetService],
})
export class BetModule {}
