import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsProcessor } from './events.processor';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EventBetSuspendedStatusChangeRequest,
  EventInplayStatusChangeRequest,
  EventRequest,
  EventStatusChangeRequest,
  MultipleEventStatusChangeRequest,
} from './dto';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Events')
@UseFilters(SentryExceptionFilter)
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventsProcessor: EventsProcessor,
  ) {}

  @ApiOperation({ summary: 'Only For Manual Fetch' })
  @Post('/insert/manually')
  async fetchCompetitionAndEventsOfDefaultProvider() {
    await this.eventsProcessor.syncEvents();
    return 'Successfully fetched';
  }

  @ApiOperation({ summary: 'Only For Manual Fetch' })
  @Post('/map/duplicate/manually')
  async fetchDuplicateEventMapping() {
    await this.eventsProcessor.fetchDuplicateMap();
    return 'Successfully fetched';
  }

  // UI APIs
  @Get()
  async getEvents(@Query() query: EventRequest) {
    const { pagianatedEvent, pagination } =
      await this.eventsService.getEvents(query);
    return {
      success: true,
      message: 'Events fetched successfully',
      events: pagianatedEvent,
      pagination,
    };
  }

  @Get('/scorecard/:eventId')
  async getScorecard(@Param('eventId', ParseIntPipe) eventId: number) {
    const { response: scorecard, liveTv } =
      await this.eventsService.getScorecard(eventId);
    return {
      success: true,
      message: 'Scorecard fetched successfully',
      scorecard,
      liveTv,
    };
  }

  // Event Management
  @Patch('/:id')
  async changeEventStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EventStatusChangeRequest,
  ) {
    const event = await this.eventsService.changeEventStatus(BigInt(id), body);
    return {
      success: true,
      message: 'Event status changed successfully',
      event,
    };
  }

  @Patch('/inplay/:id')
  async changeInplayStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EventInplayStatusChangeRequest,
  ) {
    const event = await this.eventsService.changeInplayStatus(
      BigInt(id),
      body.status,
    );
    return {
      success: true,
      message: 'Event inplay status changed successfully',
      event,
    };
  }

  @Patch('/popular/:id')
  async changePopularStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EventInplayStatusChangeRequest,
  ) {
    const event = await this.eventsService.changePopularStatus(
      BigInt(id),
      body.status,
    );
    return {
      success: true,
      message: 'Event popular status changed successfully',
      event,
    };
  }

  @Patch('/bet-suspended/:id')
  async changeBetSuspendedStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EventBetSuspendedStatusChangeRequest,
  ) {
    const event = await this.eventsService.changeBetSuspendStatus(
      BigInt(id),
      body.status,
    );
    return {
      success: true,
      message: 'Event bet suspended status changed successfully',
      event,
    };
  }

  @Patch('/multiple/status')
  async updateMultipleEventStatus(
    @Body() body: MultipleEventStatusChangeRequest,
  ) {
    const count = await this.eventsService.multipleEventStatusChange(
      body.eventIds,
      body.status,
    );
    return {
      success: true,
      message: `${count} event(s) status changed successfully`,
    };
  }

  @Get('/popular')
  async getPopularEvents() {
    const events = await this.eventsService.popularEvent();
    return {
      success: true,
      message: 'Popular event fetched successfully',
      events,
    };
  }
}
