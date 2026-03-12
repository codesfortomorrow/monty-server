import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  BonusCategory,
  Prisma,
  Wallet,
  WalletTransactionContext,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { UserType, UtilsService } from '@Common';
import { currencyConfigFactory, walletConfigFactory } from '@Config';
import { PrismaService } from '../prisma';
import { WalletTransactionsService } from '../wallet-transactions';
import { Decimal } from '@prisma/client/runtime/library';
import { ExposureService } from 'src/exposure/exposure.service';
import { CreditLimitRequest, UpdateBalanceRequest } from './dto';
// import {
//   BonusProcessContext,
//   BonusProcessor,
// } from 'src/bonus/services/bonus.internal.processor';
// import { UserTurnoverAccountService } from 'src/turnover/user-turnover-account.service';
import { MyWalletService } from 'src/my-wallet/my-wallet.service';
// import { PaymentsService } from '../payments';

interface WalletOptions {
  tx: Prisma.TransactionClient; // Prisma transaction client
  context?: WalletTransactionContext;
  entityId?: string;
  meta?: JSON;
}

export type WalletView = Wallet & {
  withdrawableBalance?: Decimal;
  depositBalance?: Decimal;
};

@Injectable()
export class WalletsService {
  constructor(
    @Inject(walletConfigFactory.KEY)
    private readonly config: ConfigType<typeof walletConfigFactory>,
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
    // private readonly paymentsService: PaymentsService,
    private readonly walletTransactionsService: WalletTransactionsService,
    private readonly exposureService: ExposureService,
    private readonly myWalletService: MyWalletService,
    // @Inject(forwardRef(() => BonusProcessor))
    // private bonusProcessor: BonusProcessor,
    // @Inject(forwardRef(() => UserTurnoverAccountService))
    // private readonly userTurnoverAccountService: UserTurnoverAccountService,
    @Inject(currencyConfigFactory.KEY)
    private readonly currencyConfig: ConfigType<typeof currencyConfigFactory>,
  ) {}

