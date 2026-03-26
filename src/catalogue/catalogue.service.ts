import { Injectable } from '@nestjs/common';
import { OddsService } from 'src/odds/odds.service';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { CatalogueRequest } from './dto';
import { MarketType, Prisma, SportType, StatusType } from '@prisma/client';
import { BaseService } from '@Common';
import { BetconfigService } from 'src/betconfig/betconfig.service';
import { MarketService } from 'src/market/market.service';

@Injectable()
export class CatalogueService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly oddsService: OddsService,
    private readonly marketService: MarketService,
    private readonly betConfigService: BetconfigService,
  ) {
    super({ loggerDefaultMeta: { service: CatalogueService.name } });
  }

  async getCatalogueDetails(eventId: number, query: CatalogueRequest) {
    try {
      const { sport, search, inplay, matchTime } = query;

      const cacheKey = `catalogue:${eventId || 'all'}:${sport || 'all'}:${search || 'all'}:${inplay || 'all'}:${matchTime || 'all'}`;
      const cacheTTL = 30; // 30 seconds TTL
      let events;

      // 🔍 Try Redis first
      const cached = await this.redis.client.get(cacheKey);
      if (cached) events = JSON.parse(cached);

      if (!events) {
        // 🧩 Build Prisma query
        const where: Prisma.EventWhereInput = {
          id: eventId,
          status: {
            in: [
              StatusType.Active,
              StatusType.Live,
              StatusType.Open,
              StatusType.Upcoming,
            ],
          },
        };

        //   if (sport) where.sport = sport;
        //   if (competitionId) where.competitionId = competitionId;

        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            //   {
            //     competition: { name: { contains: search, mode: 'insensitive' } },
            //   },
          ];
        }

        //   if (inplay) where.inplay = inplay === 'true';
        //   if (matchTime) {
        //     const now = dayjs();
        //     if (matchTime === 'today')
        //       where.startTime = {
        //         gte: now.startOf('day').toDate(),
        //         lte: now.endOf('day').toDate(),
        //       };
        //     else
        //       where.startTime = {
        //         gt: now.endOf('day').toDate(),
        //       };
        //   }

        events = await this.prisma.event.findFirst({
          where,
          include: {
            competition: {
              select: {
                id: true,
                name: true,
                externalId: true,
                startDate: true,
              },
            },
            markets: {
              where: {
                status: {
                  not: StatusType.Inactive,
                },
                type: {
                  not: MarketType.Premium,
                },
              },
              omit: {
                createdAt: true,
                updatedAt: true,
              },
            },
          },
          omit: {
            createdAt: true,
            updatedAt: true,
          },
        });

        if (!events) throw new Error('Event not found');
        // ✅ Cache for 5 mins
        await this.redis.client.setex(
          cacheKey,
          cacheTTL,
          JSON.stringify(events),
        );
      }

      // ✅ Attach odds & Attach Bet Config

      const [[enriched], betConfig] = await Promise.all([
        this.oddsService.mapEventsWithOdds([events]),
        this.betConfigService.getbetConfigByEventIdOrDefault(eventId),
      ]);
      // const [enriched] = await this.oddsService.mapEventsWithOdds([events]);

      // Attach Bet Config
      // const betConfig =
      //   await this.betConfigService.getbetConfigByEventIdOrDefault(enriched.id);

      const minBetAmount = enriched.inplay
        ? betConfig.inPlayMinBetAmount
        : betConfig.offPlayMinBetAmount;
      const maxBetAmount = enriched.inplay
        ? betConfig.inPlayMaxBetAmount
        : betConfig.offPlayMaxBetAmount;
      const sessionMinBetAmount = enriched.inplay
        ? betConfig.sessionInPlayMinBetAmount
        : betConfig.sessionOffPlayMinBetAmount;
      const sessionMaxBetAmount = enriched.inplay
        ? betConfig.sessionInPlayMaxBetAmount
        : betConfig.sessionOffPlayMaxBetAmount;

      if (
        events.sport === SportType.Cricket ||
        events.sport === SportType.Soccer ||
        events.sport === SportType.Tennis
      )
        await this.marketService.checkAndSubscribeMarket(enriched.externalId);

      return {
        catalogue: enriched,
        betConfig: {
          minBetAmount,
          maxBetAmount,
          sessionMinBetAmount,
          sessionMaxBetAmount,
          minRate: betConfig.maxRate,
          maxRate: betConfig.maxRate,
          sessionMinRate: betConfig.sessionMinRate,
          sessionMaxRate: betConfig.sessionMaxRate,
        },
      };
    } catch (error: any) {
      this.logger.error(`Error to get catalogue: ${error.message}`);
      throw new Error();
    }
  }

  async getMarketCatalogue(eventId: number, query: CatalogueRequest) {
    try {
      const { search, marketId, marketType } = query;

      let events;

      if (!events) {
        // 🧩 Build Prisma query
        const where: Prisma.EventWhereInput = {
          id: eventId,
          // status: {
          //   in: [
          //     StatusType.Active,
          //     StatusType.Live,
          //     StatusType.Open,
          //     StatusType.Upcoming,
          //   ],
          // },
        };

        if (search) {
          where.OR = [{ name: { contains: search, mode: 'insensitive' } }];
        }

        events = await this.prisma.event.findFirst({
          where,
          include: {
            competition: true,
            markets: {
              where: {
                ...(marketId && { externalId: marketId }),
              },
            },
          },
        });

        if (!events) throw new Error('Event not found');
      }

      // ✅ Attach odds
      const [enriched] = await this.oddsService.mapEventsWithOdds([events]);
      if (marketType && marketType.toLowerCase() === 'normal') {
        enriched.markets = this.filterMarketRecord(enriched.markets, marketId);
      }

      // if (marketType && marketType.toLowerCase() === 'premium') {
      //   enriched.premiumMarket = this.filterMarketRecord(
      //     enriched.premiumMarket,
      //     marketId,
      //   );
      // }

      if (marketType && marketType.toLowerCase() === 'fancy') {
        enriched.fancyMarkets = this.filterMarketRecord(
          enriched.fancyMarkets,
          marketId,
        );
      }

      if (
        events.sport === SportType.Cricket ||
        events.sport === SportType.Soccer ||
        events.sport === SportType.Tennis ||
        events.sport === SportType.Greyhound ||
        events.sport === SportType.HorseRacing
      )
        await this.marketService.checkAndSubscribeMarket(enriched.externalId);

      return enriched;
    } catch (error: any) {
      this.logger.error(`Error to get catalogue: ${error.message}`);
      throw new Error();
    }
  }
  filterMarketRecord<T>(record: Record<string, T[]>, marketId?: string) {
    if (!marketId) return record;

    const filtered: Record<string, T[]> = {};

    for (const key of Object.keys(record || {})) {
      const matched = record[key]?.filter((m: any) => m.marketId === marketId);

      if (matched?.length) {
        filtered[key] = matched;
      }
    }

    return filtered;
  }
}
