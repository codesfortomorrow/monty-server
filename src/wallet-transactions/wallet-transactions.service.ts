import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WalletTransactions,
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
  User,
  Wallet,
  Admin,
  WalletTransactionStatus,
} from '@prisma/client';
import { isNumberString, isPhoneNumber, isString } from 'class-validator';
import { PrismaService } from '../prisma';
import { WalletTransactionContextMeta } from './wallet-transactions.types';
import { Pagination } from '@Common';
import { RecordType } from 'src/transactions/dto';

@Injectable()
export class WalletTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: {
      context: WalletTransactionContext;
      walletId: bigint;
      type: WalletTransactionType;
      amount: Prisma.Decimal;
      availableBalance: Prisma.Decimal;
      nonce: number;
      timestamp: Date;
      entityId?: bigint | number | string;
      meta?: Prisma.InputJsonValue;
      narration?: string;
      fromAccount?: string;
      toAccount?: string;
    },
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    const wallet = await prismaClient.wallet.findUnique({
      where: { id: data.walletId },
    });
    if (!wallet) throw new Error('Wallet not found');
    return await prismaClient.walletTransactions.create({
      data: {
        context: data.context,
        type: data.type,
        walletId: data.walletId,
        amount: data.amount,
        availableBalance: data.availableBalance,
        nonce: data.nonce,
        timestamp: data.timestamp,
        entityId:
          typeof data.entityId === 'string'
            ? data.entityId
            : data.entityId?.toString(),
        meta: data.meta,
        narration: data.narration,
        currencyId: wallet.currencyId,
        fromAccount: data.fromAccount,
        toAccount: data.toAccount,
      },
    });
  }

  async createMany(
    data: {
      context: WalletTransactionContext;
      walletId: bigint;
      currencyId: number;
      type: WalletTransactionType;
      amount: Prisma.Decimal;
      availableBalance: Prisma.Decimal;
      nonce: number;
      timestamp: Date;
      entityId?: bigint | number | string;
      meta?: Prisma.InputJsonValue;
      narration?: string;
    }[],
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    return await prismaClient.walletTransactions.createMany({
      data: data.map((t) => ({
        context: t.context,
        type: t.type,
        walletId: t.walletId,
        amount: t.amount,
        availableBalance: t.availableBalance,
        nonce: t.nonce,
        timestamp: t.timestamp,
        entityId:
          typeof t.entityId === 'string' ? t.entityId : t.entityId?.toString(),
        meta: t.meta,
        narration: t.narration,
        currencyId: t.currencyId,
      })),
    });
  }

  async getAll(options?: {
    search?: string;
    filters?: {
      userId?: bigint;
      fromDate?: Date;
      toDate?: Date;
      context?: WalletTransactionContext;
      walletType?: WalletType;
      type?: WalletTransactionType;
      recordType?: RecordType;
      adminId?: bigint;
    };
    orderBy?: keyof WalletTransactions;
    sortOrder?: Prisma.SortOrder;
    page?: number;
    limit?: number;
    isExport?: boolean;
  }) {
    // Pagination defaults
    let take = undefined,
      skip = undefined;
    if (
      options &&
      options.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      const page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (page - 1) * options.limit;
    }

    if (!options) options = {};
    options.search = options.search && options.search.trim();
    if (!options.orderBy) {
      options.orderBy = options.filters?.walletType ? 'nonce' : 'timestamp';
    }

    const searchOR: Prisma.WalletTransactionsWhereInput[] = [];

    const search: { txId?: bigint; mobile?: string; betSlipId?: bigint } = {};
    if (options.search && isNumberString(options.search)) {
      search.txId = BigInt(options.search);
      search.betSlipId = BigInt(options.search);
    }
    if (options.search && isPhoneNumber(options.search)) {
      search.mobile = options.search;
    }
    if (options.search && isString(options.search)) {
      searchOR.push({
        fromAccount: {
          contains: options.search,
          mode: 'insensitive',
        },
      });

      searchOR.push({
        toAccount: {
          contains: options.search,
          mode: 'insensitive',
        },
      });
    }

    const where: Prisma.WalletTransactionsWhereInput = {
      type: options.filters?.type,
      wallet: {
        userId: options.filters?.userId,
        adminId: options.filters?.adminId,
        type: options.filters?.walletType,
        user:
          search.mobile && !search.betSlipId && !search.txId
            ? { mobile: search.mobile }
            : undefined,
      },
      timestamp: {
        gte: options.filters?.fromDate,
        lte: options.filters?.toDate,
      },
      ...(searchOR.length ? { OR: searchOR } : {}),
    };

    // If recordType = TRANSACTION → override context condition with OR
    if (options.filters?.recordType === RecordType.Transaction) {
      where.context = {
        in: [
          WalletTransactionContext.Deposit,
          WalletTransactionContext.Withdrawal,
          WalletTransactionContext.WithdrawalRefund,
          WalletTransactionContext.CryptoDeposit,
          WalletTransactionContext.CryptoWithdrawal,
          WalletTransactionContext.SystemDeposit,
          WalletTransactionContext.SystemWithdrawal,
          WalletTransactionContext.Bonus,
          WalletTransactionContext.BonusSettlement,
          WalletTransactionContext.DepositBonus,
          WalletTransactionContext.JoiningBonus,
          WalletTransactionContext.LossBackBonus,
          WalletTransactionContext.ReferralBonus,
          WalletTransactionContext.ReferralLossCommissionBonus,
        ],
      };
    }

    if (options.filters?.recordType === RecordType.Gaming) {
      where.context = {
        in: [
          WalletTransactionContext.Bet,
          WalletTransactionContext.BetRefund,
          WalletTransactionContext.CasinoBet,
          WalletTransactionContext.CasinoBetRefund,
          WalletTransactionContext.CasinoWin,
          WalletTransactionContext.Won,
          WalletTransactionContext.Lost,
          WalletTransactionContext.Rollback,
        ],
      };
    }

    if (options.filters?.recordType === RecordType.Sports) {
      where.context = {
        in: [
          WalletTransactionContext.Bet,
          WalletTransactionContext.BetRefund,
          WalletTransactionContext.Won,
          WalletTransactionContext.Lost,
          WalletTransactionContext.Rollback,
        ],
      };
    }

    if (options.filters?.context === WalletTransactionContext.Bonus) {
      where.context = {
        in: [
          WalletTransactionContext.Bonus,
          WalletTransactionContext.BonusSettlement,
          WalletTransactionContext.JoiningBonus,
          WalletTransactionContext.ReferralBonus,
          WalletTransactionContext.ReferralLossCommissionBonus,
          WalletTransactionContext.LossBackBonus,
          WalletTransactionContext.DepositBonus,
        ],
      };
    }

    if (options.filters?.recordType === RecordType.Casino) {
      where.context = {
        in: [
          WalletTransactionContext.CasinoBet,
          WalletTransactionContext.CasinoBetRefund,
          WalletTransactionContext.CasinoWin,
        ],
      };
    }

    if (options.filters?.context) {
      where.context = options.filters.context;
    }

    if (options.filters?.context === WalletTransactionContext.Deposit) {
      where.context = {
        in: [
          WalletTransactionContext.Deposit,
          WalletTransactionContext.CryptoDeposit,
          WalletTransactionContext.SystemDeposit,
          WalletTransactionContext.PointIssue,
        ],
      };
    }

    if (options.filters?.context === WalletTransactionContext.Withdrawal) {
      where.context = {
        in: [
          WalletTransactionContext.Withdrawal,
          WalletTransactionContext.CryptoWithdrawal,
          WalletTransactionContext.SystemWithdrawal,
          WalletTransactionContext.PointRemove,
        ],
      };
    }

    const totalTransactions = await this.prisma.walletTransactions.count({
      where,
    });
    const transactions = await this.prisma.walletTransactions.findMany({
      include: {
        wallet: {
          select: {
            user: true,
          },
        },
      },
      where,
      orderBy: {
        [options.orderBy]: options.sortOrder || Prisma.SortOrder.desc,
      },
      skip: skip,
      take: take,
    });

    const grouped = transactions.reduce(
      (acc, tx) => {
        const wid = tx.walletId.toString();
        if (!acc[wid]) acc[wid] = [];
        acc[wid].push(tx);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    for (const wid in grouped) {
      let balance = 0;

      grouped[wid].sort((a, b) => {
        return (
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() ||
          a.nonce - b.nonce
        );
      });

      for (const tx of grouped[wid]) {
        balance += Number(tx.amount);
        tx.runningBalance = balance;
      }
    }

    const finalList = Object.values(grouped).flat();

    const totalPage = Math.ceil(
      totalTransactions /
        (options.limit && options.limit > 0
          ? options.limit
          : totalTransactions < 1
            ? 1
            : totalTransactions),
    );

    const pagination: Pagination = {
      currentPage: options.page ?? 1,
      totalPage,
      totalItems: totalTransactions,
      limit: take ?? 10,
    };

    const updatedTransactions = transactions.map((t) => ({
      ...t,
      context: this.simplifyContext(t.context),
    }));

    return {
      // count: totalTransactions,
      // skip: options?.skip || 0,
      // take: options?.take || 10,
      pagination,
      data: updatedTransactions,
    };
  }

  simplifyContext = (context: WalletTransactionContext) => {
    switch (context) {
      case WalletTransactionContext.Deposit:
      case WalletTransactionContext.SystemDeposit:
      case WalletTransactionContext.CryptoDeposit:
      case WalletTransactionContext.PointIssue:
        return WalletTransactionContext.Deposit;
      case WalletTransactionContext.Withdrawal:
      case WalletTransactionContext.SystemWithdrawal:
      case WalletTransactionContext.CryptoWithdrawal:
      case WalletTransactionContext.PointRemove:
        return WalletTransactionContext.Withdrawal;
      default:
        return context;
    }
  };

  narrationBuilder(
    tx: {
      context: WalletTransactionContext;
      entityId: string | null;
      meta: any;
    },
    meta: WalletTransactionContextMeta,
  ): string {
    tx.entityId = tx.entityId ?? '';
    tx.meta = (tx.meta as { gameName: string; extra: string })?.gameName ?? '';
    switch (meta.context) {
      case WalletTransactionContext.Deposit:
        return `Money Deposit for Ref Id:${tx.entityId}`;
      case WalletTransactionContext.Withdrawal:
        return `Money Withdrawal for Ref Id:${tx.entityId}`;
      case WalletTransactionContext.SystemDeposit:
        return 'Deposit By Admin';
      case WalletTransactionContext.SystemWithdrawal:
        return 'Withdraw By Admin';
      case WalletTransactionContext.CryptoDeposit:
        return `Crypto Deposit for Ref Id:${tx.entityId} `;
      case WalletTransactionContext.CryptoWithdrawal:
        return `Crypto Withdrawal for Ref Id:${tx.entityId} `;
      case WalletTransactionContext.Won:
        return `Winning amount credited`;
      case WalletTransactionContext.Lost:
        return `Loss settled`;
      case WalletTransactionContext.Bet:
        return `Stake amount placed for bet slip ${tx.entityId}`;
      case WalletTransactionContext.BetRefund:
        return `Stake amount refunded for bet slip ${tx.entityId}`;
      case WalletTransactionContext.Rollback:
        return `Rollback processed for bet slip ${tx.entityId}`;
      case WalletTransactionContext.CasinoBet:
        return `Paid for casino: ${tx.meta}`;
      case WalletTransactionContext.CasinoWin:
        return `Winnings received casino: ${tx.meta}`;
      case WalletTransactionContext.CasinoBetRefund:
        return `Rollback initiated for casino: ${tx.meta}`;
      case WalletTransactionContext.Bonus:
        return `Bonus amount added to your account`;
      case WalletTransactionContext.BonusSettlement:
        return `Bonus amount added to your main account`;
      case WalletTransactionContext.JoiningBonus:
        return `Joining bonus added to your account`;
      case WalletTransactionContext.ReferralBonus:
        return `Referral bonus added to your account`;
      case WalletTransactionContext.ReferralLossCommissionBonus:
        return `Referral loss commission bonus added to your account`;
      case WalletTransactionContext.LossBackBonus:
        return `Loss-back bonus added to your account`;
      case WalletTransactionContext.DepositBonus:
        return `Deposit bonus added to your account`;
      case WalletTransactionContext.PointIssue:
        return `Points issued to the account`;
      case WalletTransactionContext.PointRemove:
        return `Points deducted from the account`;

      default:
        return 'N/A';
    }
  }

  async isFirstDeposit(
    tx: Prisma.TransactionClient,
    userId: bigint | number,
  ): Promise<boolean> {
    const successfulDepositsCount = await tx.walletTransactions.count({
      where: {
        wallet: {
          userId,
          type: WalletType.Main,
        },
        AND: [
          {
            OR: [
              { context: WalletTransactionContext.SystemDeposit },
              { context: WalletTransactionContext.Deposit },
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
    });

    console.log('successfulDepositsCount : ', successfulDepositsCount);

    return successfulDepositsCount === 1;
  }
}
