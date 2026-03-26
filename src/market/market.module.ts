import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { MarketProcessor } from './market.processor';
import { PrismaModule } from 'src/prisma';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/redis';
import { EventsModule } from 'src/events/events.module';
import { AlertModule } from 'src/alert/alert.module';

@Module({
  imports: [PrismaModule, HttpModule, RedisModule, EventsModule, AlertModule],
  controllers: [MarketController],
  providers: [MarketService, MarketProcessor],
  exports: [MarketProcessor, MarketService],
})
export class MarketModule {}
