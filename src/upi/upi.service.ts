import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';

import { BaseService, Pagination, PaginationRequest, UserType } from '@Common';
import { CreateUpiDto, CreateUpiTransactionDto, UpdateUpiDto } from './dto';
import { UsersService } from 'src/users';
import {
  Prisma,
  StatusType,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { WalletsService } from 'src/wallets/wallets.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class UpiService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly walletService: WalletsService,
  ) {
    super({ loggerDefaultMeta: { service: UpiService.name } });
  }

  async addUpi(userId: bigint, userType: UserType, data: CreateUpiDto) {
    let isUser = false;
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
      isUser = await this.usersService.hasRole(userId, 'USER');
    }

    const upiId = data.upiId?.trim().toLowerCase();
    const accountHolder = data.name?.trim();
    const phoneNumber = data.number?.trim();
    const qrCode = data.qrCode?.trim();
    const type = data.type;
    let status: StatusType = StatusType.Inactive;

    if (!upiId || !/^(?=.{8,30}$)[a-zA-Z0-9_-]{3,}@[a-zA-Z]{3,}$/.test(upiId)) {
      throw new Error(
        'Invalid UPI ID. Use 3+ alphanumeric characters before @ and 3+ letters after.',
      );
    }

    if (!isUser || userType === UserType.Admin) {
      if (!type) {
        throw new Error('UPI type is required ');
      }

      if (!qrCode) {
        throw new Error('QR code is required ');
      }

      if (data.minAmount === undefined || data.minAmount === null) {
        throw new Error('Minimum amount is required ');
      }

      if (data.maxAmount === undefined || data.maxAmount === null) {
        throw new Error('Maximum amount is required');
      }

      if (data.maxAmount < data.minAmount) {
        throw new Error(
          'Maximum amount must be greater than or equal to minimum amount.',
        );
      }

      if (!qrCode || !/^https?:\/\/.+\..+/.test(qrCode)) {
        throw new Error('QR code must be a valid URL.');
      }

      status = StatusType.Inactive;
    } else {
      if (isUser && userType === UserType.User) {
        if (!accountHolder || !/^[A-Za-z\s]{3,25}$/.test(accountHolder)) {
          throw new Error(
            'Account holder name must be 3-25 letters and spaces only.',
          );
        }

        if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber)) {
          throw new Error('Phone number must be 7-15 digits.');
        }
      }
    }

    const upiData: any = {
      userId: userType === UserType.Admin ? null : userId,
      adminId: userType === UserType.Admin ? userId : null,
      upiId,
      status: status,
    };

    if (isUser) {
      if (qrCode) upiData.qrCode = qrCode;
      if (type) upiData.type = type;
      if (data.minAmount !== undefined) upiData.minAmount = data.minAmount;
      if (data.maxAmount !== undefined) upiData.maxAmount = data.maxAmount;
      upiData.number = phoneNumber;
      upiData.name = accountHolder;
    } else {
      upiData.type = type;
      upiData.qrCode = qrCode;
      upiData.minAmount = data.minAmount;
      upiData.maxAmount = data.maxAmount;
    }

    const existing = await this.prisma.upi.findFirst({
      where: {
        upiId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new Error('UPI with the same UPI ID already exists.');
    }

    const newUpi = await this.prisma.upi.create({
      data: upiData,
    });

    return {
      status: true,
      message: 'UPI ID added successfully',
      data: newUpi,
    };
  }

  async deleteUpi(id: bigint, userId: bigint, userType: UserType) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    if (userType === UserType.Admin) {
      const upi = await this.prisma.upi.findFirst({
        where: {
          id,
          adminId: userId,
          deletedAt: null,
        },
      });

      if (!upi) {
        throw new Error('UPI not found');
      }
    } else {
      const upi = await this.prisma.upi.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!upi) {
        throw new Error('UPI not found');
      }
    }

    // if (upi.status === StatusType.Active) {
    //     throw new Error('Active UPI cannot be deleted');
    // }

    const deleted = await this.prisma.upi.update({
      where: {
        id: id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      status: true,
      message: 'UPI deleted successfully',
    };
  }

  async listUpiId(
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
    const where: Prisma.UpiWhereInput = {
      deletedAt: null,
    };

    if (userType === UserType.Admin) {
      where.adminId = userId;
    } else {
      where.userId = userId;
    }

    const [upi, totalItems] = await Promise.all([
      this.prisma.upi.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.upi.count({ where }),
    ]);

    const pagination: Pagination = {
      currentPage: page,
      totalPage: Math.ceil(totalItems / limit),
      totalItems,
      limit,
    };

    return {
      status: true,
      message: 'UPI id fetched successfully',
      upi,
      pagination,
    };
  }

  async updateUpi(userId: bigint, upiId: bigint, data: UpdateUpiDto) {
    const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
    if (isDemoUser) {
      throw new Error('Demo accounts are not allowed to perform this action.');
    }

    const upi = await this.prisma.upi.findFirst({
      where: {
        id: upiId,
        deletedAt: null,
      },
    });

    if (!upi) {
      throw new Error('UPI ID not found ');
    }

    const isUser = await this.usersService.hasRole(userId, 'USER');

    const updateData: any = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name || !/^[A-Za-z\s]{3,25}$/.test(name)) {
        throw new Error(
          'Account holder name must be 3-25 letters and spaces only.',
        );
      }
      updateData.name = name;
    }

    if (data.upiId !== undefined) {
      const newUpiId = data.upiId.trim().toLowerCase();
      if (
        !newUpiId ||
        !/^(?=.{8,30}$)[a-zA-Z0-9_-]{3,}@[a-zA-Z]{3,}$/.test(newUpiId)
      ) {
        throw new Error(
          'Invalid UPI ID. Use 3+ alphanumeric characters before @ and 3+ letters after.',
        );
      }
      updateData.upiId = newUpiId;
    }

    if (data.number !== undefined) {
      const number = data.number.trim();
      if (!number || !/^\d{7,15}$/.test(number)) {
        throw new Error('Phone number must be 7-15 digits.');
      }
      updateData.number = number;
    }

    if (data.type !== undefined) {
      if (!isUser && !data.type) {
        throw new Error('UPI type is required');
      }
      updateData.type = data.type;
    }

    if (data.qrCode !== undefined) {
      const qrCode = data.qrCode.trim();
      if (!isUser) {
        if (!qrCode) {
          throw new Error('QR code is required ');
        }
        if (!/^https?:\/\/.+\..+/.test(qrCode)) {
          throw new Error('QR code must be a valid URL.');
        }
      }
      updateData.qrCode = qrCode || null;
    }

    if (data.minAmount !== undefined) {
      if (
        !isUser &&
        (data.minAmount === null || data.minAmount === undefined)
      ) {
        throw new Error('Minimum amount is required.');
      }
      if (data.minAmount !== null && typeof data.minAmount !== 'number') {
        throw new Error('Minimum amount must be a number.');
      }
      updateData.minAmount = data.minAmount;
    }

    if (data.maxAmount !== undefined) {
      if (
        !isUser &&
        (data.maxAmount === null || data.maxAmount === undefined)
      ) {
        throw new Error('Maximum amount is required .');
      }
      if (data.maxAmount !== null && typeof data.maxAmount !== 'number') {
        throw new Error('Maximum amount must be a number.');
      }
      updateData.maxAmount = data.maxAmount;
    }
    if (data.minAmount !== undefined && data.maxAmount !== undefined) {
      if (
        data.minAmount !== null &&
        data.maxAmount !== null &&
        data.maxAmount < data.minAmount
      ) {
        throw new Error(
          'Maximum amount must be greater than or equal to minimum amount.',
        );
      }
    }

    if (data.upiId !== undefined) {
      const upiIdToCheck = updateData.upiId || upi.upiId;

      const duplicate = await this.prisma.upi.findFirst({
        where: {
          upiId: upiIdToCheck,
          deletedAt: null,
          NOT: {
            id: upiId,
          },
        },
      });

      if (duplicate) {
        throw new Error('This UPI ID already exists in the system.');
      }
    }

    const updatedUpi = await this.prisma.upi.update({
      where: {
        id: upiId,
      },
      data: updateData,
    });

    return {
      status: true,
      message: 'UPI ID updated successfully',
      data: updatedUpi,
    };
  }

  async activateUpi(userId: bigint, userType: UserType, upiId: bigint) {
    if (userType === UserType.User) {
      const isDemoUser = await this.usersService.hasRole(userId, 'DEMO');
      if (isDemoUser) {
        throw new Error(
          'Demo accounts are not allowed to perform this action.',
        );
      }
    }

    const upi = await this.prisma.upi.findFirst({
      where: {
        id: upiId,
        deletedAt: null,
      },
    });

    if (!upi) {
      throw new Error('UPI not found.');
    }

    const isNotOwner = upi.userId !== userId;
    const isNormalUser = userType === UserType.User;

    if (isNotOwner && isNormalUser) {
      throw new Error('This is not your account');
    }

    const isActive = upi.status === StatusType.Active;

    if (isActive) {
      const updated = await this.prisma.upi.update({
        where: {
          id: upiId,
          type: upi.type,
        },
        data: { status: StatusType.Inactive },
      });

      return {
        status: true,
        message: 'UPI deactivated successfully.',
        data: updated,
      };
    }

    const whereClause: any = {
      deletedAt: null,
      status: StatusType.Active,
      id: { not: upiId },
    };

    if (upi.type) {
      whereClause.type = upi.type;
    }

    if (userType === UserType.Admin) {
      whereClause.adminId = { not: null };
      whereClause.userId = null;
    } else {
      whereClause.userId = userId;
      whereClause.adminId = null;
    }

    await this.prisma.upi.updateMany({
      where: whereClause,
      data: { status: StatusType.Inactive },
    });

    const activated = await this.prisma.upi.update({
      where: { id: upiId },
      data: { status: StatusType.Active },
    });

    return {
      status: true,
      message: `UPI activated successfully.`,
      data: activated,
    };
  }

  async createUpiTransactionRequest(
    userId: bigint,
    userType: UserType,
    data: CreateUpiTransactionDto,
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

    const upi = await this.prisma.upi.findFirst({
      where: {
        id: data.UPI,
        deletedAt: null,
      },
    });

    if (!upi) {
      throw new Error('Invalid UPI ID. Please select a valid UPI.');
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

      const minAmount = upi.minAmount
        ? new Prisma.Decimal(upi.minAmount)
        : new Prisma.Decimal(100);

      if (amount.lt(minAmount)) {
        throw new Error(
          `Deposit amount (${amount.toFixed(
            2,
          )}) is below the minimum limit (${minAmount.toFixed(2)}).`,
        );
      }

      if (upi.maxAmount) {
        const maxAmount = new Prisma.Decimal(upi.maxAmount);
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
            upiId: data.UPI,
            bankerId, // ✅ NULL or valid User.id ONLY
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
      this.logger.error(`Failed to create UPI transaction `);
      throw error;
    }
  }
}
