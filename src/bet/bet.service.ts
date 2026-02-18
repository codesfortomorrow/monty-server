import { BaseService, Pagination, UtilsService } from '@Common';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { BetHistoryRequest, BetPlaceRequest } from './dto';
import {
  BetStatusType,
  BetType,
  Event,
  Market,
  // MarketType,
  Prisma,
  StatusType,
  User,
  UserStatus,
  Wallet,
  WalletTransactionContext,
  WalletType,
} from '@prisma/client';
import { RedisService } from 'src/redis';
import { BetconfigService } from 'src/betconfig/betconfig.service';
import {
  ExtraMarket,
  FancyMarket,
  MarketData,
} from 'src/market-mapper/market.type';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { getBetTypeEnum, getSportEnum, getSportId } from 'src/utils/sports';
import { ConfigType } from '@nestjs/config';
import { sportConfigFactory } from '@Config';
import { WalletsService } from 'src/wallets/wallets.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  BetProfitLossRequest,
  SportFilterType,
} from './dto/bet-profit-loss.request';
import { ExposureService } from 'src/exposure/exposure.service';
import { UsersService } from 'src/users';
import { EventsService } from 'src/events/events.service';
import { MarketService } from 'src/market/market.service';
import { BetResultService } from 'src/bet-result/bet-result.service';
import { SportsPermissionService } from 'src/sports-permission/sports-permission.service';
// import { TurnoverService } from 'src/turnover/turnover.service';

