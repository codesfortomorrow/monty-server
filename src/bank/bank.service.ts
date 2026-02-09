import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { BaseService, Pagination, PaginationRequest, UserType } from '@Common';
import { UsersService } from 'src/users';
import {
  BankSelectType,
  Prisma,
  StatusType,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { CreateBankDto, CreateBankTransactionDto, UpdateBankDto } from './dto';
import { WalletsService } from 'src/wallets/wallets.service';
import { use } from 'passport';

@Injectable()
export class BankService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly walletService: WalletsService,
  ) {
    super({ loggerDefaultMeta: { service: BankService.name } });
  }

  async addBank(userId: bigint, userType: UserType, data: CreateBankDto) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    const accountNumber = data.accountNumber?.trim();
    const iban = data.iban?.trim().toUpperCase();
    const accountHolder = data.accountHolder?.trim();
    const branchName = data.branchName?.trim();
    const distict = data.distict?.trim();
    let hasUserRole = false;
    if (userType === UserType.User) {
      hasUserRole = await this.usersService.hasRole(userId, 'USER');
    }
    if (!accountNumber || !/^\d{9,18}$/.test(accountNumber)) {
      throw new Error('Account number must be 9 to 18 digits.');
    }

    if (!iban || !/^[A-Z0-9]{15,34}$/.test(iban)) {
      throw new Error('Invalid IBAN code.');
    }

    if (!accountHolder || !/^[A-Za-z\s]{3,25}$/.test(accountHolder)) {
      throw new Error(
        'Account holder name must be 3–25 letters and spaces only.',
      );
    }

    if (!branchName || branchName.length < 3) {
      throw new Error('Branch name is required.');
    }

    if (!distict || distict.length < 2) {
      throw new Error('District is required.');
    }

    if (!data.bankName) {
      throw new Error('Bank name is required.');
    }

    const bankName = data.bankName.trim();
    if (!/^[A-Za-z&\-\s]{3,50}$/.test(bankName)) {
      throw new Error(
        'Bank name must contain only letters, spaces, & or - (3–50 chars).',
      );
    }

    let minDepositAmount: Prisma.Decimal | undefined;
    let maxDepositAmount: Prisma.Decimal | undefined;

    if (!hasUserRole || userType === UserType.Admin) {
      if (!data.selectType) {
        throw new Error('Select type is required.');
      }

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
      minDepositAmount = new Prisma.Decimal(data.minAmount);
      maxDepositAmount = new Prisma.Decimal(data.maxAmount);
    }

    // Duplicate check
    const whereCondition: any = {
      accountNumber,
      iban,
      deletedAt: null,
    };

    if (userType === UserType.User) {
      whereCondition.userId = userId;
    }

    if (userType === UserType.Admin) {
      whereCondition.adminId = userId;
    }

    const existing = await this.prisma.bank.findFirst({
      where: whereCondition,
    });

    if (existing) {
      throw new Error('Same bank account already exists.');
    }

    const bank = await this.prisma.bank.create({
      data: {
        accountNumber,
        iban,
        accountHolder,
        bankName,
        branchName,
        distict,
        selectType: data.selectType ?? BankSelectType.Account1,
        status: StatusType.Inactive,
        minDepositAmount:
          minDepositAmount !== undefined
            ? new Prisma.Decimal(minDepositAmount)
            : undefined,
        maxDepositAmount:
          maxDepositAmount !== undefined
            ? new Prisma.Decimal(maxDepositAmount)
            : undefined,
        ...(userType === UserType.User && {
          user: { connect: { id: userId } },
        }),
        ...(userType === UserType.Admin && {
          admin: { connect: { id: userId } },
        }),
      },
    });

    return {
      status: true,
      message: 'Bank account added successfully',
      data: bank,
    };
  }

  async deleteBank(id: bigint, userId: bigint, userType: UserType) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }
    if (userType === UserType.Admin) {
      const bank = await this.prisma.bank.findFirst({
        where: {
          id,
          adminId: userId,
          deletedAt: null,
        },
      });

      if (!bank) {
        throw new Error('Bank account not found');
      }
    } else {
      const bank = await this.prisma.bank.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!bank) {
        throw new Error('Bank account not found');
      }

      if (!bank.userId || BigInt(bank.userId) !== BigInt(userId)) {
        throw new Error('Not authorized to modify this bank account.');
      }
    }

    await this.prisma.bank.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      status: true,
      message: 'Bank account deleted successfully',
    };
  }

  async listBank(
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

    const where: Prisma.BankWhereInput = {
      deletedAt: null,
    };

    if (userType === UserType.User) {
      where.userId = userId;
    }

    if (userType === UserType.Admin) {
      where.adminId = { not: null };
    }

    const [banks, totalItems] = await Promise.all([
      this.prisma.bank.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.bank.count({ where }),
    ]);

    const pagination: Pagination = {
      currentPage: page,
      totalPage: Math.ceil(totalItems / limit),
      totalItems,
      limit,
    };

    return {
      status: true,
      message: 'Bank accounts fetched successfully',
      banks,
      pagination,
    };
  }

  async activateBank(userId: bigint, userType: UserType, bankId: bigint) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    const bank = await this.prisma.bank.findFirst({
      where: {
        id: bankId,
        deletedAt: null,
      },
    });

    if (!bank) {
      throw new Error('Bank not found.');
    }

    if (userType === UserType.User) {
      if (!bank.userId || BigInt(bank.userId) !== BigInt(userId)) {
        throw new Error('Not authorized to modify this bank account.');
      }
    }

    const isActive = bank.status === StatusType.Active;

    if (isActive) {
      const updated = await this.prisma.bank.update({
        where: { id: bankId },
        data: { status: StatusType.Inactive },
      });

      return {
        status: true,
        message: 'Bank deactivated successfully.',
        data: updated,
      };
    }

    const whereClause: any = {
      deletedAt: null,
      status: StatusType.Active,
      id: { not: bankId },
    };

    if (bank.selectType) {
      whereClause.selectType = bank.selectType;
    }

    if (userType === UserType.Admin) {
      whereClause.adminId = { not: null };
    } else {
      whereClause.userId = userId;
    }

    await this.prisma.bank.updateMany({
      where: whereClause,
      data: { status: StatusType.Inactive },
    });

    const activated = await this.prisma.bank.update({
      where: { id: bankId },
      data: { status: StatusType.Active },
    });

    return {
      status: true,
      message: `Bank activated successfully.`,
      data: activated,
    };
  }

  async createDepositWithdrawRequest(
    userId: bigint,
    userType: UserType,
    data: CreateBankTransactionDto,
  ) {
    // const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
    // if (isDemoUser) {
    //   throw new Error('Demo accounts are not allowed to perform this action.');
    // }

    let amount: Prisma.Decimal;
    amount = new Prisma.Decimal(data.amount);

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

    const bank = await this.prisma.bank.findFirst({
      where: {
        id: BigInt(data.bankId),
        deletedAt: null,
      },
    });

    if (!bank) {
      throw new Error('Invalid bank. Please select a valid payment method.');
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

      const minDeposit = bank.minDepositAmount
        ? new Prisma.Decimal(bank.minDepositAmount)
        : new Prisma.Decimal(100);

      if (amount.lt(minDeposit)) {
        throw new Error(
          `Deposit amount (${amount.toFixed(
            2,
          )}) is below the minimum limit (${minDeposit.toFixed(2)}).`,
        );
      }

      if (bank.maxDepositAmount) {
        const maxDeposit = new Prisma.Decimal(bank.maxDepositAmount);
        if (amount.gt(maxDeposit)) {
          throw new Error(
            `Deposit amount (${amount.toFixed(
              2,
            )}) exceeds the maximum limit (${maxDeposit.toFixed(2)}).`,
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
              `Failed to lock amount ${amount} for userId=${userId}`,
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
            bankId: bank.id,
            bankerId,
            image,
            transactionCode,
            statusUpdatedAt: new Date(),
          },
        });
      });

      let message = 'Request created successfully.';

      if (data.type === WalletTransactionType.Credit) {
        message = 'Deposit request created successfully.';
      }

      if (data.type === WalletTransactionType.Debit) {
        message = 'Withdraw request created successfully.';
      }

      return {
        status: true,
        message: message,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to create ${data.type} request`);
      throw error;
    }
  }
}
