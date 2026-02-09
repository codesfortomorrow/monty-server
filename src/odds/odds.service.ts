import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/redis';
import {
  EventResponse,
  ExtraMarketData,
  FancyMarketData,
  MainMarketData,
  MarketRunner,
  Odds,
  RunnerOdds,
} from './odds.type';
import { Competition, Event, Market, MarketType } from '@prisma/client';
import { UtilsService } from '@Common';
import {
  ExtraMarket,
  FancyMarket,
  MarketData,
  OddsPayload,
  Price,
  Runner,
} from 'src/market-mapper/market.type';
import { PrismaService } from 'src/prisma';
import { targetMarkets } from 'src/utils/market';
import e from 'express';

@Injectable()
export class OddsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly utils: UtilsService,
  ) {}
  async getOddsByEvent(
    externalEventId: string,
    externalMarketId: string,
    // options?: {
    //   onlyViewableMarkets?: boolean;
    // },
  ) {
    const redisKey = `odds:${externalEventId}:${externalMarketId}`;
    const [data] = await this.redis.client.mget(redisKey);
    if (!data) return null;

    const odds = JSON.parse(data) as Odds;
    // if (options?.onlyViewableMarkets) {
    //   odds.data = odds.filter((market) =>
    //     [MarketStatus.Active, MarketStatus.Suspended].includes(market.status),
    //   );
    // }

    return odds;
  }

  async mapEventsWithOdds(
    events: (Event & { markets: Market[]; competition?: Competition | null })[],
  ) {
    const apiStart = Date.now();

    if (!events?.length) return [];

    const enrichedEvents = await this.utils.batchable(events, async (event) => {
      const eventStart = Date.now();
      const eventId = event.externalId;

      // ------------------------------------------------
      // 1️⃣ BUILD REDIS KEYS (NO KEYS COMMAND ❌)
      // ------------------------------------------------
      const keyBuildStart = Date.now();

      const marketKeys = event.markets.map(
        (m) => `odds:${eventId}:${m.externalId}`,
      );
      const extraKey = `extra:${eventId}`;
      const fancyKey = `fancy:${eventId}`;

      const allKeys = [...marketKeys, extraKey, fancyKey];

      // console.log(
      //   `⏱ [${eventId}] Key build:`,
      //   Date.now() - keyBuildStart,
      //   'ms | keys:',
      //   allKeys.length,
      // );

      if (!allKeys.length) return null;

      // ------------------------------------------------
      // 2️⃣ REDIS MGET IN BATCHES (40–50) 🔥
      // ------------------------------------------------
      const redisStart = Date.now();

      const BATCH_SIZE = 50;
      const redisValues: (string | null)[] = [];

      for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
        const batch = allKeys.slice(i, i + BATCH_SIZE);
        const batchStart = Date.now();

        const res = await this.redis.client.mget(...batch);
        redisValues.push(...res);

        //   console.log(
        //     `⏱ [${eventId}] Redis MGET batch (${batch.length} keys):`,
        //     Date.now() - batchStart,
        //     'ms',
        //   );
      }

      // console.log(
      //   `⏱ [${eventId}] TOTAL Redis fetch:`,
      //   Date.now() - redisStart,
      //   'ms',
      // );

      // ------------------------------------------------
      // 3️⃣ PARSE REDIS DATA
      // ------------------------------------------------
      const parseStart = Date.now();
      const parsed = new Map<string, any>();

      allKeys.forEach((key, idx) => {
        const val = redisValues[idx];
        if (!val) return;
        try {
          parsed.set(key, JSON.parse(val));
        } catch {}
      });

      // console.log(
      //   `⏱ [${eventId}] Redis parse:`,
      //   Date.now() - parseStart,
      //   'ms',
      // );

      // ------------------------------------------------
      // 4️⃣ MAP MARKETS
      // ------------------------------------------------
      const mapStart = Date.now();

      const mainMarkets: MainMarketData[] = this.mapMainMarket(
        event.externalId,
        event.markets,
        parsed,
      );

      const extraMarkets: ExtraMarketData[] = [];
      const fancyMarkets: FancyMarketData[] = [];

      if (parsed.has(extraKey)) {
        const extra = parsed.get(extraKey) as { data: ExtraMarket[] };
        if (Array.isArray(extra?.data)) {
          extraMarkets.push(
            ...extra.data
              .map(this.mapExtraMarket)
              .filter(
                (m) =>
                  m.marketId &&
                  !m.status?.toLowerCase().startsWith('close') &&
                  m.runners,
              ),
          );
        }
      }

      if (parsed.has(fancyKey)) {
        const fancy = parsed.get(fancyKey) as { data: FancyMarket[] };
        if (Array.isArray(fancy?.data)) {
          fancyMarkets.push(
            ...fancy.data
              .map(this.mapFancyMarket)
              .filter(
                (f) =>
                  f.marketId &&
                  !f.gameStatus?.toLowerCase().startsWith('close'), // &&
                // f.runners &&
                // (f.runners.back?.length || f.runners.lay?.length),
              )
              .sort((a, b) => {
                const aSort = a.sortPriority ?? 0;
                const bSort = b.sortPriority ?? 0;
                return aSort - bSort;
              }),
          );
        }
      }

      // console.log(
      //   `⏱ [${eventId}] Market mapping:`,
      //   Date.now() - mapStart,
      //   'ms',
      // );

      // ------------------------------------------------
      // 5️⃣ FINAL RESPONSE
      // ------------------------------------------------
      const inplay = mainMarkets.some((m) => m.inplay) || event.inplay;

      const mappedDbMarket = event.markets.map(this.mapDBMainMarket);

      // console.log(
      //   `🚀 [${eventId}] Event TOTAL:`,
      //   Date.now() - eventStart,
      //   'ms',
      // );

      return {
        id: event.id,
        externalId: event.externalId,
        eventName: event.name,
        competitionId: event.competitionId,
        startTime: event.startTime,
        status: event.status,
        sport: event.sport,
        inplay,
        markets:
          mainMarkets.length > 0
            ? this.groupBy(mainMarkets, 'marketName')
            : this.groupBy(mappedDbMarket, 'marketName'),
        premiumMarket: this.groupBy(extraMarkets, 'category', 'marketName'),
        fancyMarkets: this.groupBy(fancyMarkets, 'marketCategory'),
      };
    });

    console.log(
      '🚀 mapEventsWithOdds GRAND TOTAL:',
      Date.now() - apiStart,
      'ms',
    );

    return enrichedEvents.filter((e): e is NonNullable<typeof e> => e !== null);
  }

  // ---------- Mappers per market type ----------

  // private mapMainMarket = (
  //   dbMarkets: Market[],
  //   data?: MarketData,
  // ): MainMarketData | null => {
  //   if (data) {
  //     if (!data.marketName) return null;
  //     if (data.marketName.toLowerCase().startsWith('genie')) return null;
  //     const dbMarket = dbMarkets.find((m) => m.externalId === data.marketId);
  //     return {
  //       marketId: dbMarket?.externalId || data.marketId,
  //       marketName: dbMarket?.name || data.marketName,
  //       eventId: data.matchId,
  //       inplay: data.inplay,
  //       marketStartTime: data.marketStartTime, // ISO date string
  //       status: data.status,
  //       marketType: data.marketType,
  //       runners: this.mapRunners(data.runners),
  //     };
  //   }
  //   return null;
  // };
  private mapMainMarket = (
    eventId: string,
    dbMarkets: Market[],
    parsedData: Map<string, unknown>,
  ): MainMarketData[] => {
    return dbMarkets
      .map((market) => {
        if (market.name.toLowerCase().startsWith('genie')) return null;
        if (market.type === MarketType.Premium) return null;
        const key = `odds:${eventId}:${market.externalId}`;
        const odds = parsedData.get(key) as { data: MarketData };

        if (!odds && !targetMarkets.includes(market.name.toLowerCase()))
          return null;

        const maxBetAmount = odds?.data?.inplay
          ? market.inPlayMaxBetAmount
            ? Number(market.inPlayMaxBetAmount)
            : null
          : market.offPlayMaxBetAmount
            ? Number(market.offPlayMaxBetAmount)
            : null;

        const minBetAmount = odds?.data?.inplay
          ? market.inPlayMinBetAmount
            ? Number(market.inPlayMinBetAmount)
            : null
          : market.offPlayMinBetAmount
            ? Number(market.offPlayMinBetAmount)
            : null;
        if (odds?.data?.status?.toLowerCase()?.startsWith('close')) {
          return null;
        }
        return {
          marketId: market.externalId || odds?.data?.marketId,
          marketName: market.name || odds?.data?.marketName,
          eventId: eventId,
          inplay: odds?.data?.inplay,
          marketStartTime: odds?.data?.marketStartTime, // ISO date string
          status: odds?.data?.status || market.status,
          marketType: odds?.data?.marketType,
          runners: this.mergeRunners(market.runner, odds?.data?.runners),

          // Settings
          maxBetAmount: maxBetAmount,
          minBetAmount: minBetAmount,
          minRate: market.minRate ? Number(market.minRate) : null,
          maxRate: market.maxRate ? Number(market.maxRate) : null,
        };
      })
      .filter((m) => m !== null);
  };
  private mapDBMainMarket = (data: Market): Partial<MainMarketData> => {
    if (data?.status?.toLowerCase()?.startsWith('close')) return {};
    return {
      marketId: data.externalId,
      marketName: data.name,
      status: data.status,
      runners: (data.runner as any[])?.map((r) => ({
        selectionId: r?.selectionId,
        runnerName: r?.runnerName,
        sortPriority: r?.sortPriority,
      })),
    };
  };

  private mapExtraMarket = (data: ExtraMarket): ExtraMarketData => {
    return {
      marketId: data.marketId,
      marketName: data.marketName,
      category: data.category,
      marketType: data.marketType,
      status: data.status,
      runners: data.runners
        .map((runner) => {
          const mappedBackLay = this.mapBackLay({
            back: runner.backPrices,
            lay: [],
          });
          if (mappedBackLay.back.length === 0 && mappedBackLay.lay.length === 0)
            return null;
          return {
            ...runner,
            selectionId: runner.runnerId,
            ...mappedBackLay,
          };
        })
        .filter((p) => p !== null),
    };
  };

  private mapFancyMarket = (data: FancyMarket): FancyMarketData => {
    return {
      marketId: data.marketId,
      marketName: data.gameType,
      marketCategory: data.marketName,
      gameType: data.gameType,
      gameStatus: data.gameStatus,
      ballSession: data.ballSession,
      sortPriority: data.sortPriority,
      runners: {
        selectionId: data.selectionId,
        runnerName: data.runnerName,
        status: data.gameStatus,
        ...this.mapBackLay({ back: data.back, lay: data.lay }),
      },
    };
  };

  // For Fixture
  async mapEventsWithMatchOdds(events: any[]) {
    if (!events?.length) return [];

    const start = Date.now();

    const keys: string[] = [];
    const eventMarketMap = new Map<string, { event: any; market: any }>();

    for (const event of events) {
      if (!event.markets?.length) continue;

      const preferredMarkets = new Set([
        'match odds',
        '1x2',
        'winner',
        'winner (incl. super over)',
      ]);

      const market =
        event.markets.find(
          (m: { name?: string }) =>
            m.name && preferredMarkets.has(m.name.toLowerCase()),
        ) ?? event.markets?.[0];

      const key = `odds:${event.externalId}:${market.externalId}`;
      keys.push(key);
      eventMarketMap.set(key, { event, market });
    }

    console.log('📦 Odds redis keys:', keys.length);

    // -----------------------------------
    // 🔥 CHUNKED MGET (KEY FIX)
    // -----------------------------------
    const CHUNK_SIZE = 60;
    const oddsMap = new Map<string, any>();

    const redisStart = Date.now();

    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = keys.slice(i, i + CHUNK_SIZE);
      const values = await this.redis.client.mget(...chunk);

      values.forEach((val, idx) => {
        if (!val) return;
        try {
          const parsed = JSON.parse(val);
          if (parsed?.data) {
            oddsMap.set(chunk[idx], parsed.data);
          }
        } catch {}
      });
    }

    // console.log('⏱ Redis mget odds (chunked):', Date.now() - redisStart, 'ms');

    // -----------------------------------
    // RESPONSE
    // -----------------------------------
    const enriched: any[] = [];
    console.log('📦 Events with eventMarketMap:', eventMarketMap.size);
    for (const [key, { event, market }] of eventMarketMap.entries()) {
      const liveData = oddsMap.get(key);

      enriched.push({
        id: Number(event.id),
        competitionId: event.competitionId,
        providerId: event.providerId,
        externalId: event.externalId,
        name: event.name,
        sport: event.sport,
        startTime:
          event.startTime instanceof Date
            ? event.startTime.toISOString()
            : event.startTime,

        status: liveData?.status || event.status,
        inplay: liveData?.inplay ?? event.inplay,

        isFancy: event.isFancy,
        isBookmaker: event.isBookmaker,
        isPremiumFancy: event.isPremiumFancy,
        isPopular: event.isPopular,

        competition: event.competition && {
          id: event.competitionId,
          name: event.competition.name,
          externalId: event.competition.externalId,
          startDate: event.competition.startDate?.toISOString(),
        },

        marketId: market?.id,
        marketExternalId: market?.externalId,

        runners: liveData
          ? this.mergeRunners(market.runner, liveData.runners)
          : market.runner,
      });
    }

    console.log('🚀 mapEventsWithMatchOdds TOTAL:', Date.now() - start, 'ms');
    console.log('📦 Events with odds:', enriched.length);
    return enriched;
  }

  /**
   * Merge DB runner info with live runner odds from Redis
   */
  private mergeRunners(
    dbRunners: any,
    liveRunners: Runner[] = [],
  ): MarketRunner[] {
    let parsedRunners = dbRunners;
    if (typeof dbRunners === 'string') {
      try {
        parsedRunners = JSON.parse(dbRunners);
      } catch {
        parsedRunners = [];
      }
    }

    if (!Array.isArray(parsedRunners)) return [];

    return parsedRunners.map((runner) => {
      const live = liveRunners?.find(
        (r) => r?.selectionId == runner?.selectionId,
      );
      if (!live) return runner;

      const back =
        live.back?.length > 0 ? live.back : live.ex?.availableToBack || [];
      const lay =
        live.lay?.length > 0 ? live.lay : live.ex?.availableToLay || [];

      const response: RunnerOdds = {
        handicap: runner?.handicap,
        selectionId: runner?.selectionId || live.selectionId,
        sortPriority: runner?.sortPriority || live?.sortPriority || 0,
        runnerName: runner?.runnerName || live.runnerName,
        status: live.status,
        meta: runner.meta || null,
        lay,
        back,
        backPrice1: back?.[0]?.price,
        backPrice2: back?.[1]?.price,
        backPrice3: back?.[2]?.price,

        layPrice1: lay?.[0]?.price,
        layPrice2: lay?.[1]?.price,
        layPrice3: lay?.[2]?.price,

        backSize1: back?.[0]?.size,
        backSize2: back?.[1]?.size,
        backSize3: back?.[2]?.size,

        laySize1: lay?.[0]?.size,
        laySize2: lay?.[1]?.size,
        laySize3: lay?.[2]?.size,
      };
      return response;
    });
  }
  private mapRunners(liveRunners: Runner[]): Partial<MarketRunner>[] {
    return liveRunners.map((runner) => {
      const back =
        runner.back?.length > 0
          ? runner.back
          : runner.ex?.availableToBack || [];
      const lay =
        runner.lay?.length > 0 ? runner.lay : runner.ex?.availableToLay || [];

      const response: Partial<MarketRunner> = {
        ...runner,
        ex: undefined,
        lay,
        back,
        backPrice1: back?.[0]?.price,
        backPrice2: back?.[1]?.price,
        backPrice3: back?.[2]?.price,

        layPrice1: lay?.[0]?.price,
        layPrice2: lay?.[1]?.price,
        layPrice3: lay?.[2]?.price,

        backSize1: back?.[0]?.size,
        backSize2: back?.[1]?.size,
        backSize3: back?.[2]?.size,

        laySize1: lay?.[0]?.size,
        laySize2: lay?.[1]?.size,
        laySize3: lay?.[2]?.size,
      };
      return response;
    });
  }

  private mapBackLay = (odds: { back: Price[]; lay: Price[] }) => {
    const back = odds.back?.length > 0 ? odds.back : [];
    const lay = odds.lay?.length > 0 ? odds.lay : [];
    return {
      lay,
      back,
      backPrice1: back?.[0]?.price,
      backPrice2: back?.[1]?.price,
      backPrice3: back?.[2]?.price,

      layPrice1: lay?.[0]?.price,
      layPrice2: lay?.[1]?.price,
      layPrice3: lay?.[2]?.price,

      backSize1: back?.[0]?.size,
      backSize2: back?.[1]?.size,
      backSize3: back?.[2]?.size,

      laySize1: lay?.[0]?.size,
      laySize2: lay?.[1]?.size,
      laySize3: lay?.[2]?.size,
    };
  };

  private groupBy<T extends Record<string, any>>(
    array: T[],
    key: keyof T,
    fallbackKey?: keyof T,
  ): Record<string, T[]> {
    return array.reduce(
      (acc, item) => {
        let groupKey = String(item[key]); // ensure key is string
        if ((!groupKey || groupKey === 'undefined') && fallbackKey) {
          groupKey = String(item[fallbackKey]);
        }
        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push(item);
        return acc;
      },
      {} as Record<string, T[]>,
    );
  }
}
