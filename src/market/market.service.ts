import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { MarketRequest, UpdateMarketBetSetting } from './dto';
import { Prisma, StatusType } from '@prisma/client';
import { BaseService } from '@Common';
import { FancyMarketPayload } from 'src/market-mapper/market.type';

@Injectable()
export class MarketService extends BaseService {
  private readonly CACHE_TTL = 60 * 5; // 5 minutes
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({ loggerDefaultMeta: { service: MarketService.name } });
  }

  async getMarkets(query: MarketRequest) {
    const redisKey = `markets:${query.eventId || 'all'}:${query.search || 'null'}:${query.inplay || 'all'}`;
    const data = await this.redis.client.get(redisKey);
    if (data) {
      return JSON.parse(data);
    }

    const where: Prisma.MarketWhereInput = {
      // status: { in: [StatusType.Active, StatusType.Live] },
    };

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    // if (query.inplay !== undefined) where.inplay = query.inplay === 'true';
    if (query.eventId) where.eventId = query.eventId;

    // ✅ Fetch from DB
    const markets = await this.prisma.market.findMany({
      where,
      //   orderBy: { startTime: 'asc' },
    });

    // ✅ Store in cache
    await this.redis.client.setex(
      redisKey,
      this.CACHE_TTL,
      JSON.stringify(markets),
    );

    return markets;
  }

  async getByEventIdAndExternalId(
    eventId: bigint | number,
    externalId: string,
  ) {
    return await this.prisma.market.findUnique({
      where: {
        eventId_externalId: {
          eventId,
          externalId,
        },
      },
    });
  }
  async getByExternalId(externalId: string) {
    return await this.prisma.market.findFirst({
      where: {
        externalId,
      },
    });
  }

  async getById(id: bigint | number) {
    const market = await this.prisma.market.findUnique({
      where: {
        id,
      },
    });
    if (!market) throw new Error('Market not found');
    return market;
  }

  async getRunnerByEventIdAndExternalId(
    eventId: bigint | number,
    externalId: string,
  ) {
    return await this.prisma.market.findUnique({
      where: {
        eventId_externalId: {
          eventId,
          externalId,
        },
      },
      select: {
        id: true,
        externalId: true,
        eventId: true,
        status: true,
        runner: true,
      },
    });
  }

  // Market Management
  async changeMarketStatus(marketId: bigint, status: 'ACTIVE' | 'INACTIVE') {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });
    if (!market) throw new Error('Market not found');
    const marketStatus =
      status === 'ACTIVE' ? StatusType.Active : StatusType.Inactive;
    const updatedMarket = await this.prisma.market.update({
      where: { id: market.id },
      data: { status: marketStatus },
    });
    const redisKey = `markets:${market.eventId}:*`;
    const redisKeyForAll = `markets:all:*`;
    await this.redis.deleteKeysByPattern(redisKey);
    await this.redis.deleteKeysByPattern(redisKeyForAll);
    return updatedMarket;
  }

  async updateBetSetting(marketId: bigint, data: UpdateMarketBetSetting) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });
    if (!market) throw new Error('Market not found');
    const updatedMarket = await this.prisma.market.update({
      where: { id: market.id },
      data: {
        exposureLimit: data.exposureLimit,
        delay: data.betDelay,
        inPlayMinBetAmount: data.inPlayMinBetAmount,
        inPlayMaxBetAmount: data.inPlayMaxBetAmount,
        offPlayMinBetAmount: data.offPlayMinBetAmount,
        offPlayMaxBetAmount: data.offPlayMaxBetAmount,
        minRate: data.minRate,
        maxRate: data.maxRate,
        potentialProfit: data.potentialProfit,
      },
    });

    const redisKey = `markets:${market.eventId}:*`;
    const redisKeyForAll = `markets:all:*`;
    await this.redis.deleteKeysByPattern(redisKey);
    await this.redis.deleteKeysByPattern(redisKeyForAll);

    return updatedMarket;
  }

  async checkAndRemoveFancyFromRedis(
    eventExternalId: string,
    marketExternalId: string,
  ) {
    const redisKey = `fancy:${eventExternalId}`;
    const fancy = await this.redis.client.get(redisKey);
    if (!fancy) return;
    try {
      const fancyMarkets = JSON.parse(fancy) as FancyMarketPayload;
      const markets = fancyMarkets?.data;
      const newMarkets = markets.filter((m) => m.marketId !== marketExternalId);
      fancyMarkets.data = newMarkets;
      await this.redis.client.setex(
        redisKey,
        4 * 60 * 60, // 4h
        JSON.stringify(fancyMarkets),
      );
    } catch (error) {
      this.logger.warn(`Error to remove fancy market: ${error.message}`);
    }
  }
}
