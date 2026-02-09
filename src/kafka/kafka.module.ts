import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { KafkaController } from './kafka.controller';
import { RedisModule } from 'src/redis';
import { EventsModule } from 'src/events/events.module';
import { MarketMapperModule } from 'src/market-mapper/market-mapper.module';
import { MarketModule } from 'src/market/market.module';

@Module({
  imports: [RedisModule, MarketMapperModule, MarketModule, EventsModule],
  controllers: [KafkaController],
  providers: [KafkaService],
})
export class KafkaModule {}
