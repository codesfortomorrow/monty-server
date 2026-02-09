import { BaseService } from '@Common';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { BetConfig, Prisma } from '@prisma/client';
import { UpdateDefaultBetConfigRequest } from './dto';
import { betConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { RedisService } from 'src/redis';
import { MarketService } from 'src/market/market.service';

@Injectable()
export class BetconfigService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly marketService: MarketService,
    @Inject(betConfigFactory.KEY)
    private readonly config: ConfigType<typeof betConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: BetconfigService.name } });
  }

  async updateDefaultBetConfig(data: UpdateDefaultBetConfigRequest) {
    const defaultConfig = await this.prisma.betConfig.findFirst({
      where: { isDefault: true, eventId: null },
    });
    if (!defaultConfig) {
      throw new Error('Default BetConfig not seeded in database');
    }
    const updatedData = this.buildBetConfigUpdateData(data);

    const betConfig = await this.prisma.betConfig.update({
      where: { id: defaultConfig.id },
      data: updatedData,
    });

    const betConfigKey = `betconfig:*`;
    await this.redis.deleteKeysByPattern(betConfigKey);

    return betConfig;
  }

  async setBetConfig(eventId: bigint, data: UpdateDefaultBetConfigRequest) {
    const updatedData = this.buildBetConfigUpdateData(data);
    const betConfig = await this.prisma.betConfig.upsert({
      where: { eventId },
      update: updatedData,
      create: {
        eventId,
        inPlayMaxBetAmount: Number(updatedData.inPlayMaxBetAmount ?? 0),
        inPlayMinBetAmount: Number(updatedData.inPlayMinBetAmount ?? 0),
        offPlayMaxBetAmount: Number(updatedData.offPlayMaxBetAmount ?? 0),
        offPlayMinBetAmount: Number(updatedData.offPlayMinBetAmount ?? 0),
        potentialProfit: Number(updatedData.potentialProfit ?? 0),
        minRate: new Prisma.Decimal(data.minRate ?? 0),
        maxRate: new Prisma.Decimal(data.maxRate ?? 0),
        sessionInPlayMaxBetAmount: Number(
          updatedData.sessionInPlayMaxBetAmount ?? 0,
        ),
        sessionInPlayMinBetAmount: Number(
          updatedData.sessionInPlayMinBetAmount ?? 0,
        ),
        sessionOffPlayMaxBetAmount: Number(
          updatedData.sessionOffPlayMaxBetAmount ?? 0,
        ),
        sessionOffPlayMinBetAmount: Number(
          updatedData.sessionOffPlayMinBetAmount ?? 0,
        ),
        sessionPotentialProfit: Number(updatedData.sessionPotentialProfit ?? 0),
        sessionMinRate: new Prisma.Decimal(data.sessionMinRate ?? 0),
        sessionMaxRate: new Prisma.Decimal(data.sessionMaxRate ?? 0),
        bookmakerInPlayMaxBetAmount: Number(
          updatedData.bookmakerInPlayMaxBetAmount ?? 0,
        ),
        bookmakerInPlayMinBetAmount: Number(
          updatedData.bookmakerInPlayMinBetAmount ?? 0,
        ),
        bookmakerOffPlayMaxBetAmount: Number(
          updatedData.bookmakerOffPlayMaxBetAmount ?? 0,
        ),
        bookmakerOffPlayMinBetAmount: Number(
          updatedData.bookmakerOffPlayMinBetAmount ?? 0,
        ),
        bookmakerPotentialProfit: Number(
          updatedData.bookmakerPotentialProfit ?? 0,
        ),
        bookmakerMinRate: new Prisma.Decimal(data.bookmakerMinRate ?? 0),
        bookmakerMaxRate: new Prisma.Decimal(data.bookmakerMaxRate ?? 0),

        delay: data.betDelay ?? 0,
        exposureLimit: Number(updatedData.exposureLimit ?? 0),
      },
    });

    const betConfigKey = `betconfig:*`;
    await this.redis.deleteKeysByPattern(betConfigKey);

    return betConfig;
  }

  async getbetConfigByEventIdOrDefault(eventId: bigint | number) {
    const betConfigKey = `betconfig:${eventId}`;
    const betConfigCache = await this.redis.client.get(betConfigKey);
    let betConfig: Partial<BetConfig>;
    if (betConfigCache) {
      betConfig = JSON.parse(betConfigCache || '{}');
    } else {
      const dbBetConfig = await this.prisma.betConfig.findUnique({
        where: { eventId },
      });

      if (!dbBetConfig) {
        const defaultBetConfig = await this.prisma.betConfig.findFirst({
          where: {
            eventId: null,
            isDefault: true,
          },
        });
        if (!defaultBetConfig)
          betConfig = {
            eventId: BigInt(eventId),
            exposureLimit: new Prisma.Decimal(this.config.exposureLimit),

            inPlayMaxBetAmount: new Prisma.Decimal(
              this.config.inplayMaxBetAmount,
            ),
            inPlayMinBetAmount: new Prisma.Decimal(
              this.config.inplayMinBetAmount,
            ),

            offPlayMaxBetAmount: new Prisma.Decimal(
              this.config.offplayMaxBetAmount,
            ),
            offPlayMinBetAmount: new Prisma.Decimal(
              this.config.offplayMinBetAmount,
            ),

            potentialProfit: new Prisma.Decimal(this.config.potentialProfit),

            minRate: new Prisma.Decimal(this.config.minRate),
            maxRate: new Prisma.Decimal(this.config.maxRate),

            sessionInPlayMaxBetAmount: new Prisma.Decimal(
              this.config.sessionInplayMaxBetAmount,
            ),
            sessionInPlayMinBetAmount: new Prisma.Decimal(
              this.config.sessionInplayMinBetAmount,
            ),

            sessionOffPlayMaxBetAmount: new Prisma.Decimal(
              this.config.sessionOffplayMaxBetAmount,
            ),
            sessionOffPlayMinBetAmount: new Prisma.Decimal(
              this.config.sessionOffplayMinBetAmount,
            ),

            sessionPotentialProfit: new Prisma.Decimal(
              this.config.sessionPotentialProfit,
            ),

            sessionMinRate: new Prisma.Decimal(this.config.sessionMinRate),
            sessionMaxRate: new Prisma.Decimal(this.config.sessionMaxRate),

            bookmakerInPlayMaxBetAmount: new Prisma.Decimal(
              this.config.bookmakerInplayMaxBetAmount,
            ),
            bookmakerInPlayMinBetAmount: new Prisma.Decimal(
              this.config.bookmakerInplayMinBetAmount,
            ),

            bookmakerOffPlayMaxBetAmount: new Prisma.Decimal(
              this.config.bookmakerOffplayMaxBetAmount,
            ),
            bookmakerOffPlayMinBetAmount: new Prisma.Decimal(
              this.config.bookmakerOffplayMinBetAmount,
            ),

            bookmakerPotentialProfit: new Prisma.Decimal(
              this.config.bookmakerPotentialProfit,
            ),

            bookmakerMinRate: new Prisma.Decimal(this.config.bookmakerMinRate),
            bookmakerMaxRate: new Prisma.Decimal(this.config.bookmakerMaxRate),

            delay: this.config.betDelay,
          };
        else betConfig = defaultBetConfig;
      } else betConfig = dbBetConfig;

      await this.redis.client.setex(
        betConfigKey,
        1 * 60 * 60,
        JSON.stringify(betConfig),
      ); // 1 h
    }
    return betConfig;
  }

  async getDefaultBetConfig() {
    const betConfigKey = `betconfig:default`;
    const betConfigCache = await this.redis.client.get(betConfigKey);
    let betConfig: Partial<BetConfig>;
    if (betConfigCache) {
      betConfig = JSON.parse(betConfigCache || '{}');
    } else {
      const defaultBetConfig = await this.prisma.betConfig.findFirst({
        where: {
          eventId: null,
          isDefault: true,
        },
      });
      if (!defaultBetConfig)
        betConfig = {
          eventId: null,
          exposureLimit: new Prisma.Decimal(this.config.exposureLimit),

          inPlayMaxBetAmount: new Prisma.Decimal(
            this.config.inplayMaxBetAmount,
          ),
          inPlayMinBetAmount: new Prisma.Decimal(
            this.config.inplayMinBetAmount,
          ),

          offPlayMaxBetAmount: new Prisma.Decimal(
            this.config.offplayMaxBetAmount,
          ),
          offPlayMinBetAmount: new Prisma.Decimal(
            this.config.offplayMinBetAmount,
          ),

          potentialProfit: new Prisma.Decimal(this.config.potentialProfit),

          minRate: new Prisma.Decimal(this.config.minRate),
          maxRate: new Prisma.Decimal(this.config.maxRate),

          sessionInPlayMaxBetAmount: new Prisma.Decimal(
            this.config.sessionInplayMaxBetAmount,
          ),
          sessionInPlayMinBetAmount: new Prisma.Decimal(
            this.config.sessionInplayMinBetAmount,
          ),

          sessionOffPlayMaxBetAmount: new Prisma.Decimal(
            this.config.sessionOffplayMaxBetAmount,
          ),
          sessionOffPlayMinBetAmount: new Prisma.Decimal(
            this.config.sessionOffplayMinBetAmount,
          ),

          sessionPotentialProfit: new Prisma.Decimal(
            this.config.sessionPotentialProfit,
          ),

          sessionMinRate: new Prisma.Decimal(this.config.sessionMinRate),
          sessionMaxRate: new Prisma.Decimal(this.config.sessionMaxRate),

          delay: this.config.betDelay,
        };
      else betConfig = defaultBetConfig;

      await this.redis.client.setex(
        betConfigKey,
        5 * 60,
        JSON.stringify(betConfig),
      ); // 5 min
    }
    return betConfig;
  }

  private buildBetConfigUpdateData(
    request: UpdateDefaultBetConfigRequest,
  ): Prisma.BetConfigUpdateInput {
    const updatedData: Prisma.BetConfigUpdateInput = {};

    // Map of decimal fields
    const decimalFields: (keyof Prisma.BetConfigUpdateInput)[] = [
      'exposureLimit',
      'inPlayMaxBetAmount',
      'inPlayMinBetAmount',
      'offPlayMaxBetAmount',
      'offPlayMinBetAmount',
      'potentialProfit',
      'minRate',
      'maxRate',
      'sessionInPlayMaxBetAmount',
      'sessionInPlayMinBetAmount',
      'sessionOffPlayMaxBetAmount',
      'sessionOffPlayMinBetAmount',
      'sessionPotentialProfit',
      'sessionMinRate',
      'sessionMaxRate',
      'bookmakerInPlayMaxBetAmount',
      'bookmakerInPlayMinBetAmount',
      'bookmakerOffPlayMaxBetAmount',
      'bookmakerOffPlayMinBetAmount',
      'bookmakerPotentialProfit',
      'bookmakerMinRate',
      'bookmakerMaxRate',
    ];

    for (const key of decimalFields) {
      const value = request[key as keyof typeof request];

      if (value !== undefined) {
        updatedData[key] = new Prisma.Decimal(value as number);
      }
    }

    if (request.betDelay !== undefined) {
      updatedData.delay = request.betDelay;
    }
    return updatedData;
  }

  async deleteEventBetConfig(eventId: bigint | number) {
    const exist = await this.prisma.betConfig.findUnique({
      where: { eventId },
    });

    if (!exist) throw new Error('BetConfig not found for this event');

    if (exist.isDefault) throw new Error('Default BetConfig cannot be deleted');

    await this.prisma.betConfig.delete({
      where: { id: exist.id },
    });
    return exist;
  }

  async getExposureLimitAndProtentialProfitAndDelayByEventIdAndMarketExternalId(data: {
    eventId: bigint | number;
    marketExternalId: string;
    marketType: 'NORMAL' | 'FANCY' | 'PREMIUM';
    isBookmaker: boolean;
  }) {
    const market = await this.marketService.getByEventIdAndExternalId(
      data.eventId,
      data.marketExternalId,
    );
    if (market && market.exposureLimit) {
      return {
        exposureLimit: market.exposureLimit,
        potentialProfit: market.potentialProfit,
        delay: market.delay,
      };
    } else {
      const config = await this.getbetConfigByEventIdOrDefault(data.eventId);
      if (data.marketType === 'FANCY') {
        return {
          exposureLimit: config.exposureLimit,
          potentialProfit: config.sessionPotentialProfit,
          delay: config.delay,
        };
      } else if (data.isBookmaker) {
        return {
          exposureLimit: config.exposureLimit,
          potentialProfit: config.bookmakerPotentialProfit,
          delay: config.delay,
        };
      } else {
        return {
          exposureLimit: config.exposureLimit,
          potentialProfit: config.potentialProfit,
          delay: config.delay,
        };
      }
    }
  }
}
