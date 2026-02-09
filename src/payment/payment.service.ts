import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import {
  AccountType,
  ExportStatus,
  PaymentMode,
  PaymentType,
  Prisma,
  StatusType,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { paymentConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { WalletsService } from 'src/wallets/wallets.service';
import { UsersService } from 'src/users';
import {
  CreateBankAccountDto,
  CreateDepositWithdrawRequestDto,
  CreateDigitalPaymentDto,
} from './dto';
import { BaseService, Pagination, PaginationRequest, UserType } from '@Common';
import { MyWalletService } from 'src/my-wallet/my-wallet.service';

@Injectable()
export class PaymentService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletsService,
    private readonly usersService: UsersService,
    private readonly myWalletService: MyWalletService,
    @Inject(paymentConfigFactory.KEY)
    private readonly paymentConfig: ConfigType<typeof paymentConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: PaymentService.name } });
  }

  async createDigitalPayment(
    userId: bigint,
    userType: UserType,
    data: CreateDigitalPaymentDto,
  ) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    const number = data.number?.trim();
    if (!number) {
      throw new Error('Wallet number is required.');
    }

    let hasUserRole = false;
    if (userType === UserType.User) {
      hasUserRole = await this.usersService.hasRole(userId, 'USER');
    }

    let minAmount: Prisma.Decimal | undefined;
    let maxAmount: Prisma.Decimal | undefined;

    if (!hasUserRole || userType === UserType.Admin) {
      if (data.minAmount === undefined || data.minAmount === null) {
        throw new Error('Minimum deposit amount is required ');
      }
      if (typeof data.minAmount !== 'number') {
        throw new Error('Minimum deposit amount must be a number.');
      }

      if (data.maxAmount === undefined || data.maxAmount === null) {
        throw new Error(
          'Maximum deposit amount is required for non-USER roles.',
        );
      }
      if (typeof data.maxAmount !== 'number') {
        throw new Error('Maximum deposit amount must be a number.');
      }

      if (data.maxAmount < data.minAmount) {
        throw new Error(
          'Maximum deposit amount must be greater than or equal to minimum deposit amount.',
        );
      }
      minAmount = new Prisma.Decimal(data.minAmount);
      maxAmount = new Prisma.Decimal(data.maxAmount);
    }

    const whereCondition: any = {
      paymentMode: data.paymentMode,
      accountType: data.accountType || AccountType.Current,
      number,
      deletedAt: null,
    };

    const existing = await this.prisma.digitalPayment.findFirst({
      where: whereCondition,
    });

    if (existing) {
      throw new Error('This wallet number already exists.');
    }

    const payment = await this.prisma.digitalPayment.create({
      data: {
        paymentMode: data.paymentMode,
        accountType: data.accountType || AccountType.Personal,
        number,
        status: StatusType.Inactive,
        userId: userType === UserType.User ? userId : undefined,
        adminId: userType === UserType.Admin ? userId : undefined,
        minAmount: minAmount !== undefined ? minAmount : undefined,
        maxAmount: maxAmount !== undefined ? maxAmount : undefined,
      },
    });

    return {
      message: 'Wallet payment method added successfully.',
      data: payment,
    };
  }

  async toggleStatus(userId: bigint, userType: UserType, paymentId: bigint) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    const payment = await this.prisma.digitalPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error('eWallet method not found.');
    }

    if (userType === UserType.User) {
      if (!payment.userId || BigInt(payment.userId) !== BigInt(userId)) {
        throw new Error('Not authorized to modify this eWallet.');
      }
    }

    const isActive = payment.status === StatusType.Active;

    if (isActive) {
      const updated = await this.prisma.digitalPayment.update({
        where: { id: paymentId, deletedAt: null },
        data: { status: StatusType.Inactive },
      });

      return {
        message: 'Payment method deactivated successfully.',
        data: updated,
      };
    }

    const whereClause: Prisma.DigitalPaymentWhereInput = {
      paymentMode: payment.paymentMode,
      deletedAt: null,
      NOT: { id: paymentId },
    };

    if (userType === UserType.Admin) {
      whereClause.adminId = { not: null };
    } else {
      whereClause.userId = userId;
    }

    await this.prisma.digitalPayment.updateMany({
      where: whereClause,
      data: {
        status: StatusType.Inactive,
      },
    });

    const updated = await this.prisma.digitalPayment.update({
      where: { id: paymentId },
      data: { status: StatusType.Active },
    });

    return {
      message: 'Payment method activated successfully.',
      data: updated,
    };
  }

  // async deleteDigitalPayment(userId: bigint, paymentId: bigint) {
  //   // const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
  //   // if (isDemoUser) {
  //   //   throw new Error('Demo accounts are not allowed to perform this action.');
  //   // }

  //   const payment = await this.prisma.digitalPayment.findUnique({
  //     where: { id: paymentId, deletedAt: null },
  //   });

  //   if (!payment) {
  //     throw new Error('eWallet not found.');
  //   }

  //   await this.prisma.digitalPayment.update({
  //     where: { id: paymentId },
  //     data: {
  //       deletedAt: new Date(),
  //     },
  //   });

  //   return {
  //     message: `${payment.paymentMode === PaymentMode.Bank ? 'Bank account' : 'Wallet'} deleted successfully.`,
  //     data: {
  //       id: payment.id,
  //       paymentMode: payment.paymentMode,
  //     },
  //   };
  // }

  async deleteEwallet(userId: bigint, userType: UserType, id: bigint) {
    // 1️⃣ Block demo users
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    if (userType === UserType.Admin) {
      const wallet = await this.prisma.digitalPayment.findFirst({
        where: {
          id,
          adminId: userId,
          deletedAt: null,
        },
      });

      if (!wallet) {
        throw new Error('eWallet not found');
      }
    } else {
      const wallet = await this.prisma.digitalPayment.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!wallet) {
        throw new Error('eWallet not found');
      }

      if (!wallet.userId || BigInt(wallet.userId) !== BigInt(userId)) {
        throw new Error('Not authorized to modify this eWallet.');
      }
    }

    await this.prisma.digitalPayment.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      status: true,
      message: 'eWallet deleted successfully',
    };
  }

  async listDigitalPayments(
    userId: bigint,
    userType: UserType,
    options: PaginationRequest,
  ) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DigitalPaymentWhereInput = {
      deletedAt: null,
    };

    if (userType === UserType.User) {
      where.userId = userId;
    }

    if (userType === UserType.Admin) {
      where.adminId = { not: null };
    }

    const [payments, totalItems] = await Promise.all([
      this.prisma.digitalPayment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.digitalPayment.count({ where }),
    ]);

    const pagination: Pagination = {
      currentPage: page,
      totalPage: Math.ceil(totalItems / limit),
      totalItems,
      limit,
    };

    return {
      status: true,
      message: 'eWallet payments fetched successfully',
      payments,
      pagination,
    };
  }

  // async createDepositWithdrawRequest(
  //   userId: bigint,
  //   data: CreateDepositWithdrawRequestDto,
  // ) {
  //   const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
  //   if (isDemoUser) {
  //     throw new Error('Demo accounts are not allowed to perform this action.');
  //   }
  //   if (isNaN(data.amount)) {
  //     throw new Error('Withdrawal amount must be a real number.');
  //   }

  //   if (data.amount <= 0) {
  //     throw new Error('Amount must be greater than zero.');
  //   }

  //   const wallet = await this.walletService.getByUserId(
  //     userId,
  //     WalletType.Main,
  //   );

  //   if (!wallet) {
  //     throw new Error('Wallet not found.');
  //   }

  //   const paymentType = await this.prisma.digitalPayment.findUnique({
  //     where: { id: data.digitalPaymentId, deletedAt: null },
  //   });

  //   if (!paymentType) {
  //     throw new Error(
  //       'Invalid digital payment ID. Please select a valid payment method.',
  //     );
  //   }

  //   if (data.type === WalletTransactionType.Debit) {
  //     const availableBalance =
  //       await this.myWalletService.getAvailableWithdrawals(userId);

  //     if (availableBalance < Number(data.amount)) {
  //       throw new Error('Insufficient wallet balance.');
  //     }

  //   }

  //   if (data.type === WalletTransactionType.Credit) {
  //     const utrCode = data.transactionCode?.trim();

  //     if (!utrCode) {
  //       throw new Error('UTR code is required for deposits.');
  //     }

  //     if (utrCode.length < 8 || utrCode.length > 20) {
  //       throw new Error('UTR code must be between 8 and 20 characters.');
  //     }
  //     const existingUTR = await this.prisma.depositWithdrawRequest.findFirst({
  //       where: {
  //         transactionCode: utrCode,
  //       },
  //     });

  //     if (existingUTR) {
  //       throw new Error('This UTR code has already been used.');
  //     }
  //   }

  //   const result = await this.prisma.$transaction(async (tx) => {
  //     const activeBanker = await tx.activeBanker.findFirst();
  //     if (!activeBanker) {
  //       throw new Error('No active banker available.');
  //     }

  //     const mode =
  //       paymentType.paymentMode === PaymentMode.Bank
  //         ? PaymentType.Bank
  //         : PaymentType.EWallet;

  //     const debitConfig = await this.getPaymentConfig(
  //       activeBanker.bankerId,
  //       mode,
  //       WalletTransactionType.Debit,
  //       tx,
  //     );

  //     const creditConfig = await this.getPaymentConfig(
  //       activeBanker.bankerId,
  //       mode,
  //       WalletTransactionType.Credit,
  //       tx,
  //     );

  //     const minWithdraw = new Prisma.Decimal(
  //       debitConfig?.minAmount ?? this.paymentConfig.minWithdraw ?? 100,
  //     );
  //     const maxWithdraw = new Prisma.Decimal(
  //       debitConfig?.maxAmount ?? this.paymentConfig.maxWithdraw ?? 100000,
  //     );

  //     const minDeposit = new Prisma.Decimal(
  //       creditConfig?.minAmount ?? this.paymentConfig.minDeposit ?? 100,
  //     );
  //     const maxDeposit = new Prisma.Decimal(
  //       creditConfig?.maxAmount ?? this.paymentConfig.maxDeposit ?? 100000,
  //     );

  //     const amount = new Prisma.Decimal(data.amount);
  //     if (data.type === WalletTransactionType.Debit) {
  //       if (amount.lessThan(minWithdraw)) {
  //         throw new Error(
  //           `Withdrawal amount (${amount.toFixed(2)}) is below the minimum limit (${minWithdraw.toFixed(2)}).`,
  //         );
  //       }

  //       if (amount.greaterThan(maxWithdraw)) {
  //         throw new Error(
  //           `Withdrawal amount (${amount.toFixed(2)}) exceeds the maximum limit (${maxWithdraw.toFixed(2)}).`,
  //         );
  //       }
  //     }
  //     // await this.utilsService.occrunnable(async () => {
  //     //   const currentWallet = await this.walletService.getById(wallet.id, {
  //     //     tx,
  //     //   });

  //     //   if (!currentWallet) throw new Error('Wallet not found.');

  //     //   if (dto.type === WalletTransactionType.Debit) {
  //     //     const newAmount = currentWallet.amount.sub(new Decimal(dto.amount));
  //     //     const newLocked = currentWallet.lockedAmount.add(
  //     //       new Decimal(dto.amount),
  //     //     );

  //     //     if (newAmount.lessThan(0)) {
  //     //       throw new Error('Insufficient wallet balance.');
  //     //     }

  //     //     const updated = await tx.wallet.update({
  //     //       where: {
  //     //         id: wallet.id,
  //     //         version: wallet.version,
  //     //       },
  //     //       data: {
  //     //         lockedAmount: newLocked,
  //     //         version: { increment: 1 },
  //     //       },
  //     //     });

  //     //     return updated;
  //     //   }
  //     //   return currentWallet;
  //     // });

  //     if (data.type === WalletTransactionType.Debit) {
  //       try {
  //         await this.walletService.addLockedAmount(
  //           userId,
  //           new Prisma.Decimal(data.amount),
  //           WalletType.Main,
  //           { tx },
  //         );
  //       } catch (error) {
  //         this.logger.error(
  //           `Failed to lock amount ${data.amount} for userId=${userId}`,
  //           error,
  //         );
  //         throw error;
  //       }
  //     }

  //     let image: string | undefined;
  //     let transactionCode: string | undefined;

  //     if (data.type === WalletTransactionType.Credit) {
  //       if (!data.transactionCode || data.transactionCode.trim() === '') {
  //         throw new Error('UTR code are required for deposits.');
  //       }
  //       image = data.image?.trim();
  //       transactionCode = data.transactionCode.trim();

  //       {
  //         if (amount.lessThan(minDeposit)) {
  //           throw new Error(
  //             `Deposit amount (${amount.toFixed(2)}) is below the minimum deposit limit (${minDeposit.toFixed(2)}).`,
  //           );
  //         }

  //         if (amount.greaterThan(maxDeposit)) {
  //           throw new Error(
  //             `Deposit amount (${amount.toFixed(2)}) exceeds the maximum deposit limit (${maxDeposit.toFixed(2)}).`,
  //           );
  //         }
  //       }
  //     }

  //     const request = await tx.depositWithdrawRequest.create({
  //       data: {
  //         userId,
  //         type: data.type,
  //         amount: new Prisma.Decimal(data.amount),
  //         status: WalletTransactionStatus.Pending,
  //         digitalPaymentId: data.digitalPaymentId,
  //         bankerId: activeBanker.bankerId,
  //         image,
  //         transactionCode,
  //       },
  //     });
  //     return request;
  //   });

  //   return result;
  // }

  async createDepositWithdrawRequest(
    userId: bigint,
    userType: UserType,
    data: CreateDepositWithdrawRequestDto,
  ) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(data.amount);
    } catch {
      throw new Error('Amount must be a valid number.');
    }

    if (amount.lte(0)) {
      throw new Error('Amount must be greater than zero.');
    }

    const wallet = await this.walletService.getByUserId(
      userId,
      WalletType.Main,
    );

    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const user = await this.usersService.getById(userId);
    const userMeta = await this.usersService.getMetaById(userId);

    if (!userMeta) {
      throw new Error('Invalid user.');
    }

    let bankerId: bigint | null = null;

    if (!user.isSelfRegistered && userMeta.uplineId) {
      const bankerUser = await this.prisma.user.findUnique({
        where: { id: BigInt(userMeta.uplineId) },
        select: { id: true },
      });

      if (bankerUser) {
        bankerId = bankerUser.id;
      }
    }

    const ewallet = await this.prisma.digitalPayment.findFirst({
      where: {
        id: data.digitalPaymentId,
        deletedAt: null,
      },
    });

    if (!ewallet) {
      throw new Error('Invalid ewallet. Please select a valid ewallet.');
    }

    if (data.type === WalletTransactionType.Debit) {
      if (data.UTR || data.image) {
        throw new Error('UTR or image is not allowed for withdrawals.');
      }

      const locked = wallet.lockedAmount ?? new Prisma.Decimal(0);
      const exposure = wallet.exposureAmount
        ? wallet.exposureAmount.abs()
        : new Prisma.Decimal(0);

      const availableBalance = wallet.amount.sub(locked).sub(exposure);

      if (availableBalance.lt(amount)) {
        throw new Error('Insufficient wallet balance.');
      }
    }

    let transactionCode: string | null = null;
    let image: string | null = null;

    if (data.type === WalletTransactionType.Credit) {
      transactionCode = data.UTR?.trim() ?? null;

      if (!transactionCode) {
        throw new Error('UTR code is required for deposits.');
      }

      if (transactionCode.length < 8 || transactionCode.length > 20) {
        throw new Error('UTR code must be between 8 and 20 characters.');
      }

      const existingUTR = await this.prisma.depositWithdrawRequest.findFirst({
        where: {
          transactionCode: transactionCode,
        },
      });

      if (existingUTR) {
        throw new Error('This UTR code has already been used.');
      }

      image = data.image?.trim() ?? null;
      if (!image) {
        throw new Error('image is required for deposits.');
      }

      const minAmount = ewallet.minAmount
        ? new Prisma.Decimal(ewallet.minAmount)
        : new Prisma.Decimal(100);

      if (amount.lt(minAmount)) {
        throw new Error(
          `Deposit amount (${amount.toFixed(
            2,
          )}) is below the minimum limit (${minAmount.toFixed(2)}).`,
        );
      }

      if (ewallet.maxAmount) {
        const maxAmount = new Prisma.Decimal(ewallet.maxAmount);
        if (amount.gt(maxAmount)) {
          throw new Error(
            `Deposit amount (${amount}.toFixed exceeds the maximum limit (${maxAmount.toFixed(2)}).`,
          );
        }
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (data.type === WalletTransactionType.Debit) {
          try {
            await this.walletService.addLockedAmount(
              userId,
              amount,
              WalletType.Main,
              { tx },
            );
          } catch (err) {
            this.logger.error(
              `Failed to lock amount ${amount}for userId=${userId}`,
            );
            throw err;
          }
        }

        return await tx.depositWithdrawRequest.create({
          data: {
            userId,
            type: data.type,
            amount,
            status: WalletTransactionStatus.Pending,
            digitalPaymentId: data.digitalPaymentId,
            bankerId,
            image,
            transactionCode,
            statusUpdatedAt: new Date(),
          },
        });
      });

      return {
        status: true,
        message: 'eWallet transaction request created successfully.',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to create eWallet transaction `);
      throw error;
    }
  }

  async getPaymentConfig(
    userId: bigint,
    paymentMode: PaymentType,
    type: WalletTransactionType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const dbConfig = await client.paymentConfig.findFirst({
      where: {
        userId,
        paymentMode,
        type,
      },
      orderBy: { id: 'asc' },
    });
    return dbConfig;
  }
}