@Injectable()
export class BetService extends BaseService {
  private readonly REQUEST_TIMEOUT_MS = 5000; // 5 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly betConfigService: BetconfigService,
    private readonly http: HttpService,
    private readonly utils: UtilsService,
    private readonly walletService: WalletsService,
    private readonly exposureService: ExposureService,
    private readonly userService: UsersService,
    private readonly eventService: EventsService,
    private readonly marketService: MarketService,
    private readonly resultService: BetResultService,
    private readonly sportPermissionService: SportsPermissionService,
    // private readonly turnoverService: TurnoverService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: BetService.name } });
  }

  async placeBet(userId: bigint, data: BetPlaceRequest, ip?: string) {
    try {
      const sports = this.sportConfig.sports;

      if (!sports)
        throw new Error('Internal server error, Sports is not configured');

      const user = await this.userService.getById(userId);
      if (!user) throw new Error('User not found');

      const event = await this.eventService.getById(data.eventId);
      if (!event) throw new Error('Event not found');

      if (event.isBetSuspended) throw new Error('Bet not allowed');

      let isSRL = false;
      if (event.providerId) {
        const provider = await this.prisma.provider.findUnique({
          where: { id: event.providerId },
        });
        if (provider && provider.name === 'SportRadar') {
          isSRL = true;
        }
      }

      let market: Market | null = null;
      if (data.marketType === 'NORMAL') {
        market = await this.marketService.getByEventIdAndExternalId(
          event.id,
          data.marketId,
        );

        if (!market) throw new Error('Market not found');
      }

      if (isNaN(data.stake)) throw new Error('Amount must be a number');
      // const isValidStake = await this.validateBetAmount(event, data.stake);
      // if (!isValidStake) throw new Error('Invalid bet amount');

      if (user.status === UserStatus.BetLock)
        throw new Error('Your account bet is locked');
      if (user.status === UserStatus.Suspended)
        throw new Error('Your account is suspended');
      if (user.status !== UserStatus.Active)
        throw new Error('Your account is blocked/inactive');

      const wallets = await this.walletService.getAllByUserId(user.id);
      if (wallets.length === 0) throw new Error('User wallet not found');

      const wallet = wallets.find((w) => w.type === WalletType.Main);
      // const bonusWallet = wallets.find((w) => w.type === WalletType.Bonus);

      if (!wallet) throw new Error('User wallet not found');

      if (data.marketType === 'FANCY' && data.fancyPercentage === undefined)
        throw new Error('Percentage is required');

      const isResultExist = await this.checkBetResultExists(
        event.id,
        data.marketId,
        // data.selectionId,
      );
      if (isResultExist) throw new Error('Bet not allowed. Result exists.');

      let isBookmaker: boolean;
      if (data.marketType === 'NORMAL') {
        const redisKey = `odds:${event.externalId}:${data.marketId}`;
        const redisData = await this.redis.client.get(redisKey);
        if (!redisData) throw new Error('Invalid bet');
        try {
          const mainMarket = JSON.parse(redisData) as { data: MarketData };

          const differentMarket = [
            'bookmaker',
            'mini bookmaker',
            'mini_bookmaker',
            'toss',
          ];
          // const marketTypeOrName = mainMarket.data.marketType?.length
          //   ? mainMarket.data.marketType.toLowerCase()
          //   : mainMarket.data.marketName.toLowerCase();
          isBookmaker = differentMarket.includes(
            mainMarket?.data?.marketName?.toLowerCase(),
          );
        } catch {
          this.logger.warn(`Error to perse Normal market during bet place`);
          throw new Error('Invalid bet');
        }
      } else {
        isBookmaker = false;
      }

      const isAllowed = await this.sportPermissionService.checkPermission(
        user.id,
        event.sport,
      );

      if (!isAllowed)
        throw new Error('You have not permission for this sports');

      const isValid = await this.validateBetConfig({
        event,
        marketId: market?.id,
        isBookmaker,
        marketType: data.marketType,
        rate: data.rate,
        percentage: data.fancyPercentage,
        stake: data.stake,
      });
      console.log('isValid', isValid);

      if (!isValid.success) throw new Error(isValid.message);

      const sportId = getSportId(sports, event.sport);
      if (!sportId) throw new Error('SportId not found');
      const exposureMap = await this.getRunnersExposure(
        sportId,
        event.id,
        event.externalId,
        data.marketType,
        data.marketId,
        isBookmaker,
        data.marketName,
        user.id,
        data.selectionId,
        market?.id,
        user.commision,
      );

      if (Object.keys(exposureMap).length === 0) {
        exposureMap[data.selectionId] = 0;
      }

      const { exposureLimit, potentialProfit, delay } =
        await this.betConfigService.getExposureLimitAndProtentialProfitAndDelayByEventIdAndMarketExternalId(
          {
            eventId: event.id,
            isBookmaker,
            marketExternalId: data.marketId,
            marketType: data.marketType,
          },
        );

      if (delay && delay > 0) await this.utils.sleep(delay * 1000);

      const validation = await this.validateBetPlacement({
        marketType: data.marketType,
        marketName: data.marketName,
        betOn: data.betOn,
        eventId: event.externalId,
        marketId: data.marketId,
        selectionId: data.selectionId,
        price: data.rate,
        position: data.position,
        acceptOddsChange: data.acceptOddsChange,
      });

      if (!validation.success) {
        throw new Error(validation.message || 'Odds changed');
      }

      if (!validation.updatedPrice || isNaN(Number(validation.updatedPrice))) {
        throw new Error('Invalid odds');
      }
      data.rate = Number(validation.updatedPrice);

      const bet = await this.prisma.$transaction(async (tx) => {
        const exposureUpdate = await this.updateBetExposure({
          user,
          wallet,
          // bonusWallet,
          sportId,
          eventId: event.id,
          eventExternalId: event.externalId,
          marketId: market?.id,
          marketExternalId: data.marketId,
          marketType: data.marketType,
          isBookmaker,
          selectionId: data.selectionId,
          betOn: data.betOn,
          price: data.rate,
          stake: data.stake,
          tx,
          percentage: data.fancyPercentage,
          marketName: data.marketName,
          exposureMap,
          commission: user.commision,
          exposureLimit: Number(exposureLimit),
          potentialProfit: Number(potentialProfit),
        });

        if (!exposureUpdate || !exposureUpdate.success) {
          throw new Error(
            exposureUpdate instanceof Error
              ? exposureUpdate.message
              : exposureUpdate.error,
          );
        }

        // Bet Create
        const bet = await tx.bet.create({
          data: {
            eventId: event.id,
            userId: user.id,
            sport: event.sport,
            marketId: data.marketId,
            marketName: data.marketName,
            marketCategory: data.marketCategory,
            marketType: isSRL ? 'PREMIUM' : data.marketType,
            selectionId: data.selectionId,
            selection: data.runnerName,
            amount: data.stake,
            // bonusUsages: exposureUpdate.deductFromBonus,
            odds: data.rate,
            percentage: data.fancyPercentage,
            payout: 0,
            isBookmaker,
            status: BetStatusType.Pending,
            betOn: getBetTypeEnum(data.betOn),
            ip,
          },
        });

        // await this.turnoverService.createSportTurnoverHistory({
        //   userId: Number(user.id),
        //   betId: Number(bet.id),
        //   sourceType: TurnoverType.Sports,
        //   amount: data.stake,
        //   eventDate: event.startTime,
        //   eventName: event.name,
        //   market: data.marketName,
        //   marketExternalId: data.marketId,
        //   marketType: data.marketType,
        // });
        return bet;
      });

      return bet;
    } catch (error) {
      this.logger.error(`Error to bet place: ${error.message}`);
      throw error;
    }
  }

  async checkBetResultExists(
    eventId: bigint,
    marketExternalId: string, //selectionId: string
  ) {
    // TODO: Need to fixed
    const result = await this.resultService.getByEventIdAndMarketExternalId(
      eventId,
      marketExternalId,
    );
    return !!result;
  }

  private async validateBetPlacement(data: {
    marketType: 'NORMAL' | 'FANCY' | 'PREMIUM';
    marketName: string;
    betOn: 'BACK' | 'LAY';
    eventId: string;
    marketId: string;
    selectionId: string;
    price: number;
    position?: number;
    acceptOddsChange?: boolean;
  }) {
    if (data.position === undefined) data.position = 0;
    if (data.acceptOddsChange === undefined) data.acceptOddsChange = true;

    const baseUrl = this.sportConfig.sportBaseUrl;

    if (!baseUrl)
      throw new Error('Internal server error, Base Url is not configured');

    try {
      let redisKey = '';
      let redisData: any = null;

      // ----------------------------------------------------
      // 1️⃣ RESOLVE REDIS KEY BASED ON MARKET TYPE
      // ----------------------------------------------------
      if (data.marketType === 'NORMAL') {
        redisKey = `odds:${data.eventId}:${data.marketId}`;
      } else if (data.marketType === 'FANCY') {
        redisKey = `fancy:${data.eventId}`;
      } else if (data.marketType === 'PREMIUM') {
        redisKey = `extra:${data.eventId}`;
      }

      const rawRedisValue = await this.redis.client.get(redisKey);

      if (!rawRedisValue) {
        return { success: false, message: 'Market data not found' };
      }

      redisData = JSON.parse(rawRedisValue);

      // ----------------------------------------------------
      // 2️⃣ NORMAL MARKET (MAIN MARKETS)
      // ----------------------------------------------------
      if (data.marketType === 'NORMAL') {
        const marketData = redisData?.data as MarketData;

        if (!marketData?.runners?.length) {
          return { success: false, message: 'Market runners not found' };
        }

        const runner = marketData.runners?.find(
          (r) => String(r.selectionId) === String(data.selectionId),
        );

        if (!runner) return { success: false, message: 'Runner not found' };

        if (runner.status.toUpperCase() !== 'ACTIVE') {
          return { success: false, message: 'Market suspended' };
        }

        const currentPrice =
          data.betOn === 'BACK'
            ? runner.back?.map((b) => b?.price)
            : runner.lay?.map((l) => l?.price);

        // 🔍 Check price match
        if (!currentPrice.includes(data.price)) {
          if (!data.acceptOddsChange) {
            return { success: false, message: 'Price changed' };
          }
        }

        let updatedOdd: number;
        // external validator API
        const apiUrl = `${baseUrl}/validator/validate?marketId=${data.marketId}&sid=${data.selectionId}&odds=${data.price}&betOn=${data.betOn}&marketType=${data.marketType}&eventId=${data.eventId}&marketName=${data.marketName}`;
        const result = await this.utils.rerunnable(async () => {
          const apiRes = await firstValueFrom(
            this.http.get(apiUrl).pipe(timeout(this.REQUEST_TIMEOUT_MS)),
          );
          return apiRes.data;
        }, 3);

        console.log('Validator result:', JSON.stringify(result), apiUrl);
        updatedOdd = result.updatedOdds;

        if (!result.status || result.status == 3 || result.status == 9) {
          return {
            success: false,
            message: 'Oops! Bet not allowed due to market suspend',
          };
        }
        if (!result.status || result.status == 4) {
          return {
            success: false,
            message: 'Oops! Bet not allowed due to market closed',
          };
        }

        if (result.valid && result.status && result.status === 1) {
          return { success: true, updatedPrice: data.price };
        } else {
          if (data.acceptOddsChange && result.allPrices) {
            const allPrices = result.allPrices || [];

            if (
              data.position !== undefined &&
              data.position >= 0 &&
              data.position < allPrices.length
            ) {
              const positionPrice = allPrices[data.position];
              return {
                success: true,
                updatedPrice: Number(positionPrice),
                message: `Odds changed. Using price from position ${data.position}`,
              };
            }

            const fallbackPrice = updatedOdd
              ? Number(updatedOdd)
              : Number(allPrices[0]);

            return {
              success: true,
              updatedPrice: fallbackPrice,
              message: `Odds changed. Price updated to ${fallbackPrice}`,
            };
          } else if (data.acceptOddsChange) {
            const allPrices = currentPrice;

            if (
              data.position !== undefined &&
              data.position >= 0 &&
              data.position < allPrices.length
            ) {
              const positionPrice = allPrices[data.position];
              return {
                success: true,
                updatedPrice: Number(positionPrice),
                message: `Odds changed. Using price from position ${data.position}`,
              };
            }

            const fallbackPrice = updatedOdd
              ? Number(updatedOdd)
              : Number(allPrices[0]);

            return {
              success: true,
              updatedPrice: fallbackPrice,
              message: `Odds changed. Price updated to ${fallbackPrice}`,
            };
          } else {
            return {
              success: false,
              message: 'Oops! Bet not allowed due to market price change',
            };
          }
        }
      }

      // ----------------------------------------------------
      // 3️⃣ FANCY MARKET (SESSION)
      // ----------------------------------------------------
      if (data.marketType === 'FANCY') {
        const fancyMarkets: FancyMarket[] = redisData?.data || [];

        const fancy = fancyMarkets.find(
          (fm) => String(fm.marketId) === String(data.marketId),
        );

        if (!fancy)
          return { success: false, message: 'Fancy market not found' };

        if (
          fancy.gameStatus.toLowerCase() !== '' &&
          fancy.gameStatus.toLowerCase() !== 'active'
        ) {
          return { success: false, message: 'Fancy market suspended' };
        }

        // Session market fancy prices
        const runnerBack = fancy.back?.map((b) => b.price);
        const runnerLay = fancy.lay?.map((l) => l.price);

        const currentPrice = data.betOn === 'BACK' ? runnerBack : runnerLay;

        // 🔍 Check price match
        if (!currentPrice.includes(data.price)) {
          if (!data.acceptOddsChange) {
            return { success: false, message: 'Fancy Price changed' };
          }
        }

        let updatedOdd: number;
        // external validator API
        const apiUrl = `${baseUrl}/validator/validate?marketId=${data.marketId}&sid=${data.selectionId}&odds=${data.price}&betOn=${data.betOn}&marketType=${data.marketType}&eventId=${data.eventId}&marketName=${data.marketName}`;

        const result = await this.utils.rerunnable(async () => {
          const apiRes = await firstValueFrom(this.http.get(apiUrl));
          return apiRes.data;
        }, 3);

        console.log('Validator result:', result, apiUrl);
        updatedOdd = result.updatedOdds;

        if (!result.status || result.status == 3 || result.status == 9) {
          return {
            success: false,
            message: 'Oops! Bet not allowed due to market suspend',
          };
        }
        if (!result.status || result.status == 4) {
          return {
            success: false,
            message: 'Oops! Bet not allowed due to market closed',
          };
        }
        if (result.valid && result.status && result.status === 1) {
          return { success: true, updatedPrice: data.price };
        } else {
          if (data.acceptOddsChange && result.allPrices) {
            const allPrices = result.allPrices || [];

            if (
              data.position !== undefined &&
              data.position >= 0 &&
              data.position < allPrices.length
            ) {
              const positionPrice = allPrices[data.position];
              return {
                success: true,
                updatedPrice: Number(positionPrice),
                message: `Odds changed. Using price from position ${data.position}`,
              };
            }

            const fallbackPrice = updatedOdd
              ? Number(updatedOdd)
              : Number(allPrices[0]);

            return {
              success: true,
              updatedPrice: fallbackPrice,
              message: `Odds changed. Price updated to ${fallbackPrice}`,
            };
          } else if (data.acceptOddsChange) {
            const allPrices = currentPrice;

            if (
              data.position !== undefined &&
              data.position >= 0 &&
              data.position < allPrices.length
            ) {
              const positionPrice = allPrices[data.position];
              return {
                success: true,
                updatedPrice: Number(positionPrice),
                message: `Odds changed. Using price from position ${data.position}`,
              };
            }

            const fallbackPrice = updatedOdd
              ? Number(updatedOdd)
              : Number(allPrices[0]);

            return {
              success: true,
              updatedPrice: fallbackPrice,
              message: `Odds changed. Price updated to ${fallbackPrice}`,
            };
          } else {
            return {
              success: false,
              message: 'Oops! Bet not allowed due to market price change',
            };
          }
        }
      }

      // ----------------------------------------------------
      // 4️⃣ PREMIUM MARKET (EXTRA)
      // ----------------------------------------------------
      if (data.marketType === 'PREMIUM') {
        const extraMarkets: ExtraMarket[] = redisData?.data || [];

        const extra = extraMarkets.find(
          (m) => String(m.marketId) === String(data.marketId),
        );

        if (!extra)
          return { success: false, message: 'Premium market not found' };

        if (extra.status.toLowerCase() !== 'active') {
          return { success: false, message: 'Premium market suspended' };
        }

        const runner = extra.runners.find(
          (r) => String(r.runnerId) === String(data.selectionId),
        );

        if (!runner) return { success: false, message: 'Runner not found' };

        if (runner.status.toLowerCase() !== 'active') {
          return { success: false, message: 'Runner suspended' };
        }

        const currentPrice = runner.backPrices?.map((b) => b.price);

        // 🔍 Check price match
        if (!currentPrice.includes(data.price)) {
          if (!data.acceptOddsChange) {
            return { success: false, message: 'Fancy Price changed' };
          }
        }

        let updatedOdd: number;
        // external validator API
        const apiUrl = `${baseUrl}/validator/validate?marketId=${data.marketId}&sid=${data.selectionId}&odds=${data.price}&betOn=${data.betOn}&marketType=${data.marketType}&eventId=${data.eventId}&marketName=${data.marketName}`;

        const result = await this.utils.rerunnable(async () => {
          const apiRes = await firstValueFrom(this.http.get(apiUrl));
          return apiRes.data;
        }, 3);

        console.log('Validator result:', result, apiUrl);
        updatedOdd = result.updatedOdds;

        if (!result.status || result.status == 3 || result.status == 9) {
          return {
            success: false,
            message: 'Oops! Bet not allowed due to market suspend',
          };
        }
        if (!result.status || result.status == 4) {
          return {
            success: false,
            message: 'Oops! Bet not allowed due to market closed',
          };
        }
        if (result.valid && result.status && result.status === 1) {
          return { success: true, updatedPrice: data.price };
        } else {
          if (data.acceptOddsChange && result.allPrices) {
            const allPrices = result.allPrices || [];

            if (
              data.position !== undefined &&
              data.position >= 0 &&
              data.position < allPrices.length
            ) {
              const positionPrice = allPrices[data.position];
              return {
                success: true,
                updatedPrice: Number(positionPrice),
                message: `Odds changed. Using price from position ${data.position}`,
              };
            }

            const fallbackPrice = updatedOdd
              ? Number(updatedOdd)
              : Number(allPrices[0]);

            return {
              success: true,
              updatedPrice: fallbackPrice,
              message: `Odds changed. Price updated to ${fallbackPrice}`,
            };
          } else if (data.acceptOddsChange) {
            const allPrices = currentPrice;

            if (
              data.position !== undefined &&
              data.position >= 0 &&
              data.position < allPrices.length
            ) {
              const positionPrice = allPrices[data.position];
              return {
                success: true,
                updatedPrice: Number(positionPrice),
                message: `Odds changed. Using price from position ${data.position}`,
              };
            }

            const fallbackPrice = updatedOdd
              ? Number(updatedOdd)
              : Number(allPrices[0]);

            return {
              success: true,
              updatedPrice: fallbackPrice,
              message: `Odds changed. Price updated to ${fallbackPrice}`,
            };
          } else {
            return {
              success: false,
              message: 'Oops! Bet not allowed due to market price change',
            };
          }
        }
      }

      return { success: false, message: 'Invalid marketType' };
    } catch (err) {
      console.error('Error in validateBetPlacement:', err);
      return { success: false, message: 'Unexpected error' };
    }
  }

  async validateBetConfig(data: {
    event: Event;
    marketId?: bigint;
    marketType: 'NORMAL' | 'FANCY' | 'PREMIUM';
    isBookmaker: boolean;
    rate: number;
    percentage?: number;
    stake: number;
  }) {
    if (data.marketId) {
      // Market wise validation
      const market = await this.marketService.getById(data.marketId);
      if (
        market.inPlayMinBetAmount !== null &&
        market.offPlayMinBetAmount !== null
      ) {
        console.log('stage 1', {
          inplayMinBet: market.inPlayMinBetAmount,
          inplayMaxBet: market.inPlayMaxBetAmount,
          offplayMinBet: market.offPlayMinBetAmount,
          offplayMaxBet: market.offPlayMaxBetAmount,
          stake: data.stake,
          minReat: market.minRate,
          maxRate: market.maxRate,
          inplay: data.event.inplay,
        });
        if (data.event.inplay) {
          if (
            Number(market.inPlayMinBetAmount) > data.stake ||
            Number(market.inPlayMaxBetAmount) < data.stake
          )
            return {
              success: false,
              message: `Bet amount must be between ${market.inPlayMinBetAmount} and ${market.inPlayMaxBetAmount}`,
            };
        } else {
          if (
            Number(market.offPlayMinBetAmount) > data.stake ||
            Number(market.offPlayMaxBetAmount) < data.stake
          )
            return {
              success: false,
              message: `Bet amount must be between ${market.offPlayMinBetAmount} and ${market.offPlayMaxBetAmount}`,
            };
        }
        if (
          Number(market.minRate) > data.rate ||
          Number(market.maxRate) < data.rate
        )
          return {
            success: false,
            message: `Bet rate must be between ${market.minRate} and ${market.maxRate}`,
          };
        return { success: true, message: '' };
      }
    }
    // Event wise or default validation
    const betConfig =
      await this.betConfigService.getbetConfigByEventIdOrDefault(data.event.id);
    console.log('stage 2', betConfig);
    if (data.marketType === 'FANCY' && data.percentage !== undefined) {
      console.log('stage 3');
      if (data.event.inplay) {
        if (
          Number(betConfig.sessionInPlayMinBetAmount) > data.stake ||
          Number(betConfig.sessionInPlayMaxBetAmount) < data.stake
        )
          return {
            success: false,
            message: `Bet amount must be between ${betConfig.sessionInPlayMinBetAmount} and ${betConfig.sessionInPlayMaxBetAmount}`,
          };
      } else {
        if (
          Number(betConfig.sessionOffPlayMinBetAmount) > data.stake ||
          Number(betConfig.sessionOffPlayMaxBetAmount) < data.stake
        )
          return {
            success: false,
            message: `Bet amount must be between ${betConfig.sessionOffPlayMinBetAmount} and ${betConfig.sessionOffPlayMaxBetAmount}`,
          };
      }
      if (
        Number(betConfig.sessionMinRate) > data.percentage ||
        Number(betConfig.sessionMaxRate) < data.percentage
      )
        return {
          success: false,
          message: `Bet rate must be between ${betConfig.sessionMinRate} and ${betConfig.sessionMaxRate}`,
        };
      return { success: true, message: '' };
    } else if (data.isBookmaker) {
      if (data.event.inplay) {
        if (
          Number(betConfig.bookmakerInPlayMinBetAmount) > data.stake ||
          Number(betConfig.bookmakerInPlayMaxBetAmount) < data.stake
        )
          return {
            success: false,
            message: `Bet amount must be between ${betConfig.bookmakerInPlayMinBetAmount} and ${betConfig.bookmakerInPlayMaxBetAmount}`,
          };
      } else {
        if (
          Number(betConfig.bookmakerOffPlayMinBetAmount) > data.stake ||
          Number(betConfig.bookmakerOffPlayMaxBetAmount) < data.stake
        )
          return {
            success: false,
            message: `Bet amount must be between ${betConfig.bookmakerOffPlayMinBetAmount} and ${betConfig.bookmakerOffPlayMaxBetAmount}`,
          };
      }
      if (
        Number(betConfig.bookmakerMinRate) > data.rate ||
        Number(betConfig.bookmakerMaxRate) < data.rate
      )
        return {
          success: false,
          message: `Bet rate must be between ${betConfig.bookmakerMinRate} and ${betConfig.bookmakerMaxRate}`,
        };
      return { success: true, message: '' };
    } else {
      console.log('stage 4');
      if (data.event.inplay) {
        if (
          Number(betConfig.inPlayMinBetAmount) > data.stake ||
          Number(betConfig.inPlayMaxBetAmount) < data.stake
        )
          return {
            success: false,
            message: `Bet amount must be between ${betConfig.inPlayMinBetAmount} and ${betConfig.inPlayMaxBetAmount}`,
          };
      } else {
        if (
          Number(betConfig.offPlayMinBetAmount) > data.stake ||
          Number(betConfig.offPlayMaxBetAmount) < data.stake
        )
          return {
            success: false,
            message: `Bet amount must be between ${betConfig.offPlayMinBetAmount} and ${betConfig.offPlayMaxBetAmount}`,
          };
      }
      if (
        Number(betConfig.minRate) > data.rate ||
        Number(betConfig.maxRate) < data.rate
      )
        return {
          success: false,
          message: `Bet rate must be between ${betConfig.minRate} and ${betConfig.maxRate}`,
        };
      return { success: true, message: '' };
    }
  }

  private getRunnersExposure = async (
    sportId: number,
    eventId: bigint,
    eventExternalId: string,
    marketType: 'NORMAL' | 'FANCY' | 'PREMIUM',
    marketExternalId: string,
    isBookmaker: boolean,
    marketName: string,
    userId: bigint,
    selectionId: string,
    marketId?: bigint,
    commission: number = 0,
  ) => {
    // ---------------------------------------------------
    // 1️⃣ Check if exposure already exists
    // ---------------------------------------------------
    const existingExposure = await this.prisma.exposure.findMany({
      where: {
        sportId,
        marketExternalId,
        marketId: marketId,
        userId,
        status: StatusType.Active,
        ...(marketType === 'FANCY'
          ? { selectionId: selectionId } // Fancy returns only 1 runner
          : {}),
      },
    });

    if (existingExposure.length > 0) {
      return existingExposure.reduce(
        (acc, exp) => {
          acc[exp.selectionId] = Number(exp.amount);
          return acc;
        },
        {} as Record<string, number>,
      );
    }

    // ---------------------------------------------------
    // 2️⃣ Fetch User Bets
    // ---------------------------------------------------
    const bets = await this.prisma.bet.findMany({
      where: {
        userId,
        eventId: eventId,
        marketId: marketExternalId,
        status: BetStatusType.Pending,
        ...(marketType !== 'NORMAL' ? { selectionId } : {}),
      },
      orderBy: { id: 'asc' },
    });

    // ---------------------------------------------------
    // 3️⃣ Market-type specific exposure calculator
    // ---------------------------------------------------
    switch (marketType) {
      case 'FANCY':
        return this.exposureService.calculateFancyExposure(
          bets,
          marketName,
          selectionId,
          commission,
        );

      case 'PREMIUM':
        return await this.exposureService.calculatePremiumExposure(
          bets,
          eventExternalId,
          marketExternalId,
          commission,
        );

      case 'NORMAL':
      default:
        return await this.exposureService.calculateNormalExposure(
          bets,
          eventId,
          marketExternalId,
          isBookmaker,
          commission,
        );
    }
  };

  private updateBetExposure = async (data: {
    user: User;
    wallet: Wallet;
    // bonusWallet: Wallet;
    sportId: number;
    eventId: bigint;
    eventExternalId: string;
    marketId?: bigint;
    marketExternalId: string;
    marketType: 'NORMAL' | 'FANCY' | 'PREMIUM';
    isBookmaker: boolean;
    marketName: string;
    selectionId: string;
    betOn: string;
    price: number;
    stake: number;
    tx: Prisma.TransactionClient;
    percentage?: number;
    exposureMap: { [key: string]: number };
    commission: number;
    exposureLimit: number;
    potentialProfit: number;
  }) => {
    if (!data.commission) data.commission = 0;
    if (!data.exposureMap) data.exposureMap = {};
    try {
      // const market = await this.prisma.market.findFirst({
      //   where: { externalId: marketExternalId },
      // });

      // if (!market) throw new Error(`Market not found: ${marketExternalId}`);

      const { amount: balance, exposureAmount, lockedAmount } = data.wallet;
      // const { amount: bonusBalance } = data.bonusWallet;

      // ---------------------------------------------------------
      // 1️⃣ CALCULATE UPDATED EXPOSURE (IN MEMORY)
      // ---------------------------------------------------------
      let updatedExposureMap: Record<string, number>;

      if (data.marketType === 'FANCY') {
        updatedExposureMap = await this.calculateSessionExposureNew({
          eventId: data.eventId,
          marketExternalId: data.marketExternalId,
          userId: data.user.id,
          selectionId: data.selectionId,
          percentage: data.percentage ?? 0,
          stake: data.stake,
          price: data.price,
          betOn: data.betOn,
          marketName: data.marketName,
          commission: data.commission,
        });
      } else {
        const { profit, loss } = await this.betProfitLossNormal({
          betOn: data.betOn,
          price: data.price,
          stake: data.stake,
          isBookmaker: data.isBookmaker,
          commission: data.commission,
        });

        updatedExposureMap = this.updateExposureNormal(
          data.exposureMap,
          data.selectionId,
          profit,
          loss,
          data.betOn,
        );
      }

      const minPrevExposure = Math.min(...Object.values(data.exposureMap)) * -1;
      const minUpdatedExposure = Math.min(...Object.values(updatedExposureMap));
      const maxUpdatedProfit = Math.max(...Object.values(updatedExposureMap));

      if (Math.abs(minUpdatedExposure) > Number(data.exposureLimit))
        throw new Error('Maximum exposure limit exceeded');

      if (
        data.potentialProfit > 0 &&
        maxUpdatedProfit > Number(data.potentialProfit)
      ) {
        console.log(
          'maxUpdatedProfit',
          maxUpdatedProfit,
          'data.potentialProfit',
          data.potentialProfit,
        );
        throw new Error('Maximum profit limit exceeded');
      }

      // ---------------------------------------------------------
      // 2️⃣ TRANSACTION FOR WALLET + EXPOSURE WRITE
      // ---------------------------------------------------------
      const availableCredit =
        Number(balance) +
        Number(exposureAmount) +
        Number(minPrevExposure) -
        Number(lockedAmount);
      // + Number(bonusBalance);

      // const totalBalanceWithoutBonus = availableCredit - Number(bonusBalance);

      if (
        availableCredit < 0 ||
        availableCredit < Math.abs(minUpdatedExposure)
      ) {
        throw new Error('Insufficient balance');
      }

      // let deductFromBonus = 0;
      // if (totalBalanceWithoutBonus < Math.abs(minUpdatedExposure)) {
      //   deductFromBonus =
      //     Math.abs(minUpdatedExposure) - totalBalanceWithoutBonus;
      // }

      // if (market.exposureLimit) {
      //   if (Math.abs(minUpdatedExposure) > Number(market.exposureLimit))
      //     throw new Error('Your exposure limit exceeded');
      // } else {
      //   const betConfig =
      //     await this.betConfigService.getbetConfigByEventIdOrDefault(eventId);
      //   if (Math.abs(minUpdatedExposure) > Number(betConfig.exposureLimit))
      //     throw new Error('Your exposure limit exceeded');
      // }

      // ----------------- UPDATE EXPOSURE TABLE -----------------
      await this.upsertExposure(
        data.eventId,
        data.sportId,
        data.marketExternalId,
        data.user.id,
        updatedExposureMap,
        data.tx,
        data.marketId,
      );

      // ----------------- BALANCE ADJUSTMENTS -----------------

      // Restore previous exposure if needed
      if (minPrevExposure > 0) {
        await this.walletService.addExposure(
          data.user.id,
          new Decimal(minPrevExposure),
          WalletType.Main,
          { tx: data.tx, context: WalletTransactionContext.Bet },
        );
      }

      // Subtract fresh exposure
      if (minUpdatedExposure < 0) {
        await this.walletService.subtractExposure(
          data.user.id,
          new Decimal(Math.abs(minUpdatedExposure)),
          WalletType.Main,
          { tx: data.tx, context: WalletTransactionContext.Bet },
        );
      }

      return { success: true, error: null };
    } catch (err: any) {
      this.logger.error('updateBetExposure Error:', err);
      return { success: false, error: err.message ?? 'Unknown error' };
    }
  };

  private async betProfitLossNormal(data: {
    betOn: string;
    price: number;
    stake: number;
    isBookmaker: boolean;
    commission: number;
  }) {
    const { betOn, commission = 0, isBookmaker, price, stake } = data;
    let profit = 0;
    let loss = 0;

    // const redisKey = `odds:${eventExternalId}:${marketExternalId}`;
    // const redisData = await this.redis.client.get(redisKey);
    // if (!redisData) throw new Error('Invalid premium bet');
    // try {
    //   const mainMarket = JSON.parse(redisData) as { data: MarketData };

    //   const differentMarket = ['bookmaker', 'toss'];

    //   const marketTypeOrName =
    //     mainMarket.data.marketType.length > 0
    //       ? mainMarket.data.marketType.toLowerCase()
    //       : mainMarket.data.marketName.toLowerCase();
    if (isBookmaker) {
      if (betOn === 'BACK') {
        profit = price * 0.01 * stake;
        loss = stake;
      } else {
        profit = stake;
        loss = price * 0.01 * stake;
      }
    } else {
      if (betOn === 'BACK') {
        profit = (price - 1) * stake;
        loss = stake;
      } else {
        profit = stake;
        loss = (price - 1) * stake;
      }
    }

    if (commission > 0) {
      profit += profit * commission;
      loss -= loss * commission;
    }
    // } catch {
    //   this.logger.warn(`Error to perse Normal market during bet place`);
    // }
    return { profit: Number(profit.toFixed(2)), loss: Number(loss.toFixed(2)) };
  }

  private updateExposureNormal(
    exposureMap: Record<string, number>,
    selectionId: string,
    profit: number,
    loss: number,
    betOn: string,
  ) {
    const updated = { ...exposureMap };

    for (const sel in updated) {
      if (betOn === 'BACK') {
        if (sel === selectionId) updated[sel] += profit;
        else updated[sel] -= loss;
      } else {
        if (sel === selectionId) updated[sel] -= loss;
        else updated[sel] += profit;
      }
    }

    return updated;
  }

  private calculateSessionExposureNew = async (data: {
    eventId: bigint;
    marketExternalId: string;
    userId: bigint;
    selectionId: string;
    percentage: number;
    stake: number;
    price: number;
    betOn: string;
    marketName: string;
    commission: number;
  }) => {
    const bets = await this.prisma.bet.findMany({
      where: {
        eventId: data.eventId,
        marketId: data.marketExternalId,
        userId: data.userId,
        selectionId: data.selectionId,
        status: BetStatusType.Pending,
      },
    });

    bets.push({
      userId: data.userId,
      eventId: data.eventId,
      marketId: data.marketExternalId,
      betOn: getBetTypeEnum(data.betOn),
      amount: new Decimal(data.stake),
      percentage: new Decimal(data.percentage),
      selectionId: data.selectionId,
      odds: data.price,
    } as any);

    return this.exposureService.calculateFancyExposure(
      bets,
      data.marketName,
      data.selectionId,
      data.commission,
    );
  };

  private upsertExposure = async (
    eventId: bigint,
    sportId: number,
    marketExternalId: string,
    userId: bigint,
    exposureMap: Record<string, number>,
    tx: Prisma.TransactionClient,
    marketId?: bigint,
  ) => {
    for (const [selectionId, amount] of Object.entries(exposureMap)) {
      await tx.exposure.upsert({
        where: {
          userId_eventId_marketExternalId_selectionId: {
            eventId,
            marketExternalId,
            userId,
            selectionId,
          },
        },
        update: {
          amount,
          updatedAt: new Date(),
        },
        create: {
          eventId,
          sportId,
          marketExternalId: marketExternalId,
          marketId,
          userId,
          selectionId,
          amount,
          status: StatusType.Active,
        },
      });
    }
  };

  private getEventProfitLimit = async (eventId: bigint) => {
    const betConfig = await this.prisma.betConfig.findUnique({
      where: { eventId },
    });
    if (!betConfig || !betConfig.potentialProfit) return 0;
    return Number(betConfig.potentialProfit);
  };

  // Bet History
  async getBetHistory(userId: bigint, filter: BetHistoryRequest) {
    // const user = await this.userService.getById(userId);
    // if (!user) throw new Error('User not found');

    let take: number | undefined = undefined,
      skip: number | undefined = undefined;
    if (
      filter.page &&
      filter.limit &&
      !isNaN(filter.limit) &&
      !isNaN(filter.page)
    ) {
      filter.page = filter.page < 1 ? 1 : filter.page;
      take = filter.limit;
      skip = (filter.page - 1) * filter.limit;
    }

    const where: Prisma.BetWhereInput = {
      userId: userId,
      status: BetStatusType.Pending,
    };
    if (filter.betTime === 'PAST') {
      where.status = {
        not: BetStatusType.Pending,
      };
    }

    if (filter.fromDate || filter.toDate) {
      where.placedAt = {
        gte: filter.fromDate,
        lte: filter.toDate,
      };
    }

    if (filter.eventId) {
      where.eventId = BigInt(filter.eventId);
    }

    if (filter.sport) {
      where.sport = filter.sport;
    }

    if (filter.search) {
      where.event = {
        name: {
          contains: filter.search,
          mode: 'insensitive',
        },
      };
    }

    const count = await this.prisma.bet.count({ where });
    const bets = await this.prisma.bet.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            externalId: true,
          },
        },
      },
      take,
      skip,
      orderBy: {
        placedAt: 'desc',
      },
    });

    const pagination: Pagination = {
      currentPage: filter.page ?? 1,
      limit: take ?? count,
      totalItems: count,
      totalPage: Math.ceil(count / (take ?? (count > 1 ? count : 1))),
    };

    if (filter.betTime === 'CURRENT') {
      const modifiedBets = bets.map((bet) => {
        let liability: number, potentialProfit: number;
        if (bet.marketType === 'FANCY' && bet.percentage) {
          if (bet.betOn === BetType.Back) {
            liability = Number(bet.amount);
            potentialProfit =
              Number(bet.amount) * (Number(bet.percentage) * 0.01);
          } else {
            liability = Number(bet.amount) * (Number(bet.percentage) * 0.01);
            potentialProfit = Number(bet.amount);
          }
        } else {
          if (bet.betOn === BetType.Back) {
            liability = Number(bet.amount);
            potentialProfit = Number(bet.amount) * (Number(bet.odds) - 1);
          } else {
            liability = Number(bet.amount) * (Number(bet.odds) - 1);
            potentialProfit = Number(bet.amount);
          }
        }

        return {
          ...bet,
          liability,
          potentialProfit,
        };
      });

      return { bets: modifiedBets, pagination };
    }

    return { bets, pagination };
  }

  // async betProfitLoss(userId: bigint, filter: BetProfitLossRequest) {
  //   const user = await this.userService.getById(userId);
  //   if (!user) throw new Error('User not found');

  //   let take: number | undefined = undefined,
  //     skip: number | undefined = undefined;
  //   if (
  //     filter.page &&
  //     filter.limit &&
  //     !isNaN(filter.limit) &&
  //     !isNaN(filter.page)
  //   ) {
  //     filter.page = filter.page < 1 ? 1 : filter.page;
  //     take = filter.limit;
  //     skip = (filter.page - 1) * filter.limit;
  //   }

  //   const where: Prisma.BetWhereInput = {
  //     userId: user.id,
  //   };

  //   if (filter.fromDate || filter.toDate) {
  //     where.placedAt = {
  //       gte: filter.fromDate,
  //       lte: filter.toDate,
  //     };
  //   }

  //   if (filter.sport) {
  //     where.sport = filter.sport;
  //   }

  //   if (filter.search) {
  //     where.event = {
  //       name: {
  //         contains: filter.search,
  //         mode: 'insensitive',
  //       },
  //     };
  //   }

  //   const filteredSum = await this.prisma.bet.aggregate({
  //     _sum: { payout: true },
  //     where,
  //   });

  //   const globalWhere: Prisma.BetWhereInput = {
  //     userId: userId,
  //   };

  //   if (filter.fromDate || filter.toDate) {
  //     globalWhere.placedAt = {
  //       gte: filter.fromDate,
  //       lte: filter.toDate,
  //     };
  //   }

  //   const allSportsSum = await this.prisma.bet.aggregate({
  //     _sum: { payout: true },
  //     where: globalWhere,
  //   });

  //   const count = await this.prisma.bet.count({ where });
  //   const bets = await this.prisma.bet.findMany({
  //     where,
  //     include: {
  //       event: {
  //         select: {
  //           id: true,
  //           name: true,
  //           externalId: true,
  //         },
  //       },
  //     },
  //     take,
  //     skip,
  //     orderBy: {
  //       placedAt: 'desc',
  //     },
  //   });

  //   const pagination: Pagination = {
  //     currentPage: filter.page ?? 1,
  //     limit: take ?? count,
  //     totalItems: count,
  //     totalPage: Math.ceil(count / (take ?? (count > 1 ? count : 1))),
  //   };

  //   return {
  //     bets,
  //     pagination,
  //     filteredProfitLoss: filteredSum._sum.payout ?? 0,
  //     totalProfitLossAllSports: allSportsSum._sum.payout ?? 0,
  //   };
  // }

  async betProfitLoss(userId: bigint, filter: BetProfitLossRequest) {
    // const user = await this.userService.getById(userId);
    // if (!user) throw new Error('User not found');

    let take: number | undefined = undefined,
      skip: number | undefined = undefined;
    if (
      filter.page &&
      filter.limit &&
      !isNaN(filter.limit) &&
      !isNaN(filter.page)
    ) {
      filter.page = filter.page < 1 ? 1 : filter.page;
      take = filter.limit;
      skip = (filter.page - 1) * filter.limit;
    }

    const casinowhere: Prisma.CasinoRoundHistoryWhereInput = {
      userId: userId,
    };

    const where: Prisma.BetWhereInput = {
      userId: userId,
    };

    if (filter.sport === SportFilterType.Casino) {
      if (filter.fromDate || filter.toDate) {
        casinowhere.updatedAt = {
          gte: filter.fromDate,
          lte: filter.toDate,
        };
      }
      if (filter.search) {
        casinowhere.gameName = {
          contains: filter.search,
          mode: 'insensitive',
        };
      }
    } else {
      if (filter.fromDate || filter.toDate) {
        where.placedAt = {
          gte: filter.fromDate,
          lte: filter.toDate,
        };
      }
      if (filter.sport) {
        where.sport = getSportEnum(filter.sport);
      }
      if (filter.search) {
        where.event = {
          name: {
            contains: filter.search,
            mode: 'insensitive',
          },
        };
      }
      where.status = {
        in: [BetStatusType.Won, BetStatusType.Lost, BetStatusType.Rollback],
      };
    }

    let filteredSum;
    let casinoFilteredSum;

    if (filter.sport === SportFilterType.Casino) {
      casinoFilteredSum = await this.prisma.casinoRoundHistory.aggregate({
        _sum: { totalBets: true, totalWins: true },
        where: casinowhere,
      });
    } else {
      filteredSum = await this.prisma.bet.aggregate({
        _sum: { payout: true },
        where,
      });
    }
    const globalWhere: Prisma.BetWhereInput = {
      userId: userId,
    };

    if (filter.fromDate || filter.toDate) {
      globalWhere.placedAt = {
        gte: filter.fromDate,
        lte: filter.toDate,
      };
    }

    const globalCasinoWhere: Prisma.CasinoRoundHistoryWhereInput = {
      userId: userId,
    };
    if (filter.fromDate || filter.toDate) {
      globalCasinoWhere.updatedAt = {
        gte: filter.fromDate,
        lte: filter.toDate,
      };
    }
    const allSportsSum = await this.prisma.bet.aggregate({
      _sum: { payout: true },
      where: globalWhere,
    });

    const allCasinoSum = await this.prisma.casinoRoundHistory.aggregate({
      _sum: { totalBets: true, totalWins: true },
      where: globalCasinoWhere,
    });
    const allProfitLoss =
      Number(allCasinoSum?._sum?.totalWins || 0) -
      Number(allCasinoSum?._sum?.totalBets || 0);
    if (filter.sport === SportFilterType.Casino) {
      const casinoCount = await this.prisma.casinoRoundHistory.count({
        where: casinowhere,
      });
      const casinoBets = await this.prisma.casinoRoundHistory.findMany({
        where: casinowhere,
        take,
        skip,
        orderBy: {
          updatedAt: 'desc',
        },
      });
      const pagination: Pagination = {
        currentPage: filter.page ?? 1,
        limit: take ?? casinoCount,
        totalItems: casinoCount,
        totalPage: Math.ceil(
          casinoCount / (take ?? (casinoCount > 1 ? casinoCount : 1)),
        ),
      };
      const profitLoss =
        Number(casinoFilteredSum?._sum?.totalWins || 0) -
        Number(casinoFilteredSum?._sum?.totalBets || 0);
      return {
        bets: casinoBets,
        pagination,
        filteredProfitLoss: profitLoss,
        totalProfitLossAllSports:
          Number(allSportsSum._sum.payout || 0) + allProfitLoss,
      };
    }

    console.log('Bet WHere condition', JSON.stringify(where));
    const count = await this.prisma.bet.count({ where });
    const bets = await this.prisma.bet.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            externalId: true,
          },
        },
      },
      take,
      skip,
      orderBy: {
        placedAt: 'desc',
      },
    });

    const pagination: Pagination = {
      currentPage: filter.page ?? 1,
      limit: take ?? count,
      totalItems: count,
      totalPage: Math.ceil(count / (take ?? (count > 1 ? count : 1))),
    };

    return {
      bets,
      pagination,
      filteredProfitLoss: filteredSum?._sum?.payout ?? 0,
      totalProfitLossAllSports:
        Number(allSportsSum._sum.payout || 0) + allProfitLoss,
    };
  }

  // Sports TurnOver
  async getSportsTurnOver(startDate: Date, endDate: Date) {
    return await this.prisma.bet.groupBy({
      by: ['userId'],
      where: {
        settledAt: { gte: startDate, lte: endDate },
        status: { in: [BetStatusType.Won, BetStatusType.Lost] },
      },
      _sum: {
        amount: true,
        payout: true,
      },
    });
  }
}
