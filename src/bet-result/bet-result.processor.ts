import { BaseService, UserType, UtilsService } from '@Common';
import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  Bet,
  BetStatusType,
  BetType,
  Prisma,
  ResultProvider,
  ResultStatusType,
  StatusType,
  WalletTransactionContext,
  WalletType,
} from '@prisma/client';
// import { BonusUtilizationService } from 'src/bonus/services/bonus-utilization.service';
import { AlertService } from 'src/alert/alert.service';
import { Sentry } from 'src/configs/sentry.config';
import { PrismaService } from 'src/prisma';
import { TurnoverService } from 'src/turnover/turnover.service';
import { WalletsService } from 'src/wallets/wallets.service';

@Injectable()
export class BetResultProccessor
  extends BaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private isShuttingDown = false;
  private isRunning = false;
  private isRunningRollback = false;
  private currentRunPromise: Promise<void> | null = null;
  private currentRunPromiseForRollback: Promise<void> | null = null;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
    private readonly walletService: WalletsService,
    private readonly turnoverService: TurnoverService,
    // private readonly bonusUtilService: BonusUtilizationService,
    private readonly alertService: AlertService,
  ) {
    super({ loggerDefaultMeta: { proccessor: BetResultProccessor.name } });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.utils.isMaster()) {
      this.logger.info(
        'Skipping initial bet resolver (not master or not production)',
      );
      return;
    }

    this.logger.info(
      'Application bootstrapped → triggering initial bet resolver',
    );
    // Use setTimeout to avoid blocking the startup sequence
    this.initResolver().catch((err) =>
      this.logger.error('Bet resolver crashed', err),
    );
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.warn(
      `Shutdown signal received: ${signal}. Starting graceful shutdown...`,
    );
    this.isShuttingDown = true;

    if (this.interval) clearInterval(this.interval);

    if (this.currentRunPromise) {
      this.logger.info('Waiting for in-progress resolver to complete...');
      try {
        await this.currentRunPromise;
        this.logger.info('In-progress resolver completed gracefully.');
      } catch (error) {
        this.logger.error('Resolver failed during shutdown', error.stack);
      }
    }

    if (this.currentRunPromiseForRollback) {
      this.logger.info(
        'Waiting for in-progress rollback resolver to complete...',
      );
      try {
        await this.currentRunPromiseForRollback;
        this.logger.info('In-progress rollback resolver completed gracefully.');
      } catch (error) {
        this.logger.error(
          'Rollback resolver failed during shutdown',
          error.stack,
        );
      }
    }

    this.logger.info('Graceful shutdown completed.');
  }

  private async initResolver() {
    while (true) {
      try {
        await Promise.allSettled([
          this.triggerResolver(),
          this.triggerRollbackResolver(),
        ]);
      } catch (err) {
        this.logger.error(`Resolver loop error ${err}`);
        Sentry.captureException(err);
      }

      await this.utils.sleep(5000);
    }
  }

  private async triggerResolver() {
    try {
      if (this.isShuttingDown) {
        this.logger.warn(`Resolvation blocked: shutdown in progress`);
        return;
      }

      if (this.isRunning) {
        this.logger.warn(`Revolvation already running, skipping new run`);
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      // this.logger.info(`START Bet resolvation`);

      this.currentRunPromise = this.resolver().finally(() => {
        this.isRunning = false;
        this.currentRunPromise = null;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.logger.info(`FINISHED Bet resolve in ${duration}s`);
      });

      // Don't await here – let it run in background but keep reference for shutdown
      this.currentRunPromise.catch((err) => {
        this.logger.error(`Unhandled error in resolvation ${err.stack}`);
      });
    } catch (error) {
      this.logger.error(`Error in bet resolver, error: ${error.message}`);
    }
  }

  private async triggerRollbackResolver() {
    try {
      if (this.isShuttingDown) {
        this.logger.warn(`Resolvation blocked: shutdown in progress`);
        return;
      }

      if (this.isRunningRollback) {
        this.logger.warn(`Revolvation already running, skipping new run`);
        return;
      }

      this.isRunningRollback = true;
      const startTime = Date.now();

      this.logger.info(`START Bet rollback resolvation`);

      // Rollback resolver
      this.currentRunPromiseForRollback = this.rollbackResolver().finally(
        () => {
          this.isRunningRollback = false;
          this.currentRunPromiseForRollback = null;
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          this.logger.info(`FINISHED Bet rollback in ${duration}s`);
        },
      );

      // Don't await here – let it run in background but keep reference for shutdown
      this.currentRunPromiseForRollback.catch((err) => {
        this.logger.error('Unhandled error in rollback', err.stack);
      });
    } catch (error) {
      this.logger.error(`Error in bet resolver, error: ${error.message}`);
    }
  }

  private async resolver() {
    try {
      const unsettleResult = await this.prisma.result.findMany({
        where: {
          status: ResultStatusType.Pending,
        },
        take: 1,
      });

      await this.utils.batchable(unsettleResult, async (result) => {
        await this.betResolver({
          resultId: result.id,
          eventId: result.eventId,
          externalMarketId: result.marketExternalId,
          selectionId: result.selectionId || '',
          result: result.result,
        });
      });
    } catch (error) {
      this.alertService.notifyBetResolverFailure({ error: error.message });
      this.logger.error(`Error in Bet resolver: ${error.message}`);
    }
  }

  private async betResolver(data: {
    resultId: bigint;
    eventId: bigint;
    externalMarketId: string;
    selectionId: string;
    result: string | number;
  }) {
    if (!data.selectionId) {
      this.logger.info('No selections provided for resolution');
      return;
    }

    const duplicateEvent = await this.prisma.betfairSportsRadarEvents.findFirst(
      { where: { betfairEventId: data.eventId } },
    );

    const eventIds = [data.eventId];
    if (duplicateEvent) eventIds.push(duplicateEvent.sportsRadarEventId);

    const pendingBetUsers = await this.prisma.bet.findMany({
      where: {
        eventId: { in: eventIds },
        marketId: data.externalMarketId,
        status: { in: [BetStatusType.Pending, BetStatusType.Rollback] },
      },
      distinct: ['userId'],
      select: { userId: true },
      take: 100,
    });

    await this.utils.batchable(pendingBetUsers, async (user) => {
      const pendingBets = await this.prisma.bet.findMany({
        where: {
          userId: user.userId,
          eventId: data.eventId,
          marketId: data.externalMarketId,
          status: { in: [BetStatusType.Pending, BetStatusType.Rollback] },
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              externalId: true,
            },
          },
        },
      });

      const marketType = pendingBets[0].marketType;
      const marketName = pendingBets[0].marketName;
      const eventName = pendingBets[0].event.name;
      const sport = pendingBets[0].sport;
      const entityId = pendingBets[0].id;

      await this.prisma.$transaction(
        async (tx) => {
          let count = 0;
          let totalPayout = new Prisma.Decimal(0);
          let totalBonusPayout = new Prisma.Decimal(0);

          this.logger.debug('TRANSACTION_BODY');

          for (const bet of pendingBets) {
            count++;

            this.logger.debug(`\n--- Bet #${count} | ID: ${bet.id} ---`);

            this.logger.debug(`resolve_${bet.id}`);
            const { payout, bonusPayout, status } =
              marketType === 'FANCY'
                ? this.resolveFancy({ bet, result: data.result })
                : this.resolveNormal({
                    bet,
                    result: data.result,
                    selectionId: data.selectionId,
                  });
            this.logger.debug(`resolve_${bet.id}`);

            this.logger.debug('payout:', payout.toString(), 'status:', status);

            this.logger.debug(`settlement_${bet.id}`);
            await this.calculateSettlement({
              tx,
              bet,
              payout: payout.add(bonusPayout),
              status,
            });

            totalPayout = totalPayout.add(payout);
            totalBonusPayout = totalBonusPayout.add(bonusPayout);
          }

          console.log('totalPayout : ', totalPayout);
          console.log('totalBonusPayout : ', totalBonusPayout);
          console.log('userid', user.userId);

          this.logger.debug('TOTAL PAYOUT:', totalPayout.toString());

          if (totalPayout.gte(0)) {
            await this.walletService.addBalance(
              user.userId,
              totalPayout.toDecimalPlaces(2),
              WalletType.Main,
              true,
              {
                tx,
                context: WalletTransactionContext.Won,
                narration: `${sport}/${eventName}/${marketName}`,
                entityId: entityId,
              },
            );
          } else {
            await this.walletService.subtractBalance(
              user.userId,
              totalPayout.toDecimalPlaces(2),
              WalletType.Main,
              true,
              {
                tx,
                context: WalletTransactionContext.Lost,
                narration: `${sport}/${eventName}/${marketName}`,
                entityId: entityId,
              },
            );
          }

          // if (totalBonusPayout.gte(0)) {
          //   await this.bonusUtilService.creditWinnings({
          //     userId: user.userId,
          //     betAmount: totalBonusPayout,
          //     ctx: WalletTransactionContext.Won,
          //     narration: `${sport}/${eventName}/${marketName}`,
          //     tx,
          //   });
          // } else {
          //   await this.bonusUtilService.deductBetAmount({
          //     userId: user.userId,
          //     betAmount: totalBonusPayout.abs(),
          //     ctx: WalletTransactionContext.Lost,
          //     narration: `${sport}/${eventName}/${marketName}`,
          //     tx,
          //   });
          // }

          this.logger.debug('exposure_settlement');
          await this.exposureSettlement({
            tx,
            userId: user.userId,
            eventId: data.eventId,
            marketExternalId: data.externalMarketId,
          });
        },
        {
          timeout: 30_000,
          maxWait: 5_000,
        },
      );
    });
    const pendingCount = await this.prisma.bet.count({
      where: {
        eventId: { in: eventIds },
        marketId: data.externalMarketId,
        status: { in: [BetStatusType.Pending, BetStatusType.Rollback] },
      },
    });
    if (pendingCount === 0) {
      await this.prisma.result.update({
        where: { id: data.resultId },
        data: { status: ResultStatusType.Proceed, settledAt: new Date() },
      });
    }
  }

  // private resolveNormal(data: {
  //   bet: Bet;
  //   selectionId: string;
  //   result: string | number;
  // }): {
  //   payout: Prisma.Decimal;
  //   bonusPayout: Prisma.Decimal;
  //   status: BetStatusType;
  // } {
  //   const voidStatus = this.isVoidOrRemoved(data.result);
  //   if (voidStatus) {
  //     return {
  //       payout: new Prisma.Decimal(0),
  //       bonusPayout: new Prisma.Decimal(0),
  //       status: voidStatus,
  //     };
  //   }

  //   const isWinner = data.bet.selectionId === data.selectionId.toString();
  //   const stake = Number(data.bet.amount);
  //   const odds = Number(data.bet.odds);
  //   const bonusUsages = Number(data.bet.bonusUsages);

  //   let payout = 0;
  //   let bonusPayout = 0;
  //   let status: BetStatusType;

  //   const profitOdd = data.bet.isBookmaker ? odds * 0.01 : odds - 1;
  //   const winAmount = stake * profitOdd;

  //   if (data.bet.betOn === BetType.Back) {
  //     if (bonusUsages > 0) {
  //       if (isWinner) {
  //         payout = winAmount;
  //         bonusPayout = (bonusUsages / stake) * winAmount;
  //         payout -= bonusPayout;
  //       } else {
  //         payout = -stake;
  //         bonusPayout = Math.min(bonusUsages, stake);
  //         payout -= bonusPayout;
  //       }
  //     } else {
  //       if (isWinner) {
  //         payout = winAmount;
  //         bonusPayout = 0;
  //       } else {
  //         payout = -stake;
  //         bonusPayout = 0;
  //       }
  //     }
  //     status = isWinner ? BetStatusType.Won : BetStatusType.Lost;
  //   } else {
  //     if (bonusUsages > 0) {
  //       if (isWinner) {
  //         bonusPayout = -Math.min(winAmount, bonusUsages);
  //         payout = -winAmount - bonusPayout;
  //       } else {
  //         bonusPayout = (bonusUsages / winAmount) * stake;
  //         payout = stake - bonusPayout;
  //       }
  //     } else {
  //       payout = isWinner ? -winAmount : stake;
  //       bonusPayout = 0;
  //     }
  //     status = isWinner ? BetStatusType.Lost : BetStatusType.Won;
  //   }

  //   return {
  //     payout: new Prisma.Decimal(payout),
  //     bonusPayout: new Prisma.Decimal(bonusPayout),
  //     status,
  //   };
  // }

  // private resolveFancy(data: { bet: Bet; result: string | number }): {
  //   payout: Prisma.Decimal;
  //   bonusPayout: Prisma.Decimal;
  //   status: BetStatusType;
  // } {

  //   console.log("bet : ", data.bet)
  //   const voidStatus = this.isVoidOrRemoved(data.result);
  //   if (voidStatus) {
  //     return {
  //       payout: new Prisma.Decimal(0),
  //       bonusPayout: new Prisma.Decimal(0),
  //       status: voidStatus,
  //     };
  //   }

  //   const stake = Number(data.bet.amount);
  //   const odds = Number(data.bet.odds);
  //   const percentage = Number(data.bet.percentage);
  //   const result = Number(data.result);
  //   const bonusUsages = Number(data.bet.bonusUsages);

  //   let payout = 0;
  //   let bonusPayout = 0;
  //   let status: BetStatusType;

  //   if (data.bet.betOn === BetType.Back) {
  //     if (result >= odds) {
  //       if (bonusUsages > 0) {
  //         payout = stake * (percentage * 0.01);
  //         bonusPayout = (bonusUsages / stake) * payout;
  //         payout -= bonusPayout;
  //       } else {
  //         payout = stake * (percentage * 0.01);
  //         bonusPayout = 0;
  //       }
  //       status = BetStatusType.Won;
  //     } else {
  //       if (bonusUsages > 0) {
  //         payout = -stake;
  //         bonusPayout = Math.min(bonusUsages, stake);
  //         payout -= bonusPayout;
  //       } else {
  //         payout = -stake;
  //         bonusPayout = 0;
  //       }
  //       status = BetStatusType.Lost;
  //     }
  //   } else {
  //     if (result < odds) {
  //       if (bonusUsages > 0) {
  //         bonusPayout = Math.min(bonusUsages, stake);
  //         payout = stake - bonusUsages;
  //       } else {
  //         payout = stake;
  //         bonusPayout = 0;
  //       }
  //       status = BetStatusType.Won;
  //     } else {
  //       if (bonusUsages > 0) {
  //         payout = -stake * (percentage * 0.01);
  //         bonusPayout = Math.min(bonusUsages, payout);
  //         payout -= bonusPayout;
  //       } else {
  //         payout = -stake * (percentage * 0.01);
  //         bonusPayout = 0;
  //       }
  //       status = BetStatusType.Lost;
  //     }
  //   }

  //   return {
  //     payout: new Prisma.Decimal(payout),
  //     bonusPayout: new Prisma.Decimal(bonusPayout),
  //     status,
  //   };
  // }

  private splitStake(amount: number, bonus: number) {
    const bonusStake = Math.max(0, Math.min(bonus, amount));
    const mainStake = amount - bonusStake;

    return { mainStake, bonusStake };
  }

  private distributeProfit(
    profit: number,
    mainStake: number,
    bonusStake: number,
  ) {
    const total = mainStake + bonusStake;
    if (total === 0) {
      return { mainProfit: 0, bonusProfit: 0 };
    }

    return {
      mainProfit: (mainStake / total) * profit,
      bonusProfit: (bonusStake / total) * profit,
    };
  }

  private resolveNormal(data: {
    bet: Bet;
    selectionId: string;
    result: string | number;
  }) {
    const voidStatus = this.isVoidOrRemoved(data.result);
    if (voidStatus) {
      return {
        payout: new Prisma.Decimal(0),
        bonusPayout: new Prisma.Decimal(0),
        status: voidStatus,
      };
    }

    const isWinner = data.bet.selectionId === data.selectionId.toString();
    const stake = Number(data.bet.amount);
    const odds = Number(data.bet.odds);
    const bonusUsed = Number(data.bet.bonusUsages);

    const { mainStake, bonusStake } = this.splitStake(stake, bonusUsed);

    const profitOdd = data.bet.isBookmaker ? odds * 0.01 : odds - 1;
    const totalProfit = stake * profitOdd;

    let payout = 0;
    let bonusPayout = 0;
    let status: BetStatusType;

    const isBack = data.bet.betOn === BetType.Back;
    // const isWin = isBack ? isWinner : !isWinner;

    if (isBack) {
      if (isWinner) {
        const { mainProfit, bonusProfit } = this.distributeProfit(
          totalProfit,
          mainStake,
          bonusStake,
        );

        payout = mainProfit;
        bonusPayout = bonusProfit;
        status = BetStatusType.Won;
      } else {
        payout = -mainStake;
        bonusPayout = -bonusStake;
        status = BetStatusType.Lost;
      }
    } else {
      if (isWinner) {
        const { mainProfit, bonusProfit } = this.distributeProfit(
          totalProfit,
          mainStake,
          bonusStake,
        );

        payout = -mainProfit;
        bonusPayout = -bonusProfit;
        status = BetStatusType.Lost;
      } else {
        payout = mainStake;
        bonusPayout = bonusStake;
        status = BetStatusType.Won;
      }
    }

    return {
      payout: new Prisma.Decimal(payout),
      bonusPayout: new Prisma.Decimal(bonusPayout),
      status,
    };
  }

  private resolveFancy(data: { bet: Bet; result: string | number }) {
    const voidStatus = this.isVoidOrRemoved(data.result);
    if (voidStatus) {
      return {
        payout: new Prisma.Decimal(0),
        bonusPayout: new Prisma.Decimal(0),
        status: voidStatus,
      };
    }

    const stake = Number(data.bet.amount);
    const odds = Number(data.bet.odds);
    const percentage = Number(data.bet.percentage);
    const result = Number(data.result);
    const bonusUsed = Number(data.bet.bonusUsages);

    const { mainStake, bonusStake } = this.splitStake(stake, bonusUsed);

    const totalProfit = stake * (percentage * 0.01);

    const isBack = data.bet.betOn === BetType.Back;
    const isWinner = result >= odds;
    // const isWin = isBack ? result >= odds : result < odds;

    let payout = 0;
    let bonusPayout = 0;
    let status: BetStatusType;

    if (isBack) {
      if (isWinner) {
        const { mainProfit, bonusProfit } = this.distributeProfit(
          totalProfit,
          mainStake,
          bonusStake,
        );

        payout = mainProfit;
        bonusPayout = bonusProfit;
        status = BetStatusType.Won;
      } else {
        payout = -mainStake;
        bonusPayout = -bonusStake;
        status = BetStatusType.Lost;
      }
    } else {
      if (isWinner) {
        const { mainProfit, bonusProfit } = this.distributeProfit(
          totalProfit,
          mainStake,
          bonusStake,
        );

        payout = -mainProfit;
        bonusPayout = -bonusProfit;
        status = BetStatusType.Lost;
      } else {
        payout = mainStake;
        bonusPayout = bonusStake;
        status = BetStatusType.Won;
      }
    }

    return {
      payout: new Prisma.Decimal(payout),
      bonusPayout: new Prisma.Decimal(bonusPayout),
      status,
    };
  }

  private isVoidOrRemoved(result: string | number) {
    const r = String(result).toLowerCase();
    if (r === 'void') return BetStatusType.Voided;
    if (r === '-999') return BetStatusType.Cancelled;
    return null;
  }

  private async calculateSettlement(data: {
    tx: Prisma.TransactionClient;
    bet: Bet;
    payout: Prisma.Decimal;
    status: BetStatusType;
  }) {
    return data.tx.bet.update({
      where: { id: data.bet.id },
      data: {
        payout: data.payout.toDecimalPlaces(2),
        status: data.status,
        settledAt: new Date(),
      },
    });
  }

  private async exposureSettlement(data: {
    tx: Prisma.TransactionClient;
    userId: bigint;
    eventId: bigint;
    marketExternalId: string;
  }) {
    await data.tx.exposure.updateMany({
      where: {
        userId: data.userId,
        eventId: data.eventId,
        marketExternalId: data.marketExternalId,
        status: StatusType.Active,
      },
      data: {
        status: StatusType.Closed,
      },
    });

    await this.walletService.refreshExposureAmount(data.userId, {
      tx: data.tx,
      context: WalletTransactionContext.Bet,
    });
  }

  private async rollbackResolver() {
    try {
      const unsettleRollbackedResult = await this.prisma.result.findMany({
        where: {
          status: ResultStatusType.RollbackPending,
        },
      });

      await this.utils.batchable(unsettleRollbackedResult, async (result) => {
        await this.betRollbackResolver({
          resultId: result.id,
          eventId: result.eventId,
          externalMarketId: result.marketExternalId,
          selectionId: result.selectionId || '',
          result: result.result,
          rollbackProvider: result.rollbackedBy,
        });
      });
    } catch (error) {
      this.logger.error(`Error in Bet rollback resolver: ${error.message}`);
    }
  }

  private async betRollbackResolver(data: {
    resultId: bigint;
    eventId: bigint;
    externalMarketId: string;
    selectionId: string;
    result: string | number;
    rollbackProvider: ResultProvider | null;
  }) {
    if (!data.selectionId) {
      this.logger.info('No selections provided for resolution');
      return;
    }

    const pendingBetUsers = await this.prisma.bet.findMany({
      where: {
        eventId: data.eventId,
        marketId: data.externalMarketId,
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    await this.utils.batchable(pendingBetUsers, async (user) => {
      const pendingBets = await this.prisma.bet.findMany({
        where: {
          userId: user.userId,
          eventId: data.eventId,
          marketId: data.externalMarketId,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        for (const pendingBet of pendingBets) {
          await this.rollbackSettelment({ tx, bet: pendingBet });
        }

        await this.resultExposureSettlement({
          tx,
          userId: user.userId,
          eventId: data.eventId,
          marketExternalId: data.externalMarketId,
        });
      });
    });

    const resultStatus =
      data.rollbackProvider === ResultProvider.Webhook
        ? ResultStatusType.Rollbacked
        : ResultStatusType.Pending;

    await this.prisma.result.update({
      where: { id: data.resultId },
      data: { status: resultStatus, settledAt: new Date() },
    });
  }

  private async rollbackSettelment(data: {
    tx: Prisma.TransactionClient;
    bet: Bet;
  }) {
    if (data.bet.payout.gt(0)) {
      await this.walletService.subtractBalance(
        data.bet.userId,
        data.bet.payout.toDecimalPlaces(2),
        WalletType.Main,
        true,
        {
          tx: data.tx,
          context: WalletTransactionContext.Rollback,
          entityId: data.bet.id,
          narration: `Rollback for bet -  ${data.bet.id}`,
        },
      );
    }
    if (data.bet.payout.lt(0)) {
      await this.walletService.addBalance(
        data.bet.userId,
        data.bet.payout.toDecimalPlaces(2).abs(),
        WalletType.Main,
        true,
        {
          tx: data.tx,
          context: WalletTransactionContext.Rollback,
          entityId: data.bet.id,
          narration: `Rollback for bet -  ${data.bet.id}`,
        },
      );
    }
    await this.prisma.bet.update({
      where: {
        id: data.bet.id,
      },
      data: {
        status: BetStatusType.Rollback,
        isTurnOverCalculated: false,
        isPlCalculated: false,
      },
    });
  }

  private async resultExposureSettlement(data: {
    tx: Prisma.TransactionClient;
    userId: bigint;
    eventId: bigint;
    marketExternalId: string;
  }) {
    await data.tx.exposure.updateMany({
      where: {
        userId: data.userId,
        eventId: data.eventId,
        marketExternalId: data.marketExternalId,
        status: StatusType.Closed,
      },
      data: {
        status: StatusType.Active,
      },
    });

    await this.walletService.refreshExposureAmount(data.userId, {
      tx: data.tx,
      context: WalletTransactionContext.Bet,
    });
  }
}
