import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { Event, Prisma, StatusType } from '@prisma/client';
import { EventRequest, EventStatusChangeRequest } from './dto';
import { ConfigType } from '@nestjs/config';
import { sportConfigFactory } from '@Config';
import { BaseService, Pagination, UtilsService } from '@Common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getSportEnum, getStatusEnum } from 'src/utils/sports';
import dayjs from 'dayjs';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class EventsService extends BaseService {
  private readonly CACHE_TTL = 60 * 1; // 1 minutes
  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
    private readonly redis: RedisService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
    @InjectQueue('close-event')
    private readonly closeEventQueue: Queue,
    @InjectQueue('active-event')
    private readonly activeEventQueue: Queue,
  ) {
    super({ loggerDefaultMeta: { service: EventsService.name } });
  }

  async getEvents(query: EventRequest) {
    const redisKey = `events:${query.sport || 'all'}:${query.competitionId || 'all'}:${query.status || 'ALL'}:${query.search || 'null'}:${query.inplay || 'all'}:${query.page || '1'}:${query.limit || '10'}`;
    const data = await this.redis.client.get(redisKey);
    if (data) {
      return JSON.parse(data);
    }

    const where: Prisma.EventWhereInput = {
      markets: {
        some: {},
      },
    };

    if (query.sport) where.sport = query.sport;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.inplay !== undefined) where.inplay = query.inplay === 'true';
    if (query.competitionId) where.competitionId = query.competitionId;
    if (query.status) {
      switch (query.status) {
        case 'ACTIVE':
          where.status = {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Upcoming,
              StatusType.Open,
            ],
          };
          break;
        case 'INACTIVE':
          where.status = StatusType.Inactive;
          break;
        case 'UPCOMING':
          where.status = {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Upcoming,
              StatusType.Open,
            ],
          };
          const now = dayjs();
          where.startTime = {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            lte: now.add(3, 'days').toDate(),
          };
          where.inplay = false;
          break;
        default:
          where.status = undefined;
      }
    }

    // ✅ Fetch from DB
    const events = await this.prisma.event.findMany({
      where,
      include: {
        betfairMapping: true,
        sportsRadarMapping: true,
        competition: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // -------------------------
    // Remove duplicates
    // -------------------------
    const filteredEvents = events.filter((event) => {
      // 1️⃣ Keep unmapped events
      if (!event.betfairMapping && !event.sportsRadarMapping) {
        return true;
      }

      // 2️⃣ Keep Betfair event (has betfairMapping)
      if (event.betfairMapping) {
        return true;
      }

      // 3️⃣ Remove SportsRadar duplicate (only sportsRadarMapping exists)
      return false;
    });

    // Bet Mapping
    const eventIds = filteredEvents.map((e) => e.id);

    // 1️⃣ Total bets per event
    const betCount = await this.prisma.bet.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds } },
      _count: { id: true },
    });

    // const betCount = await this.prisma.bet.groupBy({
    //   by: ['eventId'],
    //   where: {
    //     eventId: { in: eventIds },
    //     user: {
    //       role: {
    //         name: {
    //           not: 'DEMO',
    //         },
    //       },
    //     },
    //   },
    //   _count: {
    //     id: true,
    //   },
    // });

    // Convert to map: eventId -> total bets
    const betCountMap = Object.fromEntries(
      betCount.map((b) => [String(b.eventId), b._count.id]),
    );

    // 2️⃣ Unique users per event
    const userBets = await this.prisma.bet.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, userId: true },
    });

    // 2️⃣ Unique users per event (excluding DEMO users)
    // const userBets = await this.prisma.bet.findMany({
    //   where: {
    //     eventId: { in: eventIds },
    //     user: {
    //       role: {
    //         name: {
    //           not: 'DEMO',
    //         },
    //       },
    //     },
    //   },
    //   select: {
    //     eventId: true,
    //     userId: true,
    //   },
    //   distinct: ['eventId', 'userId'],
    // });

    // Convert to map: eventId -> Set(uniqueUserIds)
    const userOnlineMap: Record<string, Set<string>> = {};
    for (const row of userBets) {
      const key = String(row.eventId);
      if (!userOnlineMap[key]) userOnlineMap[key] = new Set();
      userOnlineMap[key].add(row.userId.toString());
    }

    // ----------------------------------------------------
    // Attach stats to each event
    // ----------------------------------------------------
    const finalEvents = filteredEvents.map((event) => {
      const id = String(event.id);
      return {
        ...event,
        totalBets: betCountMap[id] || 0,
        userOnline: userOnlineMap[id]?.size || 0,
      };
    });

    // Pagination
    const page = query.page && Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query.limit || 10);
    const skip = (page - 1) * limit;
    const take = page * limit;

    const pagianatedEvent = finalEvents.slice(skip, take);
    const total = finalEvents.length;

    const pagination: Pagination = {
      currentPage: page,
      limit,
      totalItems: total,
      totalPage: Math.ceil(total / limit),
    };

    // ✅ Store in cache
    await this.redis.client.setex(
      redisKey,
      this.CACHE_TTL,
      JSON.stringify({ pagianatedEvent, pagination }),
    );

    return { pagianatedEvent, pagination };
  }

  async getScorecard(eventId: number) {
    const redisKey = `scorecard:${eventId}`;
    const data = await this.redis.client.get(redisKey);
    if (data) {
      return JSON.parse(data || '{}');
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new Error('Event not found');
    if (event.providerId || !event.inplay)
      throw new Error('Scorecard not available for this match');

    const url = `${this.sportConfig.sportBaseUrl}/event/scorecards?matchId=${event.externalId}`;

    try {
      const response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(this.http.get(url));
        return res.data;
      }, 3);
      if (!response) {
        this.logger.warn(`⚠️ No scorecard data found for ${event.name}`);
        return null;
      }
      let liveTv;
      // console.log(event.providerId, event.inplay);
      // if (event.providerId || !event.inplay) liveTv = null;
      // else liveTv = `https://video.starrexch.me/?eventid=${event.externalId}`;
      await this.redis.client.setex(
        redisKey,
        2 * 24 * 60 * 60,
        JSON.stringify({ response, liveTv }),
      );
      return { response, liveTv };
    } catch (error) {
      this.logger.error(
        `Failed to get scorecard data for event ${event.name} (sport=${event.sport}): ${error?.message ?? error}`,
      );
      return null;
    }
  }

  async closedEvent(eventExternalId: string, sport: string) {
    try {
      const event = await this.prisma.event.findFirst({
        where: {
          externalId: eventExternalId,
          sport: getSportEnum(sport),
        },
      });
      if (!event) return;
      await this.prisma.event.update({
        where: {
          id: event.id,
        },
        data: {
          status: StatusType.Closed,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error to closed event by mqtt updates: ${error.message}`,
      );
    }
  }

  async getById(id: bigint | number) {
    return await this.prisma.event.findUnique({
      where: { id },
    });
  }

  async getByExternalId(externalId: string) {
    const redisKey = `event:${externalId}`;
    const data = await this.redis.client.get(redisKey);
    if (data) {
      try {
        const events = JSON.parse(data) as Event[] | null;
        return events ? events?.[0] : null;
      } catch (error) {
        this.logger.warn(
          `Error to parse event (${externalId}), error: ${error.message}`,
        );
      }
    }
    const event = await this.prisma.event.findFirst({
      where: { externalId },
    });
    await this.redis.client.setex(redisKey, 5 * 60, JSON.stringify([event])); // 5 min;
    return event;
  }

  async getEventsByExternalId(externalId: string) {
    const redisKey = `event:${externalId}`;
    const data = await this.redis.client.get(redisKey);
    if (data) {
      try {
        const events = JSON.parse(data) as Event[] | null;
        return events;
      } catch (error) {
        this.logger.warn(
          `Error to parse event (${externalId}), error: ${error.message}`,
        );
      }
    }
    const events = await this.prisma.event.findMany({
      where: { externalId },
    });
    await this.redis.client.setex(redisKey, 5 * 60, JSON.stringify(events)); // 5 min;
    return events;
  }

  // Event Management
  async changeEventStatus(eventId: bigint, data: EventStatusChangeRequest) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new Error('Event not found');
    const update: Prisma.EventUpdateInput = {};
    if (data.status)
      update.status =
        data.status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive;
    if (data.isSubscribed) update.isSubscribed = data.isSubscribed === 'true';
    const updatedEvent = await this.prisma.event.update({
      where: { id: eventId },
      data: update,
    });

    const lockKey = `market:sync:lock:${event.externalId}`;
    const redisKey = `events:*`;
    const fixtureKey = `fixture:*`;
    // const redisKeyForAll = `events:all:*`;
    await this.redis.client.del(lockKey);
    await this.redis.deleteKeysByPattern(redisKey);
    await this.redis.deleteKeysByPattern(fixtureKey);
    return updatedEvent;
  }

  async changeInplayStatus(eventId: bigint, status: 'ACTIVE' | 'INACTIVE') {
    const event = await this.getById(eventId);
    if (!event) throw new Error('Event not found');
    const inplayStatus = status === 'ACTIVE';
    const updatedEvent = await this.prisma.event.update({
      where: { id: event.id },
      data: { inplay: inplayStatus },
    });
    const redisKey = `events:*`;
    // const redisKeyForAll = `events:all:*`;
    await this.redis.deleteKeysByPattern(redisKey);
    return updatedEvent;
  }

  async changePopularStatus(eventId: bigint, status: 'ACTIVE' | 'INACTIVE') {
    const event = await this.getById(eventId);
    if (!event) throw new Error('Event not found');
    const popularStatus = status === 'ACTIVE';
    const updatedEvent = await this.prisma.event.update({
      where: { id: event.id },
      data: { isPopular: popularStatus },
    });
    const redisKey = `events:*`;
    // const redisKeyForAll = `events:all:*`;
    await this.redis.deleteKeysByPattern(redisKey);
    return updatedEvent;
  }

  async changeBetSuspendStatus(
    eventId: bigint,
    status: 'ACTIVE' | 'SUSPENDED',
  ) {
    const event = await this.getById(eventId);
    if (!event) throw new Error('Event not found');
    const betSuspendedStatus = status === 'SUSPENDED';
    const updatedEvent = await this.prisma.event.update({
      where: { id: event.id },
      data: { isBetSuspended: betSuspendedStatus },
    });
    const redisKey = `events:*`;
    // const redisKeyForAll = `events:all:*`;
    await this.redis.deleteKeysByPattern(redisKey);
    return updatedEvent;
  }

  async multipleEventStatusChange(
    eventIds: number[],
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    const statusType =
      status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive;
    const res = await this.prisma.event.updateManyAndReturn({
      where: { id: { in: eventIds } },
      data: { status: statusType },
      select: { id: true },
    });

    const redisKey = `events:*`;
    const fixtureKey = `fixture:*`;
    // const redisKeyForAll = `events:all:*`;
    await this.redis.deleteKeysByPattern(redisKey);
    await this.redis.deleteKeysByPattern(fixtureKey);
    return res.length;
  }

  async popularEvent() {
    const events = await this.prisma.event.findMany({
      where: {
        isPopular: true,
        status: {
          in: [
            StatusType.Active,
            StatusType.Live,
            StatusType.Upcoming,
            StatusType.Open,
          ],
        },
        markets: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        sport: true,
      },
    });
    return events;
  }

  async checkAndCloseEvent(externalId: string) {
    try {
      await this.closeEventQueue.add(
        'event-close',
        {
          eventExternalId: externalId,
        },
        {
          jobId: `close-${externalId}`,
        },
      );
    } catch (error) {
      this.logger.error(`Error to initialize close event job, ${error}`);
    }
  }
  async checkAndActiveEvent(externalId: string) {
    try {
      await this.activeEventQueue.add(
        'event-active',
        {
          eventExternalId: externalId,
        },
        {
          jobId: `active-${externalId}`,
        },
      );
      this.logger.info(`Initialize event to be active, eventId ${externalId}`);
    } catch (error) {
      this.logger.error(`Error to initialize active event job, ${error}`);
    }
  }
}
