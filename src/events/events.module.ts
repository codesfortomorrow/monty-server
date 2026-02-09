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

@Module({
  imports: [
    QueueModule.registerAsync('close-event'),
    QueueModule.registerAsync('active-event'),
    PrismaModule,
    HttpModule,
    RedisModule,
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsProcessor,
    ActiveEventProcessor,
    CloseEventProcessor,
  ],
  exports: [EventsProcessor, EventsService],
})
export class EventsModule {}
