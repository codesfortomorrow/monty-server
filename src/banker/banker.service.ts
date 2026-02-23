import {
  BaseService,
  PaginatedDto,
  Pagination,
  UserType,
  UtilsService,
} from '@Common';
import {
  adminConfigFactory,
  AppConfig,
  appConfigFactory,
  paymentConfigFactory,
} from '@Config';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  ExportFormat,
  ExportType,
  PaymentMode,
  PaymentType,
  Prisma,
  StatusType,
  WalletTransactionContext,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import * as QRCode from 'qrcode';
import { CryptoService } from 'src/crypto';
import { PrismaService } from 'src/prisma';
import { UsersService } from 'src/users';
import { WalletTransactionsService } from 'src/wallet-transactions';
import { WalletsService } from 'src/wallets/wallets.service';
import {
  CreatepaymentConfigDto,
  ExportDepositWithdrawQueryDto,
  GetBankersDto,
  GetDepositWithdrawQueryDto,
  GetMyDepositWithdrawQueryDto,
} from './dto';
import { error } from 'console';
import { admin } from 'prisma/seeds';
import { AdminService } from 'src/admin';
import { SystemService } from 'src/system';

@Injectable()
export class BankerService extends BaseService {
  constructor(
    @Inject(paymentConfigFactory.KEY)
    private readonly paymentConfig: ConfigType<typeof paymentConfigFactory>,
    private readonly utilsService: UtilsService,
    private readonly walletService: WalletsService,
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly userService: UsersService,
    private readonly adminService: AdminService,
    private readonly systemService: SystemService,
    private readonly walletTransactionsService: WalletTransactionsService,
    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof adminConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: BankerService.name } });
  }

  async getAllBankers(
    options: GetBankersDto,
    status?: 'ACTIVE' | 'INACTIVE' | 'ALL',
  ) {
    let take: number | undefined;
    let skip: number | undefined;

    if (
      typeof options.page === 'number' &&
      typeof options.limit === 'number' &&
      !isNaN(options.page) &&
      !isNaN(options.limit)
    ) {
      options.page = options.page < 1 ? 1 : Math.floor(options.page);
      take = Math.max(1, Math.floor(options.limit));
      skip = (options.page - 1) * take;
    }

    const appConfig = appConfigFactory() as unknown as AppConfig;
    const rolesConfig = appConfig.userTypes ?? {};
    const OwnerRole = Object.keys(rolesConfig).find(
      (r) => r.toLowerCase() === 'banker',
    );

    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (OwnerRole) {
      where.role = { name: OwnerRole };
    }

    // Search filter
    if (options.search) {
      const s = options.search;
      where.OR = [{ username: { contains: s, mode: 'insensitive' } }];
    }

    // Date filter
    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gte = new Date(options.fromDate);
      if (options.toDate) {
        const d = new Date(options.toDate);
        d.setHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }

    // Status filter
    if (status === 'ACTIVE') {
      where.activeBankers = { some: {} };
    } else if (status === 'INACTIVE') {
      where.activeBankers = { none: {} };
    }

    // DB-level sorting ONLY
    const orderBy = [
      { activeBankers: { _count: 'desc' } }, // active first
      { id: 'desc' }, // then newest
    ];

    const [bankersRaw, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: [
          {
            activeBankers: {
              _count: 'desc' as const,
            },
          },
          {
            id: 'desc',
          },
        ],
        select: {
          id: true,
          firstname: true,
          lastname: true,
          username: true,
          mobile: true,
          createdAt: true,
          wallets: {
            select: { id: true, type: true, amount: true },
          },
          paymentConfig: {
            select: {
              id: true,
              paymentMode: true,
              type: true,
              minAmount: true,
              maxAmount: true,
              createdAt: true,
            },
          },
          activeBankers: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const result = bankersRaw.map((b) => ({
      ...b,
      status: b.activeBankers.length > 0 ? '1' : '0',
    }));
    const bankerIds = result.map((b) => BigInt(b.id));

    const pointIssueSums = await this.prisma.walletTransactions.groupBy({
      by: ['walletId'],
      where: {
        wallet: {
          userId: { in: bankerIds },
          type: WalletType.Main,
        },
        context: WalletTransactionContext.SystemDeposit,
        status: WalletTransactionStatus.Confirmed,
      },
      _sum: {
        amount: true,
      },
    });

    const totalsMap = new Map<bigint, number>();
    pointIssueSums.forEach((row) => {
      totalsMap.set(row.walletId, Number(row._sum.amount ?? 0));
    });

    const bankers = result.map((b) => {
      const wallet = b.wallets.find((w) => w.type === 'Main');
      const totalPointIssueAmount = wallet
        ? (totalsMap.get(wallet.id) ?? 0)
        : 0;

      const TYPES = [WalletTransactionType.Debit, WalletTransactionType.Credit];
      const MODES = [PaymentType.EWallet, PaymentType.Bank, PaymentType.Crypto];

      const paymentConfig: Record<
        string,
        Record<string, { minAmount: Prisma.Decimal; maxAmount: Prisma.Decimal }>
      > = {};

      const userConfigMap: Record<string, Record<string, any>> = {};
      b.paymentConfig.forEach((cfg) => {
        if (!userConfigMap[cfg.type]) userConfigMap[cfg.type] = {};
        userConfigMap[cfg.type][cfg.paymentMode] = {
          minAmount: new Prisma.Decimal(
            cfg.minAmount ?? this.paymentConfig.minDeposit ?? 100,
          ),
          maxAmount: new Prisma.Decimal(
            cfg.maxAmount ?? this.paymentConfig.maxDeposit ?? 100000,
          ),
        };
      });

      for (const type of TYPES) {
        paymentConfig[type] = {};
        for (const mode of MODES) {
          paymentConfig[type][mode] = userConfigMap[type]?.[mode] ?? {
            minAmount: new Prisma.Decimal(this.paymentConfig.minDeposit ?? 100),
            maxAmount: new Prisma.Decimal(
              this.paymentConfig.maxDeposit ?? 100000,
            ),
          };
        }
      }
      return {
        ...b,
        totalPointIssueAmount,
        paymentConfig,
      };
    });

    const limitUsed = take ?? (total > 0 ? total : 1);
    const currentPage = options.page ?? 1;
    const totalPage = Math.ceil(total / limitUsed);

    const pagination: Pagination = {
      totalItems: total,
      limit: limitUsed,
      currentPage,
      totalPage,
    };

    return {
      message: 'All bankers with wallet info fetched successfully.',
      bankers,
      pagination,
    };
  }

  async getAllDepositWithdrawRequests(
    bankerId: bigint,
    userType: UserType,
    options: GetDepositWithdrawQueryDto,
    isExport?: boolean,
  ) {
    let take: number | undefined;
    let skip: number | undefined;
    console.log('options', options);

    if (!isExport) {
      if (
        options.page &&
        options.limit &&
        !isNaN(options.limit) &&
        !isNaN(options.page)
      ) {
        options.page = options.page < 1 ? 1 : options.page;
        take = options.limit;
        skip = (options.page - 1) * options.limit;
      }
    }

    const where: Prisma.DepositWithdrawRequestWhereInput = {};

    if (options.fromDate || options.toDate) {
      where.createdAt = {};

      if (options.fromDate) {
        where.createdAt.gt = new Date(options.fromDate);
      }

      if (options.toDate) {
        where.createdAt.lt = new Date(options.toDate);
      }
    }

    if (options.status) where.status = options.status;
    if (options.type) where.type = options.type;

    if (options.isBank) {
      where.bankId = { not: null };
      where.digitalPaymentId = null;
      where.cryptoId = null;
    }

    if (options.isWallet) {
      where.digitalPaymentId = { not: null };
      where.bankId = null;
      where.cryptoId = null;
    }

    if (options.isCrypto) {
      where.cryptoId = { not: null };
      where.bankId = null;
      where.digitalPaymentId = null;
    }

    if (options.paymentMode) {
      where.digitalPaymentId = { not: null };
      where.cryptoId = null;
      where.bankId = null;
      where.digitalPayment = {
        paymentMode: options.paymentMode,
      };
    }

    if (options.search) {
      const search = options.search;

      where.OR = [
        {
          user: {
            OR: [{ username: { contains: search, mode: 'insensitive' } }],
          },
        },
      ];
    }

    if (userType === UserType.Admin) {
      where.bankerId = null;
    } else {
      where.bankerId = bankerId;
    }

    const total = await this.prisma.depositWithdrawRequest.count({ where });

    const include: any = {
      user: {
        select: {
          id: true,
          username: true,
          firstname: true,
          lastname: true,
        },
      },
      bank: true,
      crypto: true,
      digitalPayment: true,
    };

    const requests = await this.prisma.depositWithdrawRequest.findMany({
      where,
      include,
      orderBy: { id: 'desc' },
      skip,
      take,
    });

    this.logger.info(
      `Requests fetched | returned=${requests.length} | page=${options.page ?? 1}`,
    );

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

    return {
      message: 'deposit/withdraw requests fetched successfully.',
      data: requests,
      pagination,
    };
  }

  async getDepositWithdrawRequests(
    userId: bigint,
    options: GetMyDepositWithdrawQueryDto,
  ) {
    let take: number | undefined;
    let skip: number | undefined;
    if (
      options.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.DepositWithdrawRequestWhereInput = {};

    if (options.fromDate || options.toDate) {
      where.createdAt = {};

      if (options.fromDate) {
        where.createdAt.gt = new Date(options.fromDate);
      }

      if (options.toDate) {
        where.createdAt.lt = new Date(options.toDate);
      }
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.type) {
      where.type = options.type;
    }

    if (userId) {
      where.userId = userId;
    }

    if (options.isBank) {
      where.bankId = { not: null };
      where.digitalPaymentId = null;
      where.cryptoId = null;
    }

    if (options.isWallet) {
      where.digitalPaymentId = { not: null };
      where.bankId = null;
      where.cryptoId = null;
    }

    if (options.isCrypto) {
      where.cryptoId = { not: null };
      where.bankId = null;
      where.digitalPaymentId = null;
    }

    if (options.paymentMode) {
      where.digitalPaymentId = { not: null };
      where.cryptoId = null;
      where.bankId = null;
      where.digitalPayment = {
        paymentMode: options.paymentMode,
      };
    }

    const total = await this.prisma.depositWithdrawRequest.count({ where });

    const requests = await this.prisma.depositWithdrawRequest.findMany({
      where,
      include: {
        bank: true,
        crypto: {
          include: {
            network: true,
          },
        },
        digitalPayment: true,
      },
      orderBy: { id: 'desc' },
      skip,
      take,
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

    return {
      message: 'Deposit/Withdraw requests fetched successfully.',
      data: requests,
      pagination,
    };
  }

  async updateDepositWithdrawStatus(
    requestId: bigint,
    status: WalletTransactionStatus,
    bankerId: bigint,
    userType: UserType,
    remark?: string,
  ) {
    // try {
    //   const request = await this.prisma.depositWithdrawRequest.findUnique({
    //     where: { id: requestId },
    //   });

    //   if (!request) {
    //     this.logger.warn(` Request not found for ID=${requestId}`);
    //     throw new Error('Request not found.');
    //   }

    //   if (request.status !== WalletTransactionStatus.Pending) {
    //     this.logger.warn(` Request ${requestId} already processed.`);
    //     throw new Error('Request already processed.');
    //   }

    //   if (status === WalletTransactionStatus.Rejected) {
    //     if (!remark || remark.trim() === '') {
    //       throw new Error('Remark is required when rejecting a request.');
    //     }
    //   }

    //   const user = await this.userService.getById(request.userId);
    //   const banker = await this.userService.getById(bankerId);

    //   const userWallet = await this.walletService.getByUserId(
    //     request.userId,
    //     WalletType.Main,
    //   );

    //   if (!userWallet) throw new Error('User wallet not found.');

    //   const bankerWallet = await this.walletService.getByUserId(
    //     bankerId,
    //     WalletType.Main,
    //   );

    //   if (!bankerWallet) throw new Error('Banker wallet not found.');

    //   let finalAmount = new Prisma.Decimal(request.amount);
    try {
      const request = await this.prisma.depositWithdrawRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        this.logger.warn(` Request not found for ID=${requestId}`);
        throw new Error('Request not found.');
      }

      if (request.status !== WalletTransactionStatus.Pending) {
        this.logger.warn(` Request ${requestId} already processed.`);
        throw new Error('Request already processed.');
      }

      if (status === WalletTransactionStatus.Rejected) {
        if (!remark || remark.trim() === '') {
          throw new Error('Remark is required when rejecting a request.');
        }
      }

      const user = await this.userService.getById(request.userId);
      let banker;
      let username;
      let bankerWallet;
      if (userType === UserType.Admin) {
        banker = await this.prisma.admin.findFirst({
          where: {
            id: bankerId,
          },
        });

        if (!banker) {
          throw new Error('Admin not found.');
        }

        bankerWallet = await this.prisma.wallet.findFirst({
          where: {
            adminId: banker.id,
          },
        });

        if (!bankerWallet) {
          throw new Error('Admin wallet not found.');
        }
        username = 'Admin';
      } else {
        banker = await this.userService.getById(bankerId);
        if (!banker) {
          throw new Error('user not found.');
        }

        const userWallet = await this.walletService.getByUserId(
          request.userId,
          WalletType.Main,
        );
        if (!userWallet) throw new Error('User wallet not found.');

        bankerWallet = await this.walletService.getByUserId(
          banker.id,
          WalletType.Main,
        );

        if (!bankerWallet) throw new Error('Your wallet not found.');

        username = banker.username;
      }

      console.log('updatedRequest');

      let finalAmount = new Prisma.Decimal(request.amount);

      if (request.cryptoId) {
        if (!request.conversionRate) {
          throw new Error('Conversion rate missing for crypto transaction');
        }

        if (!request.conversionRate) {
          throw new Error('Conversion rate missing for crypto transaction');
        }

        const rate = new Prisma.Decimal(request.conversionRate);
        finalAmount = finalAmount.mul(rate);

        this.logger.info(
          `Crypto conversion: original=${request.amount} rate=${rate.toString()} final=${finalAmount.toString()}`,
        );
      }

      console.log('updatedRequest');

      // let finalAmount = new Prisma.Decimal(request.amount);

      const result = await this.prisma.$transaction(async (tx) => {
        const amount = finalAmount;

        if (request.type === WalletTransactionType.Debit) {
          if (status === WalletTransactionStatus.Approved) {
            this.logger.info(
              `Approving withdrawal of ${amount} from user=${request.userId} to banker=${bankerId}`,
            );

            try {
              await this.walletService.subtractLockedAmount(
                request.userId,
                amount,
                WalletType.Main,
                {
                  tx,
                },
              );

              const context = request.cryptoId
                ? WalletTransactionContext.CryptoWithdrawal
                : WalletTransactionContext.Withdrawal;

              if (userType === UserType.Admin) {
                await this.walletService.addBalanceToOwner(
                  bankerId,
                  new Prisma.Decimal(amount),
                  WalletType.Main,
                  {
                    tx,
                    context: WalletTransactionContext.WithdrawalApproval,
                    entityId: requestId,
                    fromAccount: user.username ?? 'User',
                    toAccount: username ?? 'Admin',
                    meta: {
                      fromAccount: user.username ?? 'User',
                      toAccount: username ?? 'Admin',
                    },
                    narration: `Money Withdrawal Approved`,
                  },
                );
              } else {
                await this.walletService.addBalance(
                  bankerId,
                  amount,
                  WalletType.Main,
                  false,
                  {
                    tx,
                    context: WalletTransactionContext.WithdrawalApproval,
                    entityId: requestId,
                    fromAccount: user.username ?? 'User',
                    toAccount: username ?? 'Admin',
                    meta: {
                      fromAccount: user.username ?? 'User',
                      toAccount: username ?? 'Admin',
                    },
                    narration: `Money Withdrawal Approved`,
                  },
                );
              }

              await this.walletService.subtractBalance(
                request.userId,
                amount,
                WalletType.Main,
                false,
                {
                  tx,
                  context: WalletTransactionContext.Withdrawal,
                  entityId: requestId,
                  fromAccount: user.username ?? 'User',
                  toAccount: username ?? 'Admin',
                  meta: {
                    fromAccount: user.username ?? 'User',
                    toAccount: username ?? 'Admin',
                  },
                  narration: `Money Withdrawal`,
                },
              );
            } catch (error) {
              this.logger.error(
                ` Failed to Approved withdrawal amount ${amount.toFixed(2)} for userId=${request.userId}`,
                error,
              );
              throw error;
            }
          } else if (status === WalletTransactionStatus.Rejected) {
            this.logger.info(
              `Rejecting withdrawal of ${amount} for user=${request.userId}`,
            );
            try {
              await this.walletService.subtractLockedAmount(
                request.userId,
                amount,
                WalletType.Main,
                {
                  tx,
                },
              );
            } catch (error) {
              this.logger.error(
                ` Failed to subtract amount ${amount.toFixed(2)} for userId=${request.userId}`,
                error,
              );
              throw error;
            }
          }
        } else if (request.type === WalletTransactionType.Credit) {
          if (status === WalletTransactionStatus.Approved) {
            this.logger.info(
              ` Approving deposit of ${amount} to user=${request.userId} by banker=${bankerId}`,
            );

            // const currentBankerWallet = await tx.wallet.findUnique({
            //   where: { id: bankerWallet.id },
            // });

            // if (!currentBankerWallet) throw new Error('Your wallet not found.');

            if (bankerWallet.amount.lt(amount)) {
              throw new Error(
                'Insufficient balance. You cannot approve this request.',
              );
            }

            const context = request.cryptoId
              ? WalletTransactionContext.CryptoDeposit
              : WalletTransactionContext.Deposit;
            console.log(amount);

            try {
              await this.walletService.addBalance(
                request.userId,
                amount,
                WalletType.Main,
                false,
                {
                  tx,
                  context: WalletTransactionContext.Deposit,
                  entityId: requestId,
                  fromAccount: username ?? 'Admin',
                  toAccount: user.username ?? 'User',
                  meta: {
                    fromAccount: username ?? 'Admin',
                    toAccount: user.username ?? 'User',
                  },
                  narration: `Money Deposit`,
                },
              );

              if (userType === UserType.Admin) {
                await this.walletService.subtractBalanceFromOwner(
                  bankerId,
                  new Prisma.Decimal(amount),
                  WalletType.Main,
                  {
                    tx,
                    context: WalletTransactionContext.DepositApproval,
                    entityId: requestId,
                    fromAccount: username ?? 'Admin',
                    toAccount: user.username ?? 'User',
                    meta: {
                      fromAccount: username ?? 'Admin',
                      toAccount: user.username ?? 'User',
                    },
                    narration: `Money Deposit Approved`,
                  },
                );
              } else {
                await this.walletService.subtractBalance(
                  bankerId,
                  amount,
                  WalletType.Main,
                  true,
                  {
                    tx,
                    context: WalletTransactionContext.DepositApproval,
                    entityId: requestId,
                    fromAccount: username ?? 'Admin',
                    toAccount: user.username ?? 'User',
                    meta: {
                      fromAccount: username ?? 'Admin',
                      toAccount: user.username ?? 'User',
                    },
                    narration: `Money Deposit Approved`,
                  },
                );
              }
            } catch (error) {
              this.logger.error(
                ` Failed to Deposit Approved amount ${amount.toFixed(2)} for userId=${request.userId}`,
                error,
              );
              throw error;
            }
            this.logger.info(` Deposit Approved for user=${request}`);
          } else if (status === WalletTransactionStatus.Rejected) {
            this.logger.info(` Deposit rejected for user=${request.userId}`);
          }
        }

        const updatedRequest = await tx.depositWithdrawRequest.update({
          where: { id: request.id },
          data: {
            status,
            statusUpdatedAt: new Date(),
            remark: remark ?? null,
          },
        });
        return updatedRequest;
      });

      this.logger.info(` Successfully updated request #${requestId}`);
      return result;
    } catch (error) {
      this.logger.error(
        ` Failed to update deposit/withdraw request #${requestId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async setActiveBanker(bankerId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      // const existing = await tx.activeBanker.findFirst({
      //   where: { bankerId },
      // });

      // if (existing) {
      //   await tx.activeBanker.delete({
      //     where: { id: existing.id },
      //   });

      //   return {
      //     message: 'Banker deactivated successfully.',
      //     data: null,
      //   };
      // }
      await tx.activeBanker.deleteMany();

      const newActive = await tx.activeBanker.create({
        data: { bankerId },
      });

      this.logger.info(`Banker activated successfully | bankerId=${bankerId}`);

      return {
        message: 'Banker activated successfully.',
        data: newActive,
      };
    });
  }

  // async showActiveBanker() {
  //   const activeBanker = await this.prisma.activeBanker.findFirst();
  //   if (!activeBanker) {
  //     this.logger.warn('No active banker found');
  //     return { message: 'No active banker found', data: [] };
  //   }

  //   const paymentConfigs = await this.prisma.paymentConfig.findMany({
  //     where: { userId: activeBanker.bankerId },
  //   });

  //   const TYPES = [WalletTransactionType.Debit, WalletTransactionType.Credit];
  //   const MODES = [PaymentType.EWallet, PaymentType.Bank, PaymentType.Crypto];

  //   const paymentConfig: Record<
  //     string,
  //     Record<
  //       string,
  //       {
  //         minAmount: Prisma.Decimal;
  //         maxAmount: Prisma.Decimal;
  //         conversionRate: Prisma.Decimal;
  //       }
  //     >
  //   > = {};

  //   for (const type of TYPES) {
  //     paymentConfig[type] = {};
  //     for (const mode of MODES) {
  //       paymentConfig[type][mode] = {
  //         minAmount: new Prisma.Decimal(this.paymentConfig.minDeposit ?? 100),
  //         maxAmount: new Prisma.Decimal(
  //           this.paymentConfig.maxDeposit ?? 100000,
  //         ),
  //         conversionRate: new Prisma.Decimal(
  //           this.paymentConfig.conversionRate ?? 1,
  //         ),
  //       };
  //     }
  //   }

  //   for (const cfg of paymentConfigs) {
  //     const type = cfg.type; // Debit or Credit
  //     const mode = cfg.paymentMode; // EWallet, Bank, Crypto
  //     paymentConfig[type][mode] = {
  //       minAmount: new Prisma.Decimal(
  //         cfg.minAmount ?? this.paymentConfig.minDeposit ?? 100,
  //       ),
  //       maxAmount: new Prisma.Decimal(
  //         cfg.maxAmount ?? this.paymentConfig.maxDeposit ?? 100000,
  //       ),
  //       conversionRate: new Prisma.Decimal(
  //         cfg.conversionRate ?? this.paymentConfig.conversionRate ?? 126,
  //       ),
  //     };
  //   }

  //   const cryptoWallet = await this.prisma.crypto.findFirst({
  //     where: {
  //       userId: activeBanker.bankerId,
  //       status: StatusType.Active,
  //     },
  //   });

  //   const activeAccounts = await this.prisma.digitalPayment.findMany({
  //     where: { userId: activeBanker.bankerId, status: StatusType.Active },
  //     select: {
  //       id: true,
  //       userId: true,
  //       paymentMode: true,
  //       accountType: true,
  //       number: true,
  //       accountNumber: true,
  //       bankName: true,
  //       accountHolder: true,
  //       branchName: true,
  //       districtName: true,
  //     },
  //   });

  //   const grouped = {
  //     wallet: [] as typeof activeAccounts,
  //     bank: [] as typeof activeAccounts,
  //     cryptoWallet,
  //   };
  //   const walletModes: PaymentMode[] = [
  //     PaymentMode.bKash,
  //     PaymentMode.Rocket,
  //     PaymentMode.Nagad,
  //   ];

  //   for (const p of activeAccounts) {
  //     if (walletModes.includes(p.paymentMode)) {
  //       grouped.wallet.push(p);
  //     } else if (p.paymentMode === PaymentMode.Bank) {
  //       grouped.bank.push(p);
  //     }
  //   }

  //   return {
  //     banker: activeBanker,
  //     accounts: grouped,
  //     paymentConfig: paymentConfig,
  //   };
  // }

  async generateCryptoQR(id: bigint) {
    const crypto = await this.cryptoService.getById(id);

    if (!crypto) {
      throw new Error('No active crypto wallet found');
    }

    const walletAddress = crypto.walletAddress;

    // Generate QR as Base64 Image
    const qrImage = await QRCode.toDataURL(walletAddress);

    console.log(qrImage);

    return {
      crypto,
      qr: qrImage,
    };
  }

  async createOrUpdatePaymentConfig(
    userId: bigint,
    dto: CreatepaymentConfigDto,
  ) {
    if (
      dto.minAmount != null &&
      dto.maxAmount != null &&
      dto.minAmount >= 0 &&
      dto.maxAmount >= 0 &&
      dto.minAmount > dto.maxAmount
    ) {
      this.logger.warn(
        `Invalid amount range | min=${dto.minAmount}, max=${dto.maxAmount}`,
      );
      throw new Error('Minimum amount cannot be greater than maximum amount.');
    }

    const exists = await this.prisma.paymentConfig.findFirst({
      where: {
        userId,
        paymentMode: dto.paymentMode,
        type: dto.type,
      },
    });

    let result;
    let isUpdated = false;

    if (exists) {
      result = await this.prisma.paymentConfig.update({
        where: { id: exists.id },
        data: {
          maxAmount: new Prisma.Decimal(dto.maxAmount),
          minAmount: new Prisma.Decimal(dto.minAmount),
        },
      });
      isUpdated = true;
    } else {
      result = await this.prisma.paymentConfig.create({
        data: {
          userId,
          paymentMode: dto.paymentMode,
          type: dto.type,
          maxAmount: new Prisma.Decimal(dto.maxAmount),
          minAmount: new Prisma.Decimal(dto.minAmount),
        },
      });
    }

    return {
      success: true,
      message: isUpdated
        ? 'Payment configuration updated successfully.'
        : 'Payment configuration created successfully.',
      data: result,
    };
  }

  async updatepaymentConfig(
    id: bigint,
    dto: {
      maxDeposit?: number;
      minDeposit?: number;
      maxWithdraw?: number;
      minWithdraw?: number;
    },
  ) {
    const existing = await this.prisma.paymentConfig.findFirst({
      where: { id },
    });
    if (!existing) {
      this.logger.warn(`Payment config not found | configId=${id}`);
      throw new Error('Banker configuration not found.');
    }

    const data: any = {};

    if (dto.maxDeposit !== undefined) {
      data.maxDeposit = new Prisma.Decimal(dto.maxDeposit);
    }
    if (dto.minDeposit !== undefined) {
      data.minDeposit = new Prisma.Decimal(dto.minDeposit);
    }
    if (dto.maxWithdraw !== undefined) {
      data.maxWithdraw = new Prisma.Decimal(dto.maxWithdraw);
    }
    if (dto.minWithdraw !== undefined) {
      data.minWithdraw = new Prisma.Decimal(dto.minWithdraw);
    }

    this.logger.info(`Payment config updated successfully | configId=${id}`);
    return await this.prisma.paymentConfig.update({
      where: { id },
      data,
    });
  }

  async deletepaymentConfig(bankerId: bigint) {
    const existing = await this.prisma.paymentConfig.findFirst();
    if (!existing) {
      throw new Error('Banker configuration not found.');
    }

    const result = await this.prisma.paymentConfig.delete({
      where: { id: existing.id },
    });

    return {
      message: 'Banker configuration deleted successfully.',
      result,
    };
  }

  async deleteBanker(bankerId: bigint) {
    const banker = await this.userService.getById(bankerId);
    if (!banker) {
      this.logger.warn(`Banker not found | bankerId=${bankerId}`);
      throw new Error('Banker not found');
    }

    const isActive = await this.prisma.activeBanker.findFirst({
      where: { bankerId },
    });

    if (isActive) {
      this.logger.warn(
        `Attempt to delete active banker | bankerId=${bankerId}`,
      );
      throw new Error(
        'Active banker cannot be deleted. Please deactivate the banker first.',
      );
    }

    await this.prisma.user.update({
      where: { id: bankerId },
      data: { deletedAt: new Date() },
    });
    this.logger.info(`Banker soft deleted successfully | bankerId=${bankerId}`);
    return { message: 'Banker soft deleted successfully', bankerId };
  }

  // async editBanker(bankerId: bigint, data: EditBankerDto) {
  //   const banker = await this.prisma.user.findUnique({
  //     where: { id: bankerId },
  //     include: { role: true },
  //   });

  //   if (!banker) throw new Error('Banker not found');

  //   if (data.mobile && data.mobile !== banker.mobile) {
  //     const exists = await this.prisma.user.findFirst({
  //       where: { mobile: data.mobile, NOT: { id: bankerId } },
  //     });
  //     if (exists) throw new Error('Mobile already exists');
  //   }

  //   if (data.username && data.username !== banker.username) {
  //     const exists = await this.prisma.user.findFirst({
  //       where: { username: data.username, NOT: { id: bankerId } },
  //     });
  //     if (exists) throw new Error('Username already exists');
  //   }

  //   const updatedBanker = await this.prisma.user.update({
  //     where: { id: bankerId },
  //     data: { ...data },
  //   });

  //   return { message: 'Banker updated successfully', banker: updatedBanker };
  // }

  async getDepositWithdrawSummary(options: {
    fromDate?: Date;
    toDate?: Date;
    bankerId?: bigint;
  }) {
    const where: Prisma.DepositWithdrawRequestWhereInput = {};

    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gt = new Date(options.fromDate);
      if (options.toDate) where.createdAt.lt = new Date(options.toDate);
    }

    if (options.bankerId) {
      where.bankerId = BigInt(options.bankerId);
    }

    const transactions = await this.prisma.depositWithdrawRequest.findMany({
      where,
      select: {
        status: true,
        amount: true,
        type: true,
        cryptoId: true,
        conversionRate: true,
      },
    });

    // const totals: Record<
    //   'Pending' | 'Approved' | 'Rejected',
    //   { count: number; amount: Prisma.Decimal }
    // > = {
    //   Pending: { count: 0, amount: new Prisma.Decimal(0) },
    //   Approved: { count: 0, amount: new Prisma.Decimal(0) },
    //   Rejected: { count: 0, amount: new Prisma.Decimal(0) },
    // };

    type Status = 'Pending' | 'Approved' | 'Rejected';
    type TxType = 'Credit' | 'Debit';

    type SummaryKey = `${Status}${TxType}`;

    const totals: Record<
      SummaryKey,
      { count: number; amount: Prisma.Decimal }
    > = {
      PendingCredit: { count: 0, amount: new Prisma.Decimal(0) },
      PendingDebit: { count: 0, amount: new Prisma.Decimal(0) },

      ApprovedCredit: { count: 0, amount: new Prisma.Decimal(0) },
      ApprovedDebit: { count: 0, amount: new Prisma.Decimal(0) },

      RejectedCredit: { count: 0, amount: new Prisma.Decimal(0) },
      RejectedDebit: { count: 0, amount: new Prisma.Decimal(0) },
    };

    // type AllowedStatus = 'Pending' | 'Approved' | 'Rejected';

    // for (const tx of transactions) {
    //   const status = tx.status as WalletTransactionStatus;

    //   if (['Pending', 'Approved', 'Rejected'].includes(status)) {
    //     const key = status as AllowedStatus;

    //     let finalAmount = tx.amount;

    //     if (tx.cryptoId) {
    //       if (!tx.conversionRate) {
    //         this.logger.warn(
    //           `Missing conversion rate | transactionStatus=${tx.status}`,
    //         );
    //         throw new Error('Conversion rate missing for crypto transaction');
    //       }
    //       finalAmount = finalAmount.mul(new Prisma.Decimal(tx.conversionRate));
    //     }

    //     totals[key].count++;
    //     totals[key].amount = totals[key].amount.add(finalAmount);
    //   }
    // }

    // for (const tx of transactions) {
    //   const status = tx.status as WalletTransactionStatus;

    //   if (['Pending', 'Approved', 'Rejected'].includes(status)) {
    //     const key = status as AllowedStatus;

    //     let finalAmount = tx.amount;

    //     if (tx.cryptoId) {
    //       if (!tx.conversionRate) {
    //         this.logger.warn(
    //           `Missing conversion rate | transactionStatus=${tx.status}`,
    //         );
    //         throw new Error('Conversion rate missing for crypto transaction');
    //       }
    //       finalAmount = finalAmount.mul(new Prisma.Decimal(tx.conversionRate));
    //     }

    //     totals[key].count++;
    //     totals[key].amount = totals[key].amount.add(finalAmount);
    //   }
    // }

    for (const tx of transactions) {
      const status = tx.status as Status;
      const type =
        tx.type === WalletTransactionType.Credit ? 'Credit' : 'Debit';

      if (!['Pending', 'Approved', 'Rejected'].includes(status)) continue;

      let finalAmount = tx.amount;

      if (tx.cryptoId) {
        if (!tx.conversionRate) {
          this.logger.warn(
            `Missing conversion rate | transactionStatus=${tx.status}`,
          );
          throw new Error('Conversion rate missing for crypto transaction');
        }
        finalAmount = finalAmount.mul(new Prisma.Decimal(tx.conversionRate));
      }

      const key = `${status}${type}` as SummaryKey;

      totals[key].count += 1;
      totals[key].amount = totals[key].amount.add(finalAmount);
    }

    const totalRequests = transactions.length;

    if (options.bankerId) {
      const currentBalance = await this.walletService.getByUserId(
        options.bankerId,
        WalletType.Main,
      );

      const totalAmount = await this.walletService.getTotalPointIssueAmount(
        options.bankerId,
      );

      return {
        totals,
        currentBalance,
        totalRequests,
        totalAmount,
      };
    }
    const totalAmount = await this.getTotalPointIssuedForAllBankers(); // returns global total

    return {
      totals,
      totalRequests,
      totalAmount,
    };
  }

  async updateAllCryptoConversionRate(id: number, conversionRate: number) {
    try {
      const exists = await this.prisma.paymentOption.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!exists) {
        throw new Error(`Payment option with id ${id} not found`);
      }

      return await this.prisma.paymentOption.update({
        where: { id },
        data: {
          usdRate: conversionRate.toString(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Error updating crypto conversion rate for paymentOptionId=${id}`,
        error,
      );
      throw error;
    }
  }

  async findBankerConfigs(userId: bigint) {
    const result = await this.prisma.paymentConfig.findMany({
      where: {
        userId,
        type: WalletTransactionType.Credit,
      },
      select: {
        paymentMode: true,
        type: true,
        minAmount: true,
        maxAmount: true,
      },
      orderBy: {
        paymentMode: 'asc',
      },
    });

    const MODES = ['EWallet', 'Bank', 'Crypto'];
    const TYPES = ['Credit'];

    const defaults = {
      minAmount: this.paymentConfig.minDeposit ?? 100,
      maxAmount: this.paymentConfig.maxDeposit ?? 100000,
    };

    const configMap: Record<string, Record<string, any>> = {};
    result.forEach((cfg) => {
      if (!configMap[cfg.type]) configMap[cfg.type] = {};
      configMap[cfg.type][cfg.paymentMode] = {
        minAmount: cfg.minAmount ?? defaults.minAmount,
        maxAmount: cfg.maxAmount ?? defaults.maxAmount,
      };
    });

    TYPES.forEach((type) => {
      if (!configMap[type]) configMap[type] = {};
      MODES.forEach((mode) => {
        if (!configMap[type][mode]) {
          configMap[type][mode] = { ...defaults };
        }
      });
    });

    const depositConfigs = [];
    for (const type of TYPES) {
      for (const mode of MODES) {
        depositConfigs.push({
          type,
          paymentMode: mode,
          minAmount: configMap[type][mode].minAmount,
          maxAmount: configMap[type][mode].maxAmount,
        });
      }
    }
    return depositConfigs;
  }

  async exportDepositWithdraw(
    loggedInUserId: bigint,
    userType: UserType,
    options: GetDepositWithdrawQueryDto,
  ) {
    const isAdmin = userType === UserType.Admin;
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.depositWithdraw,
        format: options.exportFormat,
        status: 'Pending',
        userId: isAdmin ? undefined : loggedInUserId,
        adminId: isAdmin ? loggedInUserId : undefined,
        name: options.fileName ?? 'Deposit/Withdraw Request',
        filters: {
          userType,
          status: options.status ?? undefined,
          type: options.type ?? undefined,
          fromDate:
            options.fromDate instanceof Date
              ? options.fromDate.toISOString()
              : options.fromDate,
          toDate:
            options.toDate instanceof Date
              ? options.toDate.toISOString()
              : options.toDate,
          isUpi: options.isUpi ?? undefined,
          isBank: options.isBank ?? undefined,
          search: options.search ?? undefined,
        },
      },
    });
    return {
      message:
        'Your deposit & withdrawal export has been successfully initiated.',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async getTotalPointIssuedForAllBankers() {
    const appConfig = appConfigFactory() as unknown as AppConfig;
    const rolesConfig = appConfig.userTypes ?? {};

    const bankerRole = Object.keys(rolesConfig).find(
      (r) => r.toLowerCase() === 'banker',
    );

    if (!bankerRole) {
      return { totalPointIssued: 0 };
    }

    const bankers = await this.prisma.user.findMany({
      where: {
        role: {
          name: bankerRole,
        },
      },
      select: {
        id: true,
      },
    });

    if (!bankers.length) {
      return { totalPointIssued: 0 };
    }

    const bankerIds = bankers.map((b) => BigInt(b.id));

    const totalIssued = await this.prisma.walletTransactions.aggregate({
      where: {
        wallet: {
          userId: { in: bankerIds },
          type: WalletType.Main,
        },
        context: WalletTransactionContext.SystemDeposit,
        status: WalletTransactionStatus.Confirmed,
      },
      _sum: {
        amount: true,
      },
    });

    return {
      userId: null,
      totalPointIssueAmount: Number(totalIssued._sum.amount ?? 0),
    };
  }

  async showAccount(userId: bigint) {
    const userMeta = await this.userService.getMetaById(userId);
    if (!userMeta?.uplineId) {
      throw new Error('Not a valid user');
    }
    const uplineId = BigInt(userMeta.uplineId);

    let Bank: any[] = [];
    let eWallet: any[] = [];
    let Crypto: any[] = [];
    console.log(uplineId, ' uplineId');
    const user = await this.userService.getById(userId);

    if (uplineId === BigInt(0) || user.isSelfRegistered) {
      Bank = await this.prisma.bank.findMany({
        where: {
          userId: null,
          adminId: { not: null },
          status: StatusType.Active,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      eWallet = await this.prisma.digitalPayment.findMany({
        where: {
          userId: null,
          adminId: { not: null },
          status: StatusType.Active,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      Crypto = await this.prisma.crypto.findMany({
        where: {
          userId: null,
          adminId: { not: null },
          status: StatusType.Active,
          deletedAt: null,
          network: {
            paymentOptions: {
              some: {
                name: 'USDT',
              },
            },
          },
        },
        include: {
          network: {
            include: {
              paymentOptions: {
                where: {
                  name: 'USDT',
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Crypto = await this.prisma.crypto.findMany({
      //   where: {
      //     userId: null,
      //     adminId: { not: null },
      //     status: StatusType.Active,
      //     deletedAt: null,
      //   },
      //   include: {
      //     network: {
      //       include: {
      //         paymentOptions: true,
      //       },
      //     },
      //   },
      //   orderBy: { createdAt: 'desc' },
      // });
    } else {
      Bank = await this.prisma.bank.findMany({
        where: {
          userId: uplineId,
          status: StatusType.Active,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      console.log('upi', eWallet);
      eWallet = await this.prisma.digitalPayment.findMany({
        where: {
          userId: uplineId,
          status: StatusType.Active,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      Crypto = await this.prisma.crypto.findMany({
        where: {
          userId: uplineId,
          status: StatusType.Active,
          deletedAt: null,
          network: {
            paymentOptions: {
              some: {
                name: 'USDT',
              },
            },
          },
        },
        include: {
          network: {
            include: {
              paymentOptions: {
                where: {
                  name: 'USDT',
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc', // ✅ moved to top level
        },
      });

      // Crypto = await this.prisma.crypto.findMany({
      //   where: {
      //     userId: null,
      //     adminId: { not: null },
      //     status: StatusType.Active,
      //     deletedAt: null,
      //   },
      //   include: {
      //     network: {
      //       include: {
      //         paymentOptions: true,
      //       },
      //     },
      //   },
      //   orderBy: { createdAt: 'desc' },
      // });
    }

    return {
      status: true,
      message: 'Account fetched successfully',
      Bank: Bank,
      eWallet: eWallet,
      Crypto: Crypto,
    };
  }
}
