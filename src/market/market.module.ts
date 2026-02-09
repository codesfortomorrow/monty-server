import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { MarketProcessor } from './market.processor';
import { PrismaModule } from 'src/prisma';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/redis';
import { EventsModule } from 'src/events/events.module';
import { QueueModule } from 'src/queue';
import { PremiumMarketProcessor } from './premium-market.processor';
import { AlertModule } from 'src/alert/alert.module';

@Module({
  imports: [
    QueueModule.registerAsync('premium-market'),
    PrismaModule,
    HttpModule,
    RedisModule,
    EventsModule,
    AlertModule,
  ],
  controllers: [MarketController],
  providers: [MarketService, MarketProcessor, PremiumMarketProcessor],
  exports: [MarketProcessor, MarketService],
})
export class MarketModule {}
