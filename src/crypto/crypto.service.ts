import {
  BaseService,
  Pagination,
  PaginationRequest,
  UserType,
  UtilsService,
} from '@Common';
import { paymentConfigFactory } from '@Config';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import {
  ExportStatus,
  Network,
  PaymentOption,
  PaymentType,
  Prisma,
  StatusType,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma';
import { UsersService } from 'src/users';
import { WalletsService } from 'src/wallets/wallets.service';
import {
  CreateCryptoDepositWithdrawRequestDto,
  CreateCryptoWalletDto,
} from './dto';
import { MyWalletService } from 'src/my-wallet/my-wallet.service';
import { SystemService } from 'src/system';

@Injectable()
export class CryptoService extends BaseService {
  constructor(
    @Inject(paymentConfigFactory.KEY)
    private readonly paymentConfig: ConfigType<typeof paymentConfigFactory>,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly walletService: WalletsService,
    private readonly myWalletService: MyWalletService,
    private readonly systemService: SystemService,
  ) {
    super({ loggerDefaultMeta: { service: CryptoService.name } });
  }

  async addCryptoWallet(
    userId: bigint,
    userType: UserType,
    data: CreateCryptoWalletDto,
  ) {
    // 1️⃣ Block demo users
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    // 2️⃣ Validate wallet address
    const walletAddress = data.walletAddress?.trim();
    if (!walletAddress) {
      throw new Error('Crypto wallet address is required.');
    }

    if (walletAddress.length > 80) {
      throw new Error(
        'Invalid crypto wallet address. Please enter a valid wallet address.',
      );
    }

    const minAmount = data.minAmount;
    const maxAmount = data.maxAmount;

    if (minAmount !== undefined && minAmount < 0) {
      throw new Error('Minimum amount cannot be negative.');
    }

    if (maxAmount !== undefined && maxAmount < 0) {
      throw new Error('Maximum amount cannot be negative.');
    }

    if (
      minAmount !== undefined &&
      maxAmount !== undefined &&
      minAmount > maxAmount
    ) {
      throw new Error('Minimum amount cannot be greater than maximum amount.');
    }

    const existing = await this.prisma.crypto.findFirst({
      where: {
        walletAddress,
        networkId: data.networkId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new Error('This crypto wallet already exists.');
    }

    const wallet = await this.prisma.crypto.create({
      data: {
        walletAddress,
        qrImage: data.qrImage,
        status: StatusType.Inactive,
        networkId: data.networkId,
        minDepositAmount: minAmount ?? null,
        maxDepositAmount: maxAmount ?? null,
        userId: userType === UserType.User ? userId : undefined,
        adminId: userType === UserType.Admin ? userId : undefined,
      },
    });

    return {
      message: 'Crypto wallet added successfully.',
      data: wallet,
    };
  }

  // async deleteCryptoWallet(userId: bigint, walletId: bigint) {
  //   // const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
  //   // if (isDemoUser) {
  //   //   throw new Error('Demo accounts are not allowed to perform this action.');
  //   // }

  //   const isBanker = await this.usersService.hasRole(userId, 'BANKER');

  //   const wallet = await this.prisma.crypto.findFirst({
  //     where: {
  //       id: walletId,
  //       userId: userId,
  //     },
  //   });
  //   if (!wallet) {
  //     throw new Error('Crypto wallet not found.');
  //   }

  //   if (isBanker && wallet.status === StatusType.Active) {
  //     throw new Error(
  //       'Active crypto wallet cannot be deleted. Please deactivate it first.',
  //     );
  //   }

  //   const deleted = await this.prisma.crypto.update({
  //     where: {
  //       id: walletId,
  //       deletedAt: null,
  //     },
  //     data: {
  //       deletedAt: new Date(),
  //     },
  //   });

  //   return deleted;
  // }

  async deleteCryptoWallet(userId: bigint, userType: UserType, id: bigint) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    if (userType === UserType.Admin) {
      const crypto = await this.prisma.crypto.findFirst({
        where: {
          id,
          adminId: userId,
          deletedAt: null,
        },
      });

      if (!crypto) {
        throw new Error('Crypto wallet not found');
      }

      // if (userType === UserType.Admin && wallet.adminId !== userId) {
      //   throw new Error('Not authorized to modify this crypto wallet.');
      // }
    } else {
      const crypto = await this.prisma.crypto.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!crypto) {
        throw new Error('Crypto wallet not found');
      }

      if (!crypto.userId || BigInt(crypto.userId) !== BigInt(userId)) {
        throw new Error('Not authorized to modify this crypto.');
      }
    }

    await this.prisma.crypto.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      status: true,
      message: 'Crypto wallet deleted successfully',
    };
  }

  async listUserCryptoWallets(userId: bigint) {
    return this.prisma.crypto.findMany({
      where: { userId, status: StatusType.Active },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listCryptoWallets(
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

    const where: Prisma.CryptoWhereInput = {
      deletedAt: null,
      network: {
        paymentOptions: {
          some: {
            name: 'USDT',
          },
        },
      },
    };

    if (userType === UserType.User) {
      where.userId = userId;
    }

    if (userType === UserType.Admin) {
      where.adminId = { not: null };
    }

    const [wallets, totalItems] = await Promise.all([
      this.prisma.crypto.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          adminId: true,
          walletAddress: true,
          qrImage: true,
          chain: true,
          minDepositAmount: true,
          maxDepositAmount: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          network: {
            select: {
              id: true,
              name: true,
              nativeCoinSymbol: true,
              paymentOptions: {
                where: {
                  name: 'USDT',
                },
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  usdRate: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.crypto.count({ where }),
    ]);

    const pagination: Pagination = {
      currentPage: page,
      totalPage: Math.ceil(totalItems / limit),
      totalItems,
      limit,
    };

    return {
      status: true,
      message: 'Crypto wallets fetched successfully.',
      wallets,
      pagination,
    };
  }

  async toggleCryptoStatus(
    userId: bigint,
    userType: UserType,
    walletId: bigint,
  ) {
    // 1️⃣ Block demo users
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    // 2️⃣ Find wallet
    const crypto = await this.prisma.crypto.findUnique({
      where: { id: walletId },
    });

    if (!crypto || crypto.deletedAt) {
      throw new Error('Crypto wallet not found.');
    }

    if (userType === UserType.User) {
      if (!crypto.userId || BigInt(crypto.userId) !== BigInt(userId)) {
        throw new Error('Not authorized to modify this crypto wallet.');
      }
    }

    const isActive = crypto.status === StatusType.Active;

    if (isActive) {
      const updated = await this.prisma.crypto.update({
        where: { id: walletId, deletedAt: null },
        data: { status: StatusType.Inactive },
      });

      return {
        message: 'Crypto wallet deactivated successfully.',
        data: updated,
      };
    }

    const whereClause: Prisma.CryptoWhereInput = {
      networkId: crypto.networkId,
      deletedAt: null,
      NOT: { id: walletId },
    };

    if (userType === UserType.Admin) {
      whereClause.adminId = { not: null };
    } else {
      whereClause.userId = userId;
    }

    await this.prisma.crypto.updateMany({
      where: whereClause,
      data: { status: StatusType.Inactive },
    });

    const updated = await this.prisma.crypto.update({
      where: { id: walletId },
      data: { status: StatusType.Active },
    });

    return {
      message: 'Crypto wallet activated successfully.',
      data: updated,
    };
  }

  // async createCryptoDepositWithdrawRequest(
  //   userId: bigint,
  //   dto: CreateCryptoDepositWithdrawRequestDto,
  // ) {
  //   const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
  //   if (isDemoUser) {
  //     throw new Error('Demo accounts are not allowed to perform this action.');
  //   }

  //   if (dto.amount <= 0) {
  //     throw new Error('Amount must be greater than zero.');
  //   }

  //   const wallet = await this.walletService.getByUserId(
  //     userId,
  //     WalletType.Main,
  //   );

  //   if (!wallet) {
  //     throw new Error('Wallet not found.');
  //   }

  //   const crypto = await this.prisma.crypto.findUnique({
  //     where: {
  //       id: dto.cryptoId,
  //       deletedAt: null,
  //     },
  //   });

  //   if (!crypto) {
  //     throw new Error('Invalid crypto wallet. Please select a valid one.');
  //   }

  //   const cryptoAmount = new Prisma.Decimal(dto.amount);

  //   const activeBanker = await this.prisma.activeBanker.findFirst();
  //   if (!activeBanker) {
  //     throw new Error('No active banker available.');
  //   }

  //   const debitConfig = await this.getcriptoConfig(
  //     activeBanker.bankerId,
  //     PaymentType.Crypto,
  //     WalletTransactionType.Debit,
  //   );

  //   const creditConfig = await this.getcriptoConfig(
  //     activeBanker.bankerId,
  //     PaymentType.Crypto,
  //     WalletTransactionType.Credit,
  //   );

  //   const rate = new Prisma.Decimal(
  //     debitConfig?.conversionRate ?? this.paymentConfig.conversionRate ?? 126,
  //   );
  //   const minWithdraw = new Prisma.Decimal(
  //     debitConfig?.minAmount ?? this.paymentConfig.minWithdraw ?? 100,
  //   );
  //   const maxWithdraw = new Prisma.Decimal(
  //     debitConfig?.maxAmount ?? this.paymentConfig.maxWithdraw ?? 100000,
  //   );

  //   const minDeposit = new Prisma.Decimal(
  //     creditConfig?.minAmount ?? this.paymentConfig.minDeposit ?? 100,
  //   );
  //   const maxDeposit = new Prisma.Decimal(
  //     creditConfig?.maxAmount ?? this.paymentConfig.maxDeposit ?? 100000,
  //   );

  //   if (rate.lessThanOrEqualTo(0)) {
  //     throw new Error('Invalid conversion rate.');
  //   }

  //   const convertedAmount = cryptoAmount.mul(rate);

  //   if (dto.type === WalletTransactionType.Debit) {
  //     // const availableBalance = wallet.amount
  //     //   .sub(wallet.lockedAmount ?? new Prisma.Decimal(0))
  //     //   .sub(wallet.exposureAmount ?? new Prisma.Decimal(0));

  //     // if (availableBalance.lessThan(new Prisma.Decimal(convertedAmount))) {
  //     //   throw new Error('Insufficient wallet balance.');
  //     // }
  //     const availableBalance =
  //       await this.myWalletService.getAvailableWithdrawals(userId);

  //     if (availableBalance < Number(convertedAmount)) {
  //       throw new Error('Insufficient wallet balance.');
  //     }

  //     // const user = await this.prisma.userTurnoverAccount.findFirst({
  //     //   where: {
  //     //     userId,
  //     //     status: ExportStatus.Pending,
  //     //     turnoverType: WalletType.Main,
  //     //   },
  //     //   orderBy: { id: 'desc' },
  //     // });

  //     // if (user) {
  //     //   throw new Error(
  //     //     'Please complete the turnover first before withdrawing the amount.',
  //     //   );
  //     // }
  //   }

  //   if (dto.type === WalletTransactionType.Credit) {
  //     const txHash = dto.transactionCode?.trim();

  //     if (!txHash) {
  //       throw new Error('Transaction hash is required for crypto deposits.');
  //     }

  //     if (txHash.length < 10 || txHash.length > 80) {
  //       throw new Error(
  //         'Transaction hash must be exactly 64 hexadecimal characters.',
  //       );
  //     }

  //     // if (!/^[a-fA-F0-9]{64}$/.test(txHash)) {
  //     //   throw new Error('Invalid transaction hash format.');
  //     // }

  //     const existingTx = await this.prisma.depositWithdrawRequest.findFirst({
  //       where: {
  //         transactionCode: txHash,
  //       },
  //     });

  //     if (existingTx) {
  //       throw new Error('This transaction hash has already been used.');
  //     }
  //   }

  //   const result = await this.prisma.$transaction(async (tx) => {
  //     const activeBanker = await tx.activeBanker.findFirst();
  //     if (!activeBanker) {
  //       throw new Error('No active banker available.');
  //     }

  //     const amount = convertedAmount;
  //     if (dto.type === WalletTransactionType.Debit) {
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
  //     //   const currentWallet = await tx.wallet.findUnique({
  //     //     where: { id: wallet.id },
  //     //   });

  //     //   if (!currentWallet) throw new Error('Wallet not found.');

  //     //   if (dto.type === WalletTransactionType.Debit) {
  //     //     const newAmount = currentWallet.amount.sub(
  //     //       new Decimal(convertedAmount),
  //     //     );
  //     //     const newLocked = currentWallet.lockedAmount.add(
  //     //       new Decimal(convertedAmount),
  //     //     );

  //     //     if (newAmount.lessThan(0)) {
  //     //       throw new Error('Insufficient wallet balance.');
  //     //     }

  //     //     await tx.wallet.update({
  //     //       where: {
  //     //         id: wallet.id,
  //     //         version: wallet.version,
  //     //       },
  //     //       data: {
  //     //         lockedAmount: newLocked,
  //     //         version: { increment: 1 },
  //     //       },
  //     //     });
  //     //   }
  //     // });
  //     if (dto.type === WalletTransactionType.Debit) {
  //       try {
  //         await this.walletService.addLockedAmount(
  //           userId,
  //           amount,
  //           WalletType.Main,
  //           { tx },
  //         );
  //       } catch (error) {
  //         this.logger.error(
  //           ` Failed to lock amount ${amount.toFixed(2)} for userId=${userId}:`,
  //           error,
  //         );
  //         throw error;
  //       }
  //     }

  //     let image: string | undefined;
  //     let transactionCode: string | undefined;

  //     if (dto.type === WalletTransactionType.Credit) {
  //       if (!dto.transactionCode || dto.transactionCode.trim() === '') {
  //         throw new Error('Transaction hash is required for crypto deposits.');
  //       }
  //       transactionCode = dto.transactionCode.trim();
  //       image = dto.image?.trim();
  //       if (amount.lessThan(minDeposit)) {
  //         throw new Error(
  //           `Deposit amount (${amount.toFixed(2)}) is below the minimum deposit limit (${minDeposit.toFixed(2)}).`,
  //         );
  //       }

  //       if (amount.greaterThan(maxDeposit)) {
  //         throw new Error(
  //           `Deposit amount (${amount.toFixed(2)}) exceeds the maximum deposit limit (${maxDeposit.toFixed(2)}).`,
  //         );
  //       }
  //     }

  //     const request = await tx.depositWithdrawRequest.create({
  //       data: {
  //         userId,
  //         type: dto.type,
  //         amount: new Prisma.Decimal(dto.amount),
  //         status: WalletTransactionStatus.Pending,
  //         cryptoId: dto.cryptoId,
  //         bankerId: activeBanker.bankerId,
  //         image,
  //         transactionCode,
  //         transactionHash: transactionCode,
  //         conversionRate: rate,
  //       },
  //     });

  //     return request;
  //   });

  //   return result;
  // }

  async getById(id: bigint) {
    return await this.prisma.crypto.findUnique({
      where: { id },
    });
  }

  async getcriptoConfig(
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

  async createCryptoDepositWithdrawRequest(
    userId: bigint,
    data: CreateCryptoDepositWithdrawRequestDto,
  ) {
    // const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
    // if (isDemoUser) {
    //   throw new Error('Demo accounts are not allowed to perform this action.');
    // }

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

    const crypto = await this.prisma.crypto.findFirst({
      where: {
        id: data.cryptoId,
        deletedAt: null,
      },
      include: {
        network: {
          include: {
            paymentOptions: true,
          },
        },
      },
    });

    if (!crypto) {
      throw new Error('Invalid crypto wallet. Please select a valid wallet.');
    }

    const conversionRate = await this.getUsdtRate(crypto.network as any);

    // Convert crypto amount to USD equivalent
    const convertedAmount = amount.mul(conversionRate);

    if (data.type === WalletTransactionType.Debit) {
      if (data.transactionCode || data.image) {
        throw new Error(
          'Transaction hash or image is not allowed for withdrawals.',
        );
      }

      const locked = wallet.lockedAmount ?? new Prisma.Decimal(0);
      const exposure = wallet.exposureAmount
        ? wallet.exposureAmount.abs()
        : new Prisma.Decimal(0);

      const availableBalance = wallet.amount.sub(locked).sub(exposure);

      if (availableBalance.lt(convertedAmount)) {
        throw new Error('Insufficient wallet balance.');
      }
    }

    let transactionCode: string | null = null;
    let image: string | null = null;

    if (data.type === WalletTransactionType.Credit) {
      transactionCode = data.transactionCode?.trim() ?? null;

      if (!transactionCode) {
        throw new Error('Transaction hash is required for crypto deposits.');
      }

      if (transactionCode.length < 10 || transactionCode.length > 80) {
        throw new Error('Invalid transaction hash.');
      }

      const existingTx = await this.prisma.depositWithdrawRequest.findFirst({
        where: {
          transactionCode,
        },
      });

      if (existingTx) {
        throw new Error('This transaction hash has already been used.');
      }

      image = data.image?.trim() ?? null;
      if (!image) {
        throw new Error('image is required for crypto deposits.');
      }

      const minAmount = crypto.minDepositAmount
        ? new Prisma.Decimal(crypto.minDepositAmount)
        : new Prisma.Decimal(100);

      if (convertedAmount.lt(minAmount)) {
        throw new Error(
          `Deposit amount (${convertedAmount.toFixed(
            2,
          )}) is below the minimum limit (${minAmount.toFixed(2)}).`,
        );
      }

      if (crypto.maxDepositAmount) {
        const maxAmount = new Prisma.Decimal(crypto.maxDepositAmount);
        if (convertedAmount.gt(maxAmount)) {
          throw new Error(
            `Deposit amount (${convertedAmount.toFixed(
              2,
            )}) exceeds the maximum limit (${maxAmount.toFixed(2)}).`,
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
              convertedAmount,
              WalletType.Main,
              { tx },
            );
          } catch (err) {
            this.logger.error(
              `Failed to lock crypto amount ${amount} for userId=${userId}`,
            );
            throw err;
          }
        }

        return await tx.depositWithdrawRequest.create({
          data: {
            userId,
            type: data.type,
            amount: amount,
            status: WalletTransactionStatus.Pending,
            cryptoId: data.cryptoId,
            bankerId,
            image,
            transactionCode,
            transactionHash: transactionCode,
            conversionRate,
            statusUpdatedAt: new Date(),
          },
        });
      });

      return {
        status: true,
        message: 'Crypto transaction request created successfully.',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to create crypto transaction`);
      throw error;
    }
  }

  async getUsdtRate(network: Network & { paymentOptions: PaymentOption[] }) {
    const usdt = network.paymentOptions.find((p) =>
      p.symbol.toUpperCase().includes('USDT'),
    );

    if (!usdt || !usdt.usdRate) {
      throw new Error('USDT rate not configured for this network.');
    }

    return usdt.usdRate;
  }

  async getUsdtOnly() {
    return this.prisma.network.findMany({
      where: {
        paymentOptions: {
          some: {
            name: 'USDT',
          },
        },
      },
      include: {
        paymentOptions: {
          where: {
            name: 'USDT',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
