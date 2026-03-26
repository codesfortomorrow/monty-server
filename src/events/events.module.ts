import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PrismaModule } from 'src/prisma';
import { EventsProcessor } from './events.processor';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/redis';
import { QueueModule } from 'src/queue';
import { CloseEventProcessor } from './close-event.processor';
import { ActiveEventProcessor } from './active-event.processor';
import { SportsProviderModule } from 'src/sports-provider/sports-provider.module';
import { GliveTvProcessor } from './glive-tv.processor';
import { AlertModule } from 'src/alert/alert.module';
import { GliveEventProcessor } from './glive-event.processor';

@Module({
  imports: [
    QueueModule.registerAsync('close-event'),
    QueueModule.registerAsync('active-event'),
    QueueModule.registerAsync('glive-event'),
    PrismaModule,
    HttpModule,
    RedisModule,
    SportsProviderModule,
    AlertModule,
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsProcessor,
    ActiveEventProcessor,
    CloseEventProcessor,
    GliveTvProcessor,
    GliveEventProcessor,
  ],
  exports: [EventsProcessor, EventsService],
})
export class EventsModule {}
