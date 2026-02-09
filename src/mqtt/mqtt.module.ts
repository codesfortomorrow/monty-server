import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { RedisModule } from 'src/redis';
import { MarketMapperModule } from 'src/market-mapper/market-mapper.module';
import { MarketModule } from 'src/market/market.module';
import { EventsModule } from 'src/events/events.module';

@Module({
  imports: [RedisModule, MarketMapperModule, MarketModule, EventsModule],
  providers: [MqttService],
})
export class MqttModule {}
