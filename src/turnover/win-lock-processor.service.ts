import { BaseService, UtilsService } from '@Common';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { Sentry } from 'src/configs/sentry.config';
import {
  ExportStatus,
  Prisma,
  WalletTransactionContext,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class WinAmountLockProcessor
  extends BaseService
  implements OnModuleInit, OnModuleDestroy
{
  private isShuttingDown = false;
  private isRunning = false;
  private timer?: NodeJS.Timeout;
  private readonly INTERVAL_MS = 5 * 1000;
  private readonly BATCH_SIZE = 100; // Reduced for better transaction handling
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
  ) {
    super({ loggerDefaultMeta: { service: WinAmountLockProcessor.name } });
  }

  async onModuleInit(): Promise<void> {
    if (!this.utils.isMaster()) {
      this.logger.info(
        'Skipping Win Lock Processor (not master / not production)',
      );
      return;
    }

    this.logger.info('Win Lock Processor started');
    this.scheduleNextRun(0); // run immediately
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.warn('Win Lock Processor shutting down');
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
      this.logger.info('Win Lock Processor cycle started');
      await this.processWinningTransactions();
      this.logger.info('Win Lock Processor cycle finished');
    } catch (error) {
      Sentry.captureException(error);
      this.logger.error('Win Lock Processor failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async processWinningTransactions(): Promise<void> {
    while (!this.isShuttingDown) {
      const transactions = await this.prisma.walletTransactions.findMany({
        where: {
          context: {
            in: [
              WalletTransactionContext.Won,
              WalletTransactionContext.Win,
              WalletTransactionContext.CasinoWin,
            ],
          },
          type: WalletTransactionType.Credit,
          isWinningLocked: false,
          status: {
            in: [
              WalletTransactionStatus.Confirmed,
              WalletTransactionStatus.Approved,
            ],
          },
          wallet: {
            type: WalletType.Main,
          },
        },
        include: {
          wallet: {
            select: {
              userId: true,
              type: true,
            },
          },
        },
        take: this.BATCH_SIZE,
        orderBy: { id: 'asc' },
      });

      if (transactions.length === 0) return;

      this.logger.info(
        `Processing ${transactions.length} winning transactions`,
      );

      await this.utils.batchable(transactions, async (txn) => {
        if (this.isShuttingDown) return;

        try {
          await this.processWinningTransactionWithRetry(txn);
        } catch (error) {
          this.logger.error(
            `Failed to process winning transaction ${txn.id}`,
            error,
          );

          Sentry.captureException(error, {
            extra: {
              transactionId: txn.id,
              userId: txn.wallet.userId,
              context: txn.context,
            },
          });

          // Prevent infinite retry
          await this.markAsProcessed(txn.id).catch((markError) => {
            this.logger.error(
              `Failed to mark transaction ${txn.id} as processed`,
              markError,
            );
          });
        }
      });

      if (transactions.length < this.BATCH_SIZE) return;
    }
  }

  private async processWinningTransactionWithRetry(
    txn: any,
    attempt = 1,
  ): Promise<void> {
    try {
      await this.processWinningTransaction(txn);
    } catch (error) {
      if (attempt < this.MAX_RETRIES) {
        this.logger.warn(
          `Retrying transaction ${txn.id} (attempt ${attempt + 1}/${this.MAX_RETRIES})`,
        );
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100),
        );
        return this.processWinningTransactionWithRetry(txn, attempt + 1);
      }
      throw error;
    }
  }
  private async processWinningTransaction(txn: {
    id: bigint;
    walletId: bigint;
    amount: Decimal;
    entityId: string | null;
    context: WalletTransactionContext;
    wallet: {
      userId: bigint | null;
      type: WalletType;
    };
  }): Promise<void> {
    const userId = txn.wallet.userId;

    if (!userId) {
      this.logger.warn(`Skipping transaction ${txn.id}: no userId`);
      await this.markAsProcessed(txn.id);
      return;
    }

    if (!txn.entityId) {
      this.logger.warn(`Skipping transaction ${txn.id}: no entityId`);
      await this.markAsProcessed(txn.id);
      return;
    }

    // Get bet stake from the correct source
    const betStake = await this.getBetStake(txn.entityId, txn.context);
    const winAmount = txn.amount;

    if (!betStake || betStake.lte(0)) {
      this.logger.warn(
        `Skipping transaction ${txn.id}: could not find valid bet stake for ${txn.context} ${txn.entityId}`,
      );
      await this.markAsProcessed(txn.id);
      return;
    }

    if (winAmount.lte(0)) {
      this.logger.warn(`Skipping transaction ${txn.id}: invalid win amount`);
      await this.markAsProcessed(txn.id);
      return;
    }
    // Process in a transaction with proper isolation
    await this.prisma.$transaction(
      async (tx) => {
        // Apply locked winnings first
        await this.applyLockedWinningsFIFO(
          {
            userId,
            walletId: txn.walletId,
            betStake,
            winAmount,
          },
          tx,
        );

        // Mark transaction as processed
        await tx.walletTransactions.update({
          where: { id: txn.id },
          data: { isWinningLocked: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 30000, // 30 second timeout
      },
    );

    this.logger.debug(
      `Processed ${txn.context} transaction ${txn.id} for user ${userId} (entity: ${txn.entityId}, stake: ${betStake.toFixed(2)}, win: ${winAmount.toFixed(2)})`,
    );
  }

  private async getBetStake(
    entityId: string,
    context: WalletTransactionContext,
  ): Promise<Decimal | null> {
    try {
      if (context === WalletTransactionContext.CasinoWin) {
        // FIX: Casino rounds store bet amount, not total wins
        const casinoRound = await this.prisma.casinoRoundHistory.findUnique({
          where: { id: Number(entityId) },
          select: { totalBets: true }, // Changed from totalWins to betAmount
        });
        return casinoRound?.totalBets || null;
      } else if (
        context === WalletTransactionContext.Won ||
        context === WalletTransactionContext.Win
      ) {
        const bet = await this.prisma.bet.findUnique({
          where: { id: BigInt(entityId) },
          select: { amount: true }, // Changed from payout to amount (bet stake)
        });
        return bet?.amount.abs() || null;
      } else {
        this.logger.warn(`Unknown context: ${context}`);
        return null;
      }
    } catch (error) {
      this.logger.error(
        `Failed to fetch bet stake for ${context} ${entityId}`,
        error,
      );
      return null;
    }
  }

  private async markAsProcessed(transactionId: bigint): Promise<void> {
    await this.prisma.walletTransactions.update({
      where: { id: transactionId },
      data: { isWinningLocked: true },
    });
  }

  async applyLockedWinningsFIFO(
    {
      userId,
      walletId,
      betStake,
      winAmount,
    }: {
      userId: bigint;
      walletId: bigint;
      betStake: Decimal;
      winAmount: Decimal;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (betStake.lte(0) || winAmount.lte(0)) {
      this.logger.debug(
        `Skipping FIFO allocation: invalid stake (${betStake}) or win amount (${winAmount})`,
      );
      return;
    }

    // Get current wallet balance
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { amount: true, type: true },
    });

    const totalWalletAmount = wallet.amount;
    const walletType = wallet.type;

    // Get all pending turnovers ordered by FIFO
    const turnovers = await tx.userTurnoverAccount.findMany({
      where: {
        userId,
        walletId,
        turnoverType: walletType,
        status: ExportStatus.Pending,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        amount: true,
        requiredTurnover: true,
        returnedAmount: true,
        lockedWinning: true,
      },
    });
    if (turnovers.length === 0) {
      this.logger.debug(
        `No pending turnovers found for user ${userId}, wallet ${walletId}`,
      );
      return;
    }

    this.logger.debug(
      `Found ${turnovers.length} pending turnovers for user ${userId}`,
    );

    await this.allocateWinningsToDepositsFIFO(
      turnovers,
      betStake,
      winAmount,
      tx,
    );
  }

  private async allocateWinningsToDepositsFIFO(
    turnovers: Array<{
      id: bigint;
      amount: Decimal;
      returnedAmount: Decimal;
      lockedWinning: Decimal;
    }>,
    betStake: Decimal,
    winAmount: Decimal,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    let remainingStake = betStake;
    let totalWinAllocated = new Decimal(0);

    for (const deposit of turnovers) {
      if (remainingStake.lte(0)) break;

      // How much from this deposit is still usable for turnover
      const availableFromDeposit = deposit.amount
        .add(deposit.lockedWinning)
        .sub(deposit.returnedAmount);

      if (availableFromDeposit.lte(0)) {
        continue;
      }

      // Stake taken from this deposit
      const stakeUsed = Decimal.min(remainingStake, availableFromDeposit);

      // Proportional win for this deposit
      const winShare = stakeUsed.div(betStake).mul(winAmount);

      remainingStake = remainingStake.sub(stakeUsed);
      totalWinAllocated = totalWinAllocated.add(winShare);

      await tx.userTurnoverAccount.update({
        where: { id: deposit.id },
        data: {
          lockedWinning: {
            increment: winShare,
          },
        },
      });

      this.logger.debug(
        `FIFO lock: deposit ${deposit.id} ` +
          `stakeUsed=${stakeUsed.toFixed(2)} ` +
          `winLocked=${winShare.toFixed(2)}`,
      );
    }

    // Safety checks
    if (remainingStake.gt(0.01)) {
      this.logger.warn(
        `Stake not fully allocated. Remaining: ${remainingStake.toFixed(2)}`,
      );
    }

    const diff = winAmount.sub(totalWinAllocated).abs();
    if (diff.gt(0.01)) {
      this.logger.warn(
        `Win mismatch: expected ${winAmount.toFixed(2)}, ` +
          `allocated ${totalWinAllocated.toFixed(2)}`,
      );
    }
  }
}
