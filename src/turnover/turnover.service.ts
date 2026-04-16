import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from 'src/prisma';
import {
  BetStatusType,
  Prisma,
  TurnoverType,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { CreateTurnoverHistoryDto, GetTurnoverHistoryDto } from './dto';
import { BaseService, Pagination, UtilsService } from '@Common';
// import { UserTurnoverAccountService } from './user-turnover-account.service';
import { Sentry } from 'src/configs/sentry.config';

@Injectable()
export class TurnoverService
  extends BaseService
  implements OnModuleInit, OnModuleDestroy
{
  private isShuttingDown = false;
  private isRunning = false;
  private timer?: NodeJS.Timeout;

  // private readonly INTERVAL_MS = 5 * 60 * 1000;

  private readonly INTERVAL_MS = 30 * 1000;

  private readonly BATCH_SIZE = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
    // private readonly userTurnoverAccountService: UserTurnoverAccountService,
  ) {
    super({ loggerDefaultMeta: { service: TurnoverService.name } });
  }

  async onModuleInit(): Promise<void> {
    if (!this.utils.isMaster()) {
      this.logger.info('Skipping BonusProcessor (not master / not production)');
      return;
    }

    this.logger.info('BonusProcessor started');
    this.scheduleNextRun(0); // run immediately
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.warn('BonusProcessor shutting down');
    this.isShuttingDown = true;

    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private scheduleNextRun(delayMs = this.INTERVAL_MS): void {
    if (this.isShuttingDown) return;

    this.timer = setTimeout(async () => {
      await this.safeRun();
      this.scheduleNextRun();
    }, delayMs);
  }

  private async safeRun(): Promise<void> {
    if (this.isRunning || this.isShuttingDown) {
      return;
    }

    this.isRunning = true;

    try {
      this.logger.info('BonusProcessor cycle started');
      await this.turnoverResolver();
      // await this.processCasinoTransactionHisotry();
      this.logger.info('BonusProcessor cycle finished');
    } catch (error) {
      Sentry.captureException(error);
      this.logger.error('BonusProcessor failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  async createSportTurnoverHistory(
    data: CreateTurnoverHistoryDto & { tx: Prisma.TransactionClient },
  ) {
    const payoutAmount = new Decimal(data.payout ?? 0).abs();
    const betAmount = new Decimal(data.amount ?? 0);

    const turnoverAmount = Decimal.min(payoutAmount, betAmount);
    const turnoverMain = turnoverAmount;

    const tx = data.tx;

    try {
      const existing = await tx.turnoverHistory.findFirst({
        where: {
          sourceType: TurnoverType.Sports,
          betId: data.betId,
          userId: data.userId,
        },
      });

      if (existing) {
        await tx.turnoverHistory.update({
          where: { id: existing.id },
          data: {
            amount: betAmount,
            turnoverMain,
          },
        });
      } else {
        await tx.turnoverHistory.create({
          data: {
            userId: data.userId,
            sourceType: TurnoverType.Sports,
            betId: data.betId,
            amount: betAmount,
            turnoverMain,
          },
        });

        // await this.userTurnoverAccountService.processTurnover(
        //   {
        //     userId: data.userId,
        //     turnoverAmount: turnoverMain,
        //   },
        //   tx,
        // );

        this.logger.info(
          `Sport turnover history created successfully ${data.betId}`,
        );

        return {
          success: true,
          message: 'Sport turnover payout applied successfully',
        };
      }
    } catch (error) {
      this.logger.error('Failed to create sport turnover history', error);
      throw error;
    }
  }

  async processCasinoTransactionHisotry() {
    const prisma = this.prisma;

    const eligibleTransactions = await prisma.casinoRoundHistory.findMany({
      where: {
        isTurnOverCalculated: false,
        totalBets: { gt: new Decimal(0) },
        // type: WalletTransactionType.Debit,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 500,
    });

    for (const transaction of eligibleTransactions) {
      try {
        await prisma.$transaction(async (tx) => {
          // Create turnover history
          await this.createCasinoTurnoverHistory({
            userId: transaction.userId,
            casinoTransactionHisotryId: transaction.id,
            amount: transaction.totalBets,
            tx,
          });

          // await this.userTurnoverAccountService.processTurnover(
          //   {
          //     userId: transaction.userId,
          //     turnoverAmount: transaction.amount,
          //   },
          //   tx,
          // );

          // Mark round as processed
          await tx.casinoRoundHistory.update({
            where: { id: transaction.id },
            data: {
              isTurnOverCalculated: true,
            },
          });
        });

        this.logger.info(
          `Casino turnover processed for transaction ${transaction.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed casino turnover for transaction ${transaction.id}`,
          error,
        );
      }
    }
  }

  async createCasinoTurnoverHistory(data: {
    userId: bigint;
    casinoTransactionHisotryId: number;
    amount: number | string | Decimal;
    tx?: Prisma.TransactionClient;
  }): Promise<{ success: true; message: string }> {
    const prisma = data.tx ?? this.prisma;
    const amount = new Decimal(data.amount);

    if (amount.lte(0)) {
      throw new Error('INVALID_TURNOVER_AMOUNT');
    }

    await prisma.turnoverHistory.create({
      data: {
        userId: data.userId,
        sourceType: TurnoverType.Casino,
        casinoTransactionHisotryId: data.casinoTransactionHisotryId,
        amount,
        turnoverMain: amount,
      },
    });

    return {
      success: true,
      message: 'Casino turnover history created successfully',
    };
  }

  async getUserTurnoverHistory(userId: bigint, options: GetTurnoverHistoryDto) {
    let take = undefined,
      skip = undefined;

    if (
      options?.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.TurnoverHistoryWhereInput = {
      userId,
    };

    if (options?.fromDate || options?.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gte = options.fromDate;
      if (options.toDate) where.createdAt.lte = options.toDate;
    }

    if (options?.sourceType) {
      where.sourceType = options.sourceType;
    }

    const total = await this.prisma.turnoverHistory.count({ where });
    const data = await this.prisma.turnoverHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        bet: {
          select: {
            id: true,
            marketName: true,
            marketType: true,
            amount: true,
            status: true,
            settledAt: true,
          },
        },
        casinoTransaction: {
          select: {
            id: true,
            gameName: true,
            amount: true,
            payout: true,
            status: true,
          },
        },
      },
    });

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    const pagination: Pagination = {
      totalItems: total,
      limit: take ?? total,
      currentPage: options.page ?? 1,
      totalPage,
    };

    return { data, pagination };
  }

  private async turnoverResolver(): Promise<void> {
    const bets = await this.prisma.bet.findMany({
      where: {
        status: { in: [BetStatusType.Won, BetStatusType.Lost] },
        isTurnOverCalculated: false,
      },
      take: this.BATCH_SIZE,
      orderBy: { settledAt: 'asc' },
    });

    if (!bets.length) {
      this.logger.debug('No settled bets pending for turnover');
      return;
    }

    this.logger.info(`Processing turnover for ${bets.length} bets`);

    const processedUsers = new Set<bigint>();

    const batch: typeof bets = [];

    for (const bet of bets) {
      if (processedUsers.has(bet.userId)) continue;

      processedUsers.add(bet.userId);
      batch.push(bet);
    }

    await this.utils.batchable(batch, async (bet) => {
      await this.processTurnoverForBet(bet.id);

      await this.prisma.bet.update({
        where: { id: bet.id },
        data: { isTurnOverCalculated: true },
      });
    });
  }

  // TODO: Improve : Done
  private async processTurnoverForBet(betId: bigint): Promise<void> {
    const bet = await this.prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!bet) return;
    if (bet.isTurnOverCalculated) return;

    await this.prisma.$transaction(async (tx) => {
      await this.createSportTurnoverHistory({
        userId: bet.userId,
        betId: bet.id,
        amount: bet.amount,
        payout: bet.payout,
        tx,
      });

      await tx.bet.update({
        where: { id: bet.id },
        data: {
          isTurnOverCalculated: true,
        },
      });

      this.logger.info(`Turnover settled for bet ${bet.id}`);
    });
  }
}
