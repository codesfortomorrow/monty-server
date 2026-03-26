import {
  Injectable,
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { UtilsService, BaseService } from '@Common';
import {
  WalletTransactionContext,
  WalletTransactionType,
} from '@prisma/client';

@Injectable()
export class WalletTransactionsProcessor
  extends BaseService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private isRunning = false;
  private isShuttingDown = false;
  private readonly BATCH_SIZE = 1000;

  // Cursor user id used for tracking progress
  private readonly CURSOR_USER_ID = 0n;

  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
  ) {
    super({ loggerDefaultMeta: { processor: 'WalletTransactionsProcessor' } });
  }

  async onApplicationBootstrap() {
    if (!this.utils.isMaster()) return;

    this.logger.info('WalletTransactionsProcessor starting...');
    this.isRunning = true;

    // Run processing loop asynchronously
    setImmediate(() => {
      this.processLoop()
        .catch((err) => {
          this.logger.error('Processor crashed', err);
        })
        .finally(() => {
          this.isRunning = false;
          this.logger.info('WalletTransactionsProcessor stopped cleanly');
        });
    });
  }

  async beforeApplicationShutdown(signal: string) {
    if (this.isShuttingDown) return;

    this.logger.warn(`WalletTransactionsProcessor shutting down (${signal})`);
    this.isShuttingDown = true;
  }

  private async processLoop() {
    while (!this.isShuttingDown) {
      try {
        const processed = await this.processBatch();
        if (this.isShuttingDown) break;

        // Shorter delay if processed, longer delay if nothing to do
        await new Promise((r) => setTimeout(r, processed ? 200 : 2000));
      } catch (err) {
        if (this.isShuttingDown) break;

        this.logger.error('processLoop error', err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    this.logger.info('WalletTransactionsProcessor loop exited');
  }

  private async processBatch(): Promise<boolean> {
    if (this.isShuttingDown) return false;
    const DEPOSIT_CONTEXTS: WalletTransactionContext[] = [
      WalletTransactionContext.Deposit,
      WalletTransactionContext.SystemDeposit,
      WalletTransactionContext.CryptoDeposit,
      WalletTransactionContext.DepositApproval,
    ];
    const WITHDRAW_CONTEXTS: WalletTransactionContext[] = [
      WalletTransactionContext.Withdrawal,
      WalletTransactionContext.SystemWithdrawal,
      WalletTransactionContext.CryptoWithdrawal,
      WalletTransactionContext.WithdrawalApproval,
    ];

    return this.prisma.$transaction(async (tx) => {
      if (this.isShuttingDown) return false;

      const cursor = await tx.walletTransactionCursor.findUnique({
        where: { id: 1 },
      });

      const lastTxId = cursor?.lastTransactionId ?? 0n;

      // 2️⃣ Fetch wallet transactions newer than cursor
      const transactions = await tx.walletTransactions.findMany({
        where: {
          id: { gt: lastTxId },
          status: 'Confirmed',
          context: {
            in: [...DEPOSIT_CONTEXTS, ...WITHDRAW_CONTEXTS],
          },
          wallet: {
            userId: { not: null },
          },
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        include: { wallet: true },
      });

      if (transactions.length === 0) return false;

      // 3️⃣ Aggregate stats by userId
      const statsMap = new Map<
        bigint,
        {
          walletId: bigint;
          depositAmount: number;
          withdrawAmount: number;
          depositCount: number;
          withdrawCount: number;
        }
      >();

      for (const tx of transactions) {
        if (!tx.wallet?.userId) continue;

        const userId = tx.wallet.userId || tx.wallet.adminId!;

        const stat = statsMap.get(userId) ?? {
          walletId: tx.walletId,
          depositAmount: 0,
          withdrawAmount: 0,
          depositCount: 0,
          withdrawCount: 0,
        };

        if (tx.type === WalletTransactionType.Credit) {
          stat.depositAmount += Number(tx.amount);
          stat.depositCount++;
        } else {
          stat.withdrawAmount += Number(tx.amount);
          stat.withdrawCount++;
        }

        statsMap.set(userId, stat);
      }

      // 4️⃣ Upsert stats for each user
      for (const [userId, stat] of statsMap.entries()) {
        const updated = await tx.userWalletStat.updateMany({
          where: { userId },
          data: {
            totalDepositAmount:
              stat.depositAmount > 0
                ? { increment: stat.depositAmount }
                : undefined,
            totalWithdrawAmount:
              stat.withdrawAmount > 0
                ? { increment: stat.withdrawAmount }
                : undefined,
            depositCount:
              stat.depositCount > 0
                ? { increment: stat.depositCount }
                : undefined,
            withdrawCount:
              stat.withdrawCount > 0
                ? { increment: stat.withdrawCount }
                : undefined,
          },
        });

        if (updated.count === 0) {
          // Create new if doesn't exist
          const walletExists = await tx.wallet.findUnique({
            where: { id: stat.walletId },
            select: { id: true },
          });

          if (!walletExists) {
            this.logger.warn(
              `Skipping userWalletStat create: wallet not found (walletId=${stat.walletId})`,
            );
            continue;
          }

          await tx.userWalletStat.create({
            data: {
              userId,
              walletId: stat.walletId,
              totalDepositAmount: stat.depositAmount,
              totalWithdrawAmount: stat.withdrawAmount,
              depositCount: stat.depositCount,
              withdrawCount: stat.withdrawCount,
            },
          });
        }
      }
      const lastProcessedId = transactions[transactions.length - 1].id;

      await tx.walletTransactionCursor.upsert({
        where: { id: 1 },
        update: { lastTransactionId: lastProcessedId },
        create: { id: 1, lastTransactionId: lastProcessedId },
      });

      this.logger.info(
        `Processed ${transactions.length} wallet transactions | lastTxId=${lastProcessedId}`,
      );

      return true;
    });
  }
}