  async getById(
    walletId: bigint,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<Wallet> {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    return await prismaClient.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
  }

  async getByUserId(
    userId: bigint | number,
    type: WalletType,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<Wallet & { user: { isSelfRegistered: boolean } | null }> {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    return await prismaClient.wallet.findUniqueOrThrow({
      where: { userId_type: { userId, type } },
      include: { user: { select: { isSelfRegistered: true } } },
    });
  }

  async getByAdminId(
    adminId: bigint | number,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<Wallet> {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    const wallet = await prismaClient.wallet.findFirst({
      where: { adminId: adminId, type: WalletType.Main },
    });
    if (!wallet) throw new Error('Wallet not found');
    return wallet;
  }

  async getBalanceOf(
    userId: bigint,
    type: WalletType,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<Prisma.Decimal> {
    const wallet = await this.getByUserId(userId, type, {
      tx: options?.tx,
    });

    return wallet.amount;
  }

  // async getWithdrawalMainBalanceOf(
  //   userId: bigint,
  //   date?: string,
  //   options?: { tx?: Prisma.TransactionClient },
  // ): Promise<Prisma.Decimal> {
  //   return await this.paymentsService.getWithdrawalAmountOf(userId, date, {
  //     tx: options?.tx,
  //   });
  // }

  async getAllByUserId(
    userId: bigint,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<WalletView[]> {
    const prismaClient = options?.tx ?? this.prisma;

    const wallets = await prismaClient.wallet.findMany({
      where: { userId },
    });

    const mainWallet = wallets.find((w) => w.type === WalletType.Main);

    const bonusWallet = wallets.find((w) => w.type === WalletType.Bonus);

    const depositBalance = await this.prisma.depositWithdrawRequest.aggregate({
      where: {
        userId,
        type: WalletTransactionType.Credit,
        status: { in: ['Approved', 'Confirmed'] },
      },
      _sum: { amount: true },
    });

    const withdrawableBalance =
      await this.myWalletService.getAvailableWithdrawals(userId);

    const result: WalletView[] = [];

    if (bonusWallet) {
      result.push(bonusWallet);
    }

    if (mainWallet) {
      result.push({
        ...mainWallet,
        withdrawableBalance: new Prisma.Decimal(withdrawableBalance || 0),
        depositBalance: new Prisma.Decimal(depositBalance._sum.amount || 0),
      });
    }

    return wallets;
  }

  async create(userId: bigint, options: { tx: Prisma.TransactionClient }) {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    const currencyCode = this.currencyConfig.currencyCode;
    if (!currencyCode) throw new Error('Default Currency Code is missing');
    const currency = await prismaClient.currency.findUnique({
      where: { code: currencyCode },
    });
    if (!currency) throw new Error('Currency not found');
    const wallets = await prismaClient.wallet.createMany({
      data: [
        {
          type: WalletType.Main,
          userId,
          currencyId: currency.id,
        },
        {
          type: WalletType.Bonus,
          userId,
          currencyId: currency.id,
        },
      ],
    });

    // Add fake initial balance into the wallet for non production environment only
    // if (!this.utilsService.isProductionApp()) {
    //   await this.addBalance(
    //     userId,
    //     new Prisma.Decimal(this.config.fakeDepositAmount),
    //     WalletType.Main,
    //     { tx: options?.tx, context: WalletTransactionContext.Deposit },
    //   );
    // }

    return wallets;
  }

  async incrVersion(
    walletId: bigint,
    currentVersion: number,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<Wallet> {
    const prismaClient = options?.tx ? options.tx : this.prisma;
    return await prismaClient.wallet.update({
      data: {
        version: { increment: 1 },
      },
      where: {
        id: walletId,
        version: currentVersion,
      },
    });
  }

  async addBalance(
    userId: bigint | number,
    amount: Prisma.Decimal,
    walletType: WalletType,
    settlement: boolean = false,
    options: {
      tx: Prisma.TransactionClient;
      context: WalletTransactionContext;
      entityId?: bigint;
      meta?: Prisma.InputJsonValue;
      narration?: string;
      fromAccount?: string;
      toAccount?: string;
    },
  ) {
    const prismaClient = options.tx;
    console.log('walletType : ', walletType);
    // Always credit with positive value
    amount = amount.abs();
    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: prismaClient,
      });
      let newCredit = wallet.creditAmount;
      if (wallet.user && wallet.user.isSelfRegistered) {
        newCredit = new Prisma.Decimal(0);
      } else {
        if (settlement) {
          newCredit;
        } else {
          newCredit = Prisma.Decimal.max(
            wallet.creditAmount.add(amount),
            new Prisma.Decimal(0),
          );
        }
      }
      const updatedWallet = await prismaClient.wallet.update({
        data: {
          amount: { increment: amount },
          creditAmount: newCredit,
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      // Create wallet transaction (deposit / credit)
      await this.walletTransactionsService.create(
        {
          context: options.context,
          walletId: wallet.id,
          type: WalletTransactionType.Credit,
          amount,
          availableBalance: updatedWallet.amount,
          nonce: updatedWallet.version,
          timestamp: updatedWallet.updatedAt,
          entityId: options.entityId,
          meta: options.meta,
          narration: options.narration,
          fromAccount: options.fromAccount,
          toAccount: options.toAccount,
        },
        { tx: prismaClient },
      );

      // // TODO: Move to column based processing
      // if (options.context === WalletTransactionContext.Deposit) {
      //   // Create main wallet turnover only if transaction created
      //   if (walletTransaction.id) {
      //     const mainWalletTurnoverPercentage = 1; // 1x

      //     // Calculate required turnover as 1x of the deposited amount
      //     const requiredTurnover = new Decimal(amount).mul(
      //       mainWalletTurnoverPercentage,
      //     );

      //     await this.userTurnoverAccountService.createTurnoverAccount({
      //       userId: BigInt(userId),
      //       depositId: BigInt(walletTransaction.id),
      //       walletId: BigInt(updatedWallet.id),
      //       amount: new Decimal(amount),
      //       requiredTurnover: requiredTurnover,
      //       walletType: WalletType.Main,
      //       tx: prismaClient,
      //     });
      //   }

      //   // Check if this is first deposit
      //   const isFirstDeposit =
      //     await this.walletTransactionsService.isFirstDeposit(
      //       prismaClient,
      //       BigInt(userId),
      //     );

      //   const bonusContext: BonusProcessContext = {
      //     depositAmount: new Decimal(amount),
      //     depositId: BigInt(walletTransaction.id), // use wallet transaction ID
      //     refereeId: BigInt(userId),
      //     meta: {
      //       context: options.context,
      //       entityId: options.entityId?.toString(),
      //       message: 'Deposit approved',
      //     },
      //   };

      //   // Process bonus deposit
      //   await this.bonusProcessor.processBonusDeposit(
      //     BigInt(userId),
      //     isFirstDeposit,
      //     bonusContext,
      //     prismaClient,
      //   );
      // }

      return updatedWallet;
    });
  }

  async subtractBalance(
    userId: bigint | number,
    amount: Prisma.Decimal,
    walletType: WalletType,
    settlement: boolean = false,
    options: {
      tx: Prisma.TransactionClient;
      context: WalletTransactionContext;
      entityId?: bigint | number;
      meta?: Prisma.InputJsonValue;
      narration?: string;
      fromAccount?: string;
      toAccount?: string;
    },
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: options.tx,
      });
      let newCredit = wallet.creditAmount;
      if (wallet.user && wallet.user.isSelfRegistered) {
        newCredit = new Prisma.Decimal(0);
      } else {
        if (settlement) {
          newCredit;
        } else {
          newCredit = Prisma.Decimal.max(
            wallet.creditAmount.sub(amount),
            new Prisma.Decimal(0),
          );
        }
      }
      const newAmount = wallet.amount.sub(amount);
      if (
        newAmount.lessThan(0) &&
        (walletType !== WalletType.Main ||
          options.context !== WalletTransactionContext.SystemWithdrawal)
      ) {
        throw new Error('Insufficient balance');
      }

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          amount: newAmount,
          creditAmount: newCredit,
          version: { increment: 1 },
        },

        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      await this.walletTransactionsService.create(
        {
          context: options.context,
          walletId: wallet.id,
          type: WalletTransactionType.Debit,
          amount,
          availableBalance: updatedWallet.amount,
          nonce: updatedWallet.version,
          timestamp: updatedWallet.updatedAt,
          entityId: options.entityId,
          meta: options.meta,
          narration: options.narration,
          fromAccount: options.fromAccount,
          toAccount: options.toAccount,
        },
        { tx: options.tx },
      );

      return updatedWallet;
    });
  }
  async subtractBalanceFromOwner(
    adminId: bigint | number,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: {
      tx: Prisma.TransactionClient;
      context: WalletTransactionContext;
      entityId?: bigint | number;
      meta?: Prisma.InputJsonValue;
      narration?: string;
      fromAccount?: string;
      toAccount?: string;
    },
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByAdminId(adminId, {
        tx: options.tx,
      });
      console.log('Owner Wallet', wallet);
      const newAmount = wallet.amount.sub(amount);
      if (newAmount.lessThan(0)) {
        throw new Error('Insufficient balance');
      }

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          amount: newAmount,
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      await this.walletTransactionsService.create(
        {
          context: options.context,
          walletId: wallet.id,
          type: WalletTransactionType.Debit,
          amount,
          availableBalance: updatedWallet.amount,
          nonce: updatedWallet.version,
          timestamp: updatedWallet.updatedAt,
          entityId: options.entityId,
          meta: options.meta,
          fromAccount: options.fromAccount,
          toAccount: options.toAccount,
          narration: options.narration,
        },
        { tx: options.tx },
      );

      return updatedWallet;
    });
  }
  async addBalanceToOwner(
    adminId: bigint | number,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: {
      tx: Prisma.TransactionClient;
      context: WalletTransactionContext;
      entityId?: bigint | number;
      meta?: Prisma.InputJsonValue;
      narration?: string;
      fromAccount?: string;
      toAccount?: string;
    },
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByAdminId(adminId, {
        tx: options.tx,
      });

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          amount: {
            increment: amount,
          },
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      await this.walletTransactionsService.create(
        {
          context: options.context,
          walletId: wallet.id,
          type: WalletTransactionType.Credit,
          amount,
          availableBalance: updatedWallet.amount,
          nonce: updatedWallet.version,
          timestamp: updatedWallet.updatedAt,
          entityId: options.entityId,
          meta: options.meta,
          narration: options.narration,
          fromAccount: options.fromAccount,
          toAccount: options.toAccount,
        },
        { tx: options.tx },
      );

      return updatedWallet;
    });
  }

  async addCreditAmount(
    userId: bigint | number,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: WalletOptions,
  ) {
    const prismaClient = options.tx;

    console.log('Add crerdit amoumnt', amount);

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: options.tx,
      });

      console.log('Add crerdit amoumnt', wallet.creditAmount, amount);
      const updatedWallet = await prismaClient.wallet.update({
        data: {
          creditAmount: {
            increment: amount,
          },
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      return updatedWallet;
    });
  }

  async subtractCreditAmount(
    userId: bigint,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: WalletOptions,
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: options.tx,
      });
      const newAmount = wallet.creditAmount.sub(amount);
      if (
        newAmount.lessThan(0) &&
        (walletType !== WalletType.Main ||
          options.context !== WalletTransactionContext.SystemWithdrawal)
      ) {
        throw new Error('Insufficient balance');
      }

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          creditAmount: newAmount,
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      return updatedWallet;
    });
  }

  async refreshExposureAmount(userId: bigint, options: WalletOptions) {
    const tx = options.tx ?? this.prisma;

    // Step 1: Fetch MAIN & BONUS wallets
    const mainWallet = await tx.wallet.findFirst({
      where: { userId, type: WalletType.Main },
    });
    const bonusWallet = await tx.wallet.findFirst({
      where: { userId, type: WalletType.Bonus },
    });

    if (!mainWallet || !bonusWallet) throw new Error('WALLET_NOT_FOUND');

    // Step 2: Recalculate total required exposure (always negative)
    const refreshedExposureAmount =
      await this.exposureService.refreshExposureByUserId(userId, tx);
    const totalRequiredExposure = Math.abs(Number(refreshedExposureAmount));

    // Step 3: Calculate MAIN & BONUS exposure distribution
    const mainAvailable =
      Number(mainWallet.amount) +
      Number(bonusWallet.amount) -
      Number(mainWallet.lockedAmount);
    let mainExposure = 0;
    let remainingExposure = totalRequiredExposure;

    if (remainingExposure > 0) {
      const mainCanTake = Math.min(remainingExposure, mainAvailable);
      mainExposure = -mainCanTake; // always store negative
      remainingExposure -= mainCanTake;
    }

    // Step 4: Update MAIN wallet exposure with optimistic lock
    const mainUpdated = await tx.wallet.updateMany({
      where: {
        id: mainWallet.id,
        version: mainWallet.version,
      },
      data: {
        exposureAmount: new Decimal(mainExposure),
        version: { increment: 1 },
      },
    });
    if (mainUpdated.count === 0) throw new Error('MAIN_VERSION_CONFLICT');

    // Step 5: Ensure exposure fully distributed
    if (remainingExposure > 0) {
      throw new Error('INSUFFICIENT_BALANCE_FOR_EXPOSURE');
    }

    // Step 6: Fetch updated MAIN wallet for return
    const updatedMainWallet = await tx.wallet.findUnique({
      where: { id: mainWallet.id },
    });

    return { updatedWallet: updatedMainWallet };
  }
  async addExposure(
    userId: bigint,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: WalletOptions,
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: options.tx,
      });
      const updatedWallet = await prismaClient.wallet.update({
        data: {
          exposureAmount: {
            increment: amount,
          },
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      return updatedWallet;
    });
  }

  async subtractExposure(
    userId: bigint,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: WalletOptions,
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: options.tx,
      });
      const newAmount = wallet.exposureAmount.sub(amount);

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          exposureAmount: newAmount,
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      return updatedWallet;
    });
  }

  async giveCreditLimit(data: {
    userId: bigint | number;
    creatorId: bigint;
    userType: UserType;
    amount: Prisma.Decimal;
    options: {
      tx: Prisma.TransactionClient;
      context?: WalletTransactionContext;
      entityId?: bigint | number;
      meta?: Prisma.InputJsonValue;
      fromAccount?: string;
      toAccount?: string;
    };
  }) {
    const tx = data.options.tx;
    // if (!roll) {
    //   const user = await tx.user.findUnique({
    //     where: { id: userId },
    //     include: {
    //       role: {
    //         select: {
    //           name: true,
    //         },
    //       },
    //     },
    //   });
    //   if (!user) throw new Error('User not found');
    //   roll = user.role?.name;
    // }

    if (data.userType === UserType.User) {
      const wallet = await this.getByUserId(data.creatorId, WalletType.Main, {
        tx,
      });
      if (wallet.amount.lt(data.amount)) throw new Error('Insuficient amount');

      await this.subtractBalance(
        data.creatorId,
        new Prisma.Decimal(data.amount),
        WalletType.Main,
        false,
        {
          tx,
          context: WalletTransactionContext.PointIssue,
          fromAccount: data.options.fromAccount,
          toAccount: data.options.toAccount,
          narration: `Deposit to downline user ${data.options.toAccount ?? ''}`,
        },
      );
    } else {
      const wallet = await this.getByAdminId(data.creatorId, { tx });
      if (wallet.amount.lt(data.amount)) {
        throw new Error('Insuficient amount');
      }

      await this.subtractBalanceFromOwner(
        data.creatorId,
        new Prisma.Decimal(data.amount),
        WalletType.Main,
        {
          tx,
          context: WalletTransactionContext.PointIssue,
          fromAccount: data.options.fromAccount,
          toAccount: data.options.toAccount,
          narration: `Deposit to downline user ${data.options.toAccount ?? ''}`,
        },
      );
    }

    console.log(
      'Service give credit limit to user before add balance amoumnt',
      data.amount,
    );

    // if (roll === 'USER') {
    await this.addBalance(data.userId, data.amount, WalletType.Main, false, {
      tx,
      context: data.options.context ?? WalletTransactionContext.SystemDeposit,
      fromAccount: data.options.fromAccount,
      toAccount: data.options.toAccount,
      narration: `Deposit from system`,
    });
    console.log(
      'Service give credit limit to user before crerdit amoumnt',
      data.amount,
    );
    // } else {
    await this.addCreditAmount(data.userId, data.amount, WalletType.Main, {
      tx,
      context: data.options.context ?? WalletTransactionContext.SystemDeposit,
    });
    // }
  }

  async giveCreditLimitToUser(data: {
    userId: bigint | number;
    creatorId: bigint;
    userType: UserType;
    body: CreditLimitRequest;
  }) {
    console.log('Before start: ', data.userType);
    console.log(
      'Service give credit limit to user crerdit amoumnt',
      data.body.creditLimit,
    );
    return this.prisma.$transaction(async (tx) => {
      return await this.giveCreditLimit({
        userId: data.userId,
        creatorId: data.creatorId,
        userType: data.userType,
        amount: new Prisma.Decimal(data.body.creditLimit),
        options: {
          tx,
          fromAccount: data.body.fromAccount,
          toAccount: data.body.toAccount,
        },
      });
      //   {userId,
      //   creatorId,
      //   userType,
      //   new Prisma.Decimal(amount),
      //   {
      //     tx,
      //   },}
      // );
    });
  }
  async getTotalPointIssueAmount(userId?: bigint) {
    if (userId) {
      const wallet = await this.getByUserId(userId, WalletType.Main);

      if (!wallet) {
        throw new Error('Wallet not found for this user');
      }
      const result = await this.prisma.walletTransactions.aggregate({
        where: {
          walletId: wallet.id,
          context: WalletTransactionContext.SystemDeposit,
          status: WalletTransactionStatus.Confirmed,
        },
        _sum: {
          amount: true,
        },
      });

      return {
        userId,
        totalPointIssueAmount: result._sum.amount ?? 0,
      };
    }

    const result = await this.prisma.walletTransactions.aggregate({
      where: {
        context: WalletTransactionContext.SystemDeposit,
        status: WalletTransactionStatus.Confirmed,
      },
      _sum: {
        amount: true,
      },
    });

    return {
      userId: null,
      totalPointIssueAmount: result._sum.amount ?? 0,
    };
  }

  async addLockedAmount(
    userId: bigint,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: WalletOptions,
  ) {
    const prismaClient = options.tx;

    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: prismaClient,
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          lockedAmount: {
            increment: amount,
          },
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      return updatedWallet;
    });
  }

  async subtractLockedAmount(
    userId: bigint,
    amount: Prisma.Decimal,
    walletType: WalletType,
    options: WalletOptions,
  ) {
    const prismaClient = options.tx;

    // Remove sign
    amount = amount.abs();
    if (amount.eq(0)) {
      throw new Error('Amount should not be non zero');
    }

    return await this.utilsService.occrunnable(async () => {
      const wallet = await this.getByUserId(userId, walletType, {
        tx: options.tx,
      });

      const newLockedAmount = wallet.lockedAmount.sub(amount);

      if (newLockedAmount.lessThan(0)) {
        throw new Error('Insufficient locked amount');
      }

      const updatedWallet = await prismaClient.wallet.update({
        data: {
          lockedAmount: newLockedAmount,
          version: { increment: 1 },
        },
        where: {
          id: wallet.id,
          version: wallet.version,
        },
      });

      return updatedWallet;
    });
  }

  async depositeBalance(
    userId: bigint | number,
    uplineId: bigint | number,
    userType: UserType,
    data: UpdateBalanceRequest,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      await this.addBalance(
        BigInt(userId),
        new Prisma.Decimal(data.amount).toDP(2),
        WalletType.Main,
        false,
        {
          tx,
          context: WalletTransactionContext.SystemDeposit,
          fromAccount: data.fromAccount,
          toAccount: data.toAccount,
          narration: `Deposit from system`,
          meta: {
            reference: data.refernce,
            fromAccount: data.fromAccount,
            toAccount: data.toAccount,
          },
        },
      );

      if (userType === UserType.User) {
        await this.subtractBalance(
          uplineId,
          new Prisma.Decimal(data.amount).toDP(2),
          WalletType.Main,
          true,
          {
            tx,
            context: WalletTransactionContext.PointIssue,
            fromAccount: data.fromAccount,
            toAccount: data.toAccount,
            narration: `Deposit to downline user ${data.toAccount ?? ''}`,
            meta: {
              reference: data.refernce,
              fromAccount: data.fromAccount,
              toAccount: data.toAccount,
            },
          },
        );
      } else {
        console.log('Upline Id', uplineId);
        await this.subtractBalanceFromOwner(
          uplineId,
          new Prisma.Decimal(data.amount).toDP(2),
          WalletType.Main,
          {
            tx,
            context: WalletTransactionContext.PointIssue,
            fromAccount: data.fromAccount,
            toAccount: data.toAccount,
            narration: `Deposit to downline user ${data.toAccount ?? ''}`,
            meta: {
              reference: data.refernce,
              fromAccount: data.fromAccount,
              toAccount: data.toAccount,
            },
          },
        );
      }
    });
  }

  async withdrawBalance(
    userId: bigint | number,
    uplineId: bigint | number,
    userType: UserType,
    data: UpdateBalanceRequest,
  ) {
    const userWallet = await this.getByUserId(userId, WalletType.Main);
    const withdrawableBalance =
      Number(userWallet.amount) +
      Number(userWallet.exposureAmount) -
      Number(userWallet.lockedAmount);

    if (data.amount > withdrawableBalance)
      throw new Error('Insufficient balance');

    return await this.prisma.$transaction(async (tx) => {
      await this.subtractBalance(
        userId,
        new Prisma.Decimal(data.amount).toDP(2),
        WalletType.Main,
        false,
        {
          tx,
          context: WalletTransactionContext.SystemWithdrawal,
          fromAccount: data.fromAccount,
          toAccount: data.toAccount,
          narration: `Withdraw by system`,
          meta: {
            reference: data.refernce,
            fromAccount: data.fromAccount,
            toAccount: data.toAccount,
          },
        },
      );

      if (userType === UserType.User) {
        await this.addBalance(
          uplineId,
          new Prisma.Decimal(data.amount).toDP(2),
          WalletType.Main,
          true,
          {
            tx,
            context: WalletTransactionContext.PointRemove,
            fromAccount: data.fromAccount,
            toAccount: data.toAccount,
            narration: `Withdraw from downline user ${data.fromAccount ?? ''}`,
            meta: {
              reference: data.refernce,
              fromAccount: data.fromAccount,
              toAccount: data.toAccount,
            },
          },
        );
      } else {
        await this.addBalanceToOwner(
          uplineId,
          new Prisma.Decimal(data.amount).toDP(2),
          WalletType.Main,
          {
            tx,
            context: WalletTransactionContext.PointRemove,
            fromAccount: data.fromAccount,
            toAccount: data.toAccount,
            narration: `Withdraw from downline user ${data.fromAccount ?? ''}`,
            meta: {
              reference: data.refernce,
              fromAccount: data.fromAccount,
              toAccount: data.toAccount,
            },
          },
        );
      }
    });
  }

  async transferBalance(params: {
    userId: bigint | number;
    amount: Prisma.Decimal;
    from: WalletType;
    to: WalletType;
    context: WalletTransactionContext;
    entityId?: bigint | number;
    meta?: Prisma.InputJsonValue;
    fromAccount?: string;
    toAccount?: string;
    tx: Prisma.TransactionClient;
  }) {
    const { amount, tx } = params;
    if (!amount || amount.lte(0)) return;

    const entityId =
      typeof params.entityId === 'number'
        ? BigInt(params.entityId)
        : params.entityId;

    await this.subtractBalance(params.userId, amount, params.from, false, {
      tx,
      context: params.context,
      entityId,
      meta: params.meta,
      fromAccount: params.fromAccount,
      toAccount: params.toAccount,
      narration: `Transfer from ${params.from} to ${params.to}`,
    });

    await this.addBalance(params.userId, amount, params.to, false, {
      tx,
      context: params.context,
      entityId,
      meta: params.meta,
      fromAccount: params.fromAccount,
      toAccount: params.toAccount,
      narration: `Transfer to ${params.to} from ${params.from}`,
    });
  }

  private async getDownlineSummaryForUser(userId: bigint, uplinePath: string) {
    const result = await this.prisma.$queryRawUnsafe<
      {
        total_downline_balance: number;
        player_balance: number;
        player_exposure: number;
      }[]
    >(
      `
    WITH downline AS (
      SELECT
        w.amount,
        w.exposure_amount,
        r.name AS role
      FROM wallets w
      JOIN user_meta um ON um.user_id = w.user_id
      JOIN "user" u ON u.id = w.user_id
      JOIN role r ON r.id = u.role_id
      WHERE w.type = 'main'
        AND um.upline <@ text2ltree($1::text)
        AND um.user_id != $2::bigint
        AND r.name != 'DEMO'
    )
    SELECT
      COALESCE(SUM(amount), 0) AS total_downline_balance,
      COALESCE(SUM(amount) FILTER (WHERE role = 'USER'), 0) AS player_balance,
      COALESCE(SUM(exposure_amount) FILTER (WHERE role = 'USER'), 0) AS player_exposure
    FROM downline
  `,
      uplinePath,
      userId,
    );

    return result[0];
  }

  async amountTransfer(
    senderId: bigint,
    userType: UserType,
    dto: {
      userIds: bigint[];
      remark?: string;
    },
  ) {
    const { userIds, remark } = dto;

    let uplineMeta: any;
    if (userType === UserType.Admin) {
      uplineMeta = await this.prisma.adminMeta.findUnique({
        where: { adminId: senderId },
        include: {
          admin: {
            include: {
              role: true,
            },
          },
        },
      });
    } else {
      uplineMeta = await this.prisma.userMeta.findUnique({
        where: { userId: senderId },
        include: {
          user: {
            include: {
              role: true,
            },
          },
        },
      });
    }

    return this.prisma.$transaction(
      async (tx) => {
        /**
         * 🔐 Sender MAIN wallet
         */
        const senderWallet =
          userType === UserType.User
            ? await this.getByUserId(BigInt(senderId), WalletType.Main, { tx })
            : await this.getByAdminId(BigInt(senderId), { tx });

        let senderBalance = new Decimal(senderWallet.amount);

        /**
         * 👥 Target users with MAIN wallets
         */
        const users = await tx.user.findMany({
          where: {
            id: { in: userIds },
          },
          include: {
            wallets: {
              where: { type: WalletType.Main },
            },
          },
        });

        if (!users.length) {
          throw new Error('Invalid users for settlement');
        }

        for (const user of users) {
          const userWallet = user.wallets[0];
          if (!userWallet) continue;

          const creditLimit = new Decimal(userWallet.creditAmount || 0);
          if (creditLimit.lte(0)) continue;
          const currentBalance = new Decimal(userWallet.amount);
          const meta = await tx.$queryRawUnsafe<{ upline: string }[]>(
            `SELECT upline::text FROM user_meta WHERE user_id = $1`,
            user.id,
          );

          const upline = meta?.[0]?.upline || '';
          const summary = await this.getDownlineSummaryForUser(user.id, upline);

          const downlineBalance = Decimal(summary?.total_downline_balance || 0);

          const totalBalance = downlineBalance.plus(userWallet.amount || 0);

          // Skip users without credit limit

          const diff = creditLimit.minus(totalBalance);
          if (diff.eq(0)) continue;

          const absAmount = diff.abs();

          /**
           * ===========================
           * CREDIT → User (Admin pays)
           * ===========================
           */
          const settlement = true;
          if (diff.gt(0)) {
            // ❌ Sender insufficient balance
            if (senderBalance.lt(absAmount)) {
              throw new Error(
                `Settlement failed. Insufficient sender balance to settle user ${user.username}`,
              );
            }

            // 🔻 Sender debit
            if (userType === UserType.User) {
              await this.subtractBalance(
                senderId,
                absAmount,
                WalletType.Main,
                settlement,
                {
                  tx,
                  context: WalletTransactionContext.Withdrawal,
                  entityId: BigInt(user.id),
                  narration: remark ?? `Settlement debit`,
                  fromAccount: user.username
                    ? user.username
                    : user.id.toString(),
                  toAccount:
                    userType === UserType.User
                      ? uplineMeta?.user?.role?.name
                      : uplineMeta?.admin?.role?.name,
                  meta: {
                    reference: `Settlement for user ${user.username}`,
                    fromAccount: user.username
                      ? user.username
                      : user.id.toString(),
                    toAccount:
                      userType === UserType.User
                        ? uplineMeta?.user?.role?.name
                        : uplineMeta?.admin?.role?.name,
                  },
                },
              );
            } else {
              await this.subtractBalanceFromOwner(
                senderId,
                absAmount,
                WalletType.Main,
                {
                  tx,
                  context: WalletTransactionContext.Withdrawal,
                  entityId: BigInt(user.id),
                  narration: remark ?? `Settlement debit`,
                  fromAccount: user.username
                    ? user.username
                    : user.id.toString(),
                  toAccount: uplineMeta?.admin?.role?.name || 'Admin',
                  meta: {
                    reference: `Settlement for user ${user.username}`,
                    fromAccount: user.username
                      ? user.username
                      : user.id.toString(),
                    toAccount: uplineMeta?.admin?.role?.name || 'Admin',
                  },
                },
              );
            }
            // 🔺 User credit
            await this.addBalance(
              user.id,
              absAmount,
              WalletType.Main,
              settlement,
              {
                tx,
                context: WalletTransactionContext.Deposit,
                entityId: BigInt(senderId),
                fromAccount:
                  userType === UserType.User
                    ? uplineMeta?.user?.role?.name
                    : uplineMeta?.admin?.role?.name,
                toAccount: user.username ? user.username : user.id.toString(),
                meta: {
                  reference: `Settlement for user ${user.username}`,
                  fromAccount:
                    userType === UserType.User
                      ? uplineMeta?.user?.role?.name
                      : uplineMeta?.admin?.role?.name,
                  toAccount: user.username ? user.username : user.id.toString(),
                },
                narration:
                  remark ?? `Settlement credit applied to match credit limit`,
              },
            );

            senderBalance = senderBalance.minus(absAmount);
          } else {
            /**
             * ===========================
             * WITHDRAW → Sender (User pays back)
             * ===========================
             */
            // ❌ User insufficient balance
            if (currentBalance.lt(absAmount)) {
              throw new Error(
                `Settlement failed. User ${user.username} has insufficient balance`,
              );
            }

            // 🔻 User debit
            await this.subtractBalance(
              user.id,
              absAmount,
              WalletType.Main,
              settlement,
              {
                tx,
                context: WalletTransactionContext.Withdrawal,
                entityId: BigInt(senderId),
                fromAccount: user.username ? user.username : user.id.toString(),
                toAccount:
                  userType === UserType.User
                    ? uplineMeta?.user?.role?.name
                    : uplineMeta?.admin?.role?.name,
                meta: {
                  reference: `Settlement for user ${user.username}`,
                  fromAccount: user.username
                    ? user.username
                    : user.id.toString(),
                  toAccount:
                    userType === UserType.User
                      ? uplineMeta?.user?.role?.name
                      : uplineMeta?.admin?.role?.name,
                },
                narration:
                  remark ??
                  `Settlement debit. Excess balance withdrawn from user`,
              },
            );

            // 🔺 Sender credit
            if (userType === UserType.User) {
              await this.addBalance(
                senderId,
                absAmount,
                WalletType.Main,
                settlement,
                {
                  tx,
                  context: WalletTransactionContext.Deposit,
                  entityId: BigInt(user.id),
                  narration: remark ?? `Settlement credit`,
                  fromAccount:
                    userType === UserType.User
                      ? uplineMeta?.user?.role?.name
                      : uplineMeta?.admin?.role?.name,
                  toAccount: user.username ? user.username : user.id.toString(),
                  meta: {
                    reference: `Settlement for user ${user.username}`,
                    fromAccount:
                      userType === UserType.User
                        ? uplineMeta?.user?.role?.name
                        : uplineMeta?.admin?.role?.name,
                    toAccount: user.username
                      ? user.username
                      : user.id.toString(),
                  },
                },
              );
            } else {
              await this.addBalanceToOwner(
                senderId,
                absAmount,
                WalletType.Main,
                {
                  tx,
                  context: WalletTransactionContext.Deposit,
                  entityId: BigInt(user.id),
                  narration: remark ?? `Settlement credit`,
                  fromAccount: uplineMeta?.admin?.role?.name,
                  toAccount: user.username ? user.username : user.id.toString(),
                  meta: {
                    reference: `Settlement for user ${user.username}`,
                    fromAccount: uplineMeta?.admin?.role?.name,
                    toAccount: user.username
                      ? user.username
                      : user.id.toString(),
                  },
                },
              );
            }

            senderBalance = senderBalance.plus(absAmount);
          }
        }

        return {
          success: true,
          message: 'Settlement completed successfully',
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 20000,
      },
    );
  }
}
