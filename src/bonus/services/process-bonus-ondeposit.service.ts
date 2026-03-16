import { BaseService, UtilsService } from '@Common';
import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  Prisma,
  WalletTransactionContext,
  WalletTransactionStatus,
} from '@prisma/client';
import { BonusProcessor } from './bonus.internal.processor';
import { PrismaService } from 'src/prisma';
import { WalletTransactionsService } from 'src/wallet-transactions';

@Injectable()
export class BonusDepositProcessor
  extends BaseService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private isProcessorIdle = true;
  private isShutDownInProgress = false;

  constructor(
    private readonly utilsService: UtilsService,
    private readonly prisma: PrismaService,
    private readonly bonusProcessor: BonusProcessor,
    private readonly walletTransactionsService: WalletTransactionsService,
  ) {
    super({ loggerDefaultMeta: { service: BonusDepositProcessor.name } });
  }

  onApplicationBootstrap() {
    if (this.utilsService.isMaster()) {
      this.processor();
    }
  }

  async onModuleDestroy() {
    this.isShutDownInProgress = true;
    await this.utilsService.waitUntilValue(() => this.isProcessorIdle, true);
  }

  async processor() {
    if (!this.isProcessorIdle || this.isShutDownInProgress) return;

    this.isProcessorIdle = false;
    this.logger.log('info', 'Deposit Bonus Processor is started...');

    try {
      await this.utilsService.retryable(async () => {
        if (this.isShutDownInProgress) return;

        // ✅ Fetch unprocessed deposit transactions
        const walletTxn = await this.prisma.walletTransactions.findMany({
          where: {
            wallet: {
              user: {
                role: {
                  name: 'USER',
                },
              },
            },
            isBonusProcessed: false,
            AND: [
              {
                OR: [
                  { context: WalletTransactionContext.SystemDeposit },
                  { context: WalletTransactionContext.Deposit },
                  { context: WalletTransactionContext.CryptoDeposit },
                ],
              },
              {
                OR: [
                  { status: WalletTransactionStatus.Approved },
                  { status: WalletTransactionStatus.Confirmed },
                ],
              },
            ],
          },
          select: {
            id: true,
            walletId: true,
            entityId: true, // ✅ This should contain the DepositWithdrawRequest.id
            wallet: {
              select: {
                userId: true,
              },
            },
          },
          take: 50,
        });

        this.logger.debug(
          `Found ${walletTxn.length} unprocessed deposit transactions`,
        );

        // ✅ Process unique wallets to avoid race conditions
        const batchedWallets = new Set<bigint>();

        for (const txn of walletTxn) {
          if (batchedWallets.has(txn.walletId)) continue;

          batchedWallets.add(txn.walletId);

          await this.processDepositBasedBonus(txn.id);
        }
      });
    } finally {
      this.isProcessorIdle = true;
    }

    if (!this.isShutDownInProgress) {
      setTimeout(() => this.processor(), 2500);
    }
  }

  async processDepositBasedBonus(txnId: bigint) {
    this.logger.debug(`Processing deposit bonus for txnId=${txnId}`);

    const walletTxn = await this.prisma.walletTransactions.findFirst({
      where: {
        id: txnId,
        isBonusProcessed: false,
      },
      select: {
        id: true,
        amount: true,
        walletId: true,
        context: true,
        entityId: true, // ✅ This should be the DepositWithdrawRequest.id as a string
        wallet: {
          select: {
            userId: true,
          },
        },
      },
    });

    console.log('line 140 : ', walletTxn);
    if (!walletTxn) {
      this.logger.debug(`Txn ${txnId} already processed or not found`);
      return;
    }

    // ✅ CRITICAL FIX: Parse the entityId to get the actual deposit ID
    let depositId: number | null = null;

    try {
      // entityId is stored as string in wallet_transactions, parse it to number
      depositId = Number(walletTxn.entityId);

      if (isNaN(depositId)) {
        this.logger.error(
          `❌ Invalid entityId in wallet transaction: ${walletTxn.entityId}`,
        );
        depositId = null;
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to parse entityId: ${walletTxn.entityId}`,
        error,
      );
      depositId = null;
    }

    let amount: Prisma.Decimal | null = null;

    if (depositId) {
      // ✅ Verify the deposit record exists before processing
      const depositRecord = await this.prisma.depositWithdrawRequest.findUnique(
        {
          where: { id: depositId },
          select: {
            id: true,
            userId: true,
            amount: true,
          },
        },
      );
      console.log('line 176 : ', depositRecord);
      if (!depositRecord) {
        this.logger.error(
          `❌ Deposit record not found for depositId: ${depositId} (from txnId: ${txnId})`,
        );
        // ✅ Mark as processed to avoid retrying forever
        await this.prisma.walletTransactions.update({
          where: { id: walletTxn.id },
          data: { isBonusProcessed: true },
        });
        return;
      }

      // ✅ Verify user IDs match
      if (depositRecord.userId !== walletTxn.wallet.userId) {
        this.logger.error(
          `❌ User ID mismatch: Deposit user ${depositRecord.userId} vs Wallet user ${walletTxn.wallet.userId}`,
        );
        await this.prisma.walletTransactions.update({
          where: { id: walletTxn.id },
          data: { isBonusProcessed: true },
        });
        return;
      }
      this.logger.debug(
        `✅ Processing bonus for user ${depositRecord.userId}, deposit ${depositId}, amount ${depositRecord.amount}`,
      );

      amount = depositRecord.amount;
    }

    if (!amount) amount = walletTxn.amount;

    return this.prisma.$transaction(async (tx) => {
      // ✅ Check if this is the user's first deposit
      const isFirstDeposit =
        await this.walletTransactionsService.isFirstDeposit(
          tx,
          walletTxn.wallet.userId!,
        );

      this.logger.debug(
        `User ${walletTxn.wallet.userId} - First Deposit: ${isFirstDeposit}`,
      );

      // ✅ Emit the deposit event with the correct deposit ID
      await this.bonusProcessor.emitDepositEvent(
        Number(walletTxn.wallet.userId)!,
        amount, // ✅ Use actual deposit amount
        depositId, // ✅ Use the real deposit ID, not wallet transaction ID
        isFirstDeposit,
      );

      // ✅ Mark as processed
      await tx.walletTransactions.update({
        where: { id: walletTxn.id },
        data: { isBonusProcessed: true },
      });

      this.logger.debug(`✅ Deposit bonus processed for txnId=${txnId}`);
    });
  }
}
