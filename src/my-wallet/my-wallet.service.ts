import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import {
  ExportStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { DepositTurnoverQueryDto } from './dto/deposit-turnover-query.dto';
import { Pagination } from '@Common';

export class DepositTurnoverDto {
  depositId: bigint;
  required: number;
  completed: number;
  remaining: number;
  progress: number;
  status: 'Pending' | 'Completed';
  warning?: string;
}

@Injectable()
export class MyWalletService {
  constructor(private readonly prisma: PrismaService) {}
  async getWalletSummary(userId: bigint) {
    // Fetch wallet balances
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
    });

    const depositWallet = wallets.find((w) => w.type === WalletType.Main);
    const bonusWallet = wallets.find((w) => w.type === WalletType.Bonus);

    const depositBalance = await this.prisma.depositWithdrawRequest.aggregate({
      where: {
        userId,
        type: WalletTransactionType.Credit,
        status: { in: ['Approved', 'Confirmed'] },
      },
      _sum: { amount: true },
    });

    // Locked withdraw amounts (pending/processing)
    const locked = await this.prisma.depositWithdrawRequest.aggregate({
      where: {
        userId,
        type: WalletTransactionType.Debit,
        status: { in: ['Pending'] },
      },
      _sum: { amount: true },
    });

    // Completed turnover accounts for available withdrawals
    const availableWithdrawals = await this.getAvailableWithdrawals(userId);

    const depositAmount = Number(depositWallet?.amount ?? 0);
    const bonusAmount = Number(bonusWallet?.amount ?? 0);
    const lockedAmount = Number(locked._sum.amount ?? 0);

    return {
      totalBalance: depositAmount + bonusAmount,
      depositBalance: depositBalance._sum.amount,
      bonusBalance: bonusAmount,
      lockedBalance: lockedAmount,
      availableWithdrawals,
    };
  }

  async getAvailableWithdrawals(userId: bigint): Promise<number> {
    // Main wallet
    const mainWallet = await this.prisma.wallet.findFirst({
      where: {
        userId,
        type: WalletType.Main,
      },
    });

    const mainBalance = Number(mainWallet?.amount ?? 0);
    const lockedAmount = Number(mainWallet?.lockedAmount ?? 0);
    const exposureAmount = Number(mainWallet?.exposureAmount.abs() ?? 0);

    const pendingTurnovers = await this.prisma.userTurnoverAccount.findMany({
      where: {
        userId,
        turnoverType: WalletType.Main,
        status: ExportStatus.Pending,
      },
      select: {
        requiredTurnover: true,
        returnedAmount: true,
        lockedWinning: true,
      },
    });

    const lockedTurnover = pendingTurnovers.reduce((sum, t) => {
      // const remaining = Number(t.requiredTurnover) - Number(t.returnedAmount);
      const remaining = Number(t.requiredTurnover);
      const lockedWin = Number(t.lockedWinning);
      return sum + Math.max(remaining, 0) + Math.max(lockedWin, 0);
    }, 0);

    // Final withdrawable amount
    const availableWithdrawals = Math.max(
      mainBalance - lockedAmount - lockedTurnover - exposureAmount,
      0,
    );

    return Number(availableWithdrawals.toFixed(2));
  }

  async getDepositTurnovers(
    userId: bigint,
    query: DepositTurnoverQueryDto,
  ): Promise<{
    data: DepositTurnoverDto[];
    pagination: Pagination;
  }> {
    const { status } = query;

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      userId,
      turnoverType: WalletType.Main,
    };

    if (status) {
      whereClause.status = status;
    }

    const [rows, total] = await Promise.all([
      this.prisma.userTurnoverAccount.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip,
      }),
      this.prisma.userTurnoverAccount.count({
        where: whereClause,
      }),
    ]);

    const data: DepositTurnoverDto[] = rows.map((row) => {
      const required = Number(row.requiredTurnover);
      const completed = Number(row.returnedAmount);
      const remaining = Math.max(required - completed, 0);

      const progress =
        required > 0 ? Math.min((completed / required) * 100, 100) : 0;

      const isCompleted = row.status === ExportStatus.Completed;

      return {
        depositId: row.depositId,
        required,
        completed,
        remaining,
        progress: Number(progress.toFixed(2)),
        status: isCompleted ? 'Completed' : 'Pending',
        warning: isCompleted
          ? 'Deposit turnover is completed'
          : '⚠️ Complete deposit turnover bonus turnover begins',
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit,
      totalItems: total,
      totalPage: Math.ceil(total / limit),
    };

    return {
      data,
      pagination,
    };
  }
}
