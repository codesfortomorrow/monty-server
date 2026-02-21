import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { FixtureRequest } from './dto';
import { MarketType, Prisma, StatusType } from '@prisma/client';
import { OddsService } from 'src/odds/odds.service';
import dayjs from 'dayjs';
// import { EventResponse } from 'src/odds/odds.type';
import { BaseService } from '@Common';

@Injectable()
export class FixtureService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly oddsService: OddsService,
  ) {
    super({ loggerDefaultMeta: { service: FixtureService.name } });
  }

  async getFixtureDetails(query: FixtureRequest) {
    const apiStart = Date.now();

    try {
      const { sport, search, inplay, competitionId, matchTime } = query;

      const cacheKey = `fixture:${sport || 'all'}:${search || 'all'}:${inplay || 'all'}:${competitionId || 'all'}:${matchTime || 'all'}`;
      const cacheTTL = 120; // 2 minutes

      // 🔴 IMPORTANT: null rakho, [] mat rakho
      let events: any[] | null = null;

      // -----------------------------
      // 🔍 REDIS CACHE (WITH TIMEOUT)
      // -----------------------------
      const redisStart = Date.now();
      let cached: string | null = null;

      try {
        cached = await Promise.race([
          this.redis.client.get(cacheKey),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject('REDIS_TIMEOUT'), 300),
          ),
        ]);
      } catch {
        cached = null;
      }

      console.log('⏱ Redis fixture get:', Date.now() - redisStart, 'ms');

      if (cached) {
        events = JSON.parse(cached);
      }

      // -----------------------------
      // 🧠 DB QUERY (WILL RUN PROPERLY)
      // -----------------------------
      if (!events || events.length === 0) {
        const where: Prisma.EventWhereInput = {
          startTime: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          },
          status: {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Open,
              StatusType.Upcoming,
            ],
          },
          competition: {
            deletedAt: null,
          },
          // OR: [
          //   { betfairMapping: { isNot: null } },
          //   {
          //     betfairMapping: null,
          //     sportsRadarMapping: null,
          //   },
          // ],
        };

        if (sport) where.sport = sport;
        if (competitionId) where.competitionId = competitionId;
        if (inplay) where.inplay = inplay === 'true';

        if (search) {
          where.AND = [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                {
                  competition: {
                    name: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            },
          ];
        }

        if (matchTime) {
          const now = dayjs();
          if (matchTime === 'today') {
            where.startTime = {
              gte: now.startOf('day').toDate(),
              lte: now.endOf('day').toDate(),
            };
          } else {
            where.startTime = {
              gt: now.endOf('day').toDate(),
            };
          }
        }

        const dbStart = Date.now();
        const dbEvents = await this.prisma.event.findMany({
          where,
          orderBy: { startTime: 'asc' },
          include: {
            competition: {
              select: {
                id: true,
                name: true,
                externalId: true,
                startDate: true,
              },
            },

            betfairMapping: true,
            sportsRadarMapping: true,

            markets: {
              where: {
                NOT: { type: MarketType.Premium },
              },
              select: {
                id: true,
                name: true,
                externalId: true,
                runner: true,
              },
            },
          },
          take: 500,
        });

        // -------------------------
        // Remove duplicates
        // -------------------------
        events = dbEvents.filter((event) => {
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

        console.log('⏱ Prisma query:', Date.now() - dbStart, 'ms');
        console.log('📦 Events count:', events.length, sport);

        // ⚠️ NOTE: abhi same data cache kar rahe hain
        // (next step me isko light cache bana denge)
        await this.redis.client.setex(
          cacheKey,
          cacheTTL,
          JSON.stringify(events),
        );
      }

      // -----------------------------
      // 🔥 ODDS ATTACH
      // -----------------------------
      const oddsStart = Date.now();
      const enriched = await this.oddsService.mapEventsWithMatchOdds(events);
      console.log('⏱ Odds mapping:', Date.now() - oddsStart, 'ms');

      console.log('🚀 TOTAL API TIME:', Date.now() - apiStart, 'ms');
      return enriched;
    } catch (error) {
      console.error('❌ getFixtureDetails error:', error);
      throw error;
    }
  }

  async getRaceFixtureDetails(query: FixtureRequest) {
    const apiStart = Date.now();

    try {
      const { sport, search, inplay, competitionId, matchTime } = query;

      const cacheKey = `fixture:${sport || 'all'}:${search || 'all'}:${inplay || 'all'}:${competitionId || 'all'}:${matchTime || 'all'}`;
      const cacheTTL = 120;

      let events: any[] | null = null; // -----------------------------
      // :mag: REDIS CACHE (WITH TIMEOUT)
      // -----------------------------

      const redisStart = Date.now();
      let cached: string | null = null;

      try {
        cached = await Promise.race([
          this.redis.client.get(cacheKey),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject('REDIS_TIMEOUT'), 300),
          ),
        ]);
      } catch {
        cached = null;
      } // console.log(':stopwatch: Redis fixture get:', Date.now() - redisStart, 'ms');

      if (cached) {
        events = JSON.parse(cached);
      } // -----------------------------
      // :brain: DB QUERY (WILL RUN PROPERLY)
      // -----------------------------

      if (!events || events.length === 0) {
        const where: Prisma.EventWhereInput = {
          startTime: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          },
          status: {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Open,
              StatusType.Upcoming,
            ],
          },
          competition: {
            deletedAt: null,
          },
        };

        if (sport) where.sport = sport;
        if (competitionId) where.competitionId = competitionId;
        if (inplay) where.inplay = inplay === 'true';

        if (search) {
          where.AND = [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                {
                  competition: {
                    name: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            },
          ];
        }

        if (matchTime) {
          const now = dayjs();
          if (matchTime === 'today') {
            where.startTime = {
              gte: now.startOf('day').toDate(),
              lte: now.endOf('day').toDate(),
            };
          } else {
            where.startTime = {
              gt: now.endOf('day').toDate(),
            };
          }
        }

        const dbStart = Date.now();
        events = await this.prisma.event.findMany({
          where,
          orderBy: { startTime: 'asc' },
          select: {
            id: true,
            name: true,
            externalId: true,
            sport: true,
            status: true,
            startTime: true,
            inplay: true,
            isFancy: true,
            isBookmaker: true,
            isPremiumFancy: true,
            isPopular: true,
            competitionId: true,
            providerId: true,

            competition: {
              select: {
                id: true,
                name: true,
                externalId: true,
                startDate: true,
              },
            },

            markets: {
              select: {
                id: true,
                name: true,
                externalId: true,
                startTime: true,
                runner: true,
              },
            },
          },
          take: 500,
        }); // console.log(':stopwatch: Prisma query:', Date.now() - dbStart, 'ms');
        // console.log(':package: Events count:', events.length, sport);

        await this.redis.client.setex(
          cacheKey,
          cacheTTL,
          JSON.stringify(events),
        );
      }
      console.log('Before filter race market', JSON.stringify(events));
      const enriched = await this.oddsService.filterRaceMarket(events);
      console.log('After filter race market', JSON.stringify(enriched));
      return enriched;
    } catch (error) {
      console.error(':x: getFixtureDetails error:', error);
      throw error;
    }
  }
}
