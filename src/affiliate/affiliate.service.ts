import { BaseService, Pagination, PaginationRequest, UserType } from '@Common';
import { commissionConfigFactory } from '@Config';
import { Inject, Injectable, Req } from '@nestjs/common';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
} from 'date-fns';
import {
  AffiliateStatus,
  CommissionStatus,
  ExportFormat,
  ExportStatus,
  ExportType,
  Prisma,
  RequestStatus,
} from '@prisma/client';
import crypto from 'crypto';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletsService } from 'src/wallets/wallets.service';
import { UsersService } from 'src/users';
import { AdminService } from 'src/admin';
import {
  ActiveUserDto,
  CreateAffiliateDto,
  CreateCommissionRangeDto,
  GetAffiliateListDto,
  GetReferralUsersDto,
  GetWeeklyCommissionHistoryDto,
  UpdateCommissionRangeDto,
} from './dto';
import dayjs from 'dayjs';

@Injectable()
export class AffiliateService extends BaseService {
  constructor(
    @Inject(commissionConfigFactory.KEY)
    private readonly commissionConfig: ConfigType<
      typeof commissionConfigFactory
    >,
    private readonly walletService: WalletsService,
    private readonly prisma: PrismaService,
    private readonly userService: UsersService,
    private readonly adminService: AdminService,
  ) {
    super({ loggerDefaultMeta: { service: AffiliateService.name } });
  }

  async createAffiliateRequest(userId: bigint, data: CreateAffiliateDto) {
    if (!data.reasonFrom?.trim()) {
      throw new Error(
        'Reason is required when submitting an affiliate request.',
      );
    }

    const isDemoUser = await this.userService.hasRole(userId, 'DEMO');
    if (isDemoUser) {
      throw new Error('Demo accounts are not allowed to perform this action.');
    }

    const isAffiliateUser = await this.userService.isAffiliateUser(userId);
    if (isAffiliateUser) {
      throw new Error('Affiliate User are not allowed to perform this action.');
    }

    const user = await this.userService.getById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (!user.isSelfRegistered) {
      throw new Error('You are not eligible to become an affiliate.');
    }

    const existingAffiliate = await this.prisma.affiliate.findUnique({
      where: { userId },
    });

    if (existingAffiliate) {
      if (existingAffiliate.deletedAt) {
        throw new Error('Your previous affiliate request is deleted.');
      }

      if (existingAffiliate.requestStatus === RequestStatus.Approved) {
        throw new Error('You are already an approved affiliate.');
      }

      if (existingAffiliate.requestStatus === RequestStatus.Pending) {
        throw new Error('You have already submitted an affiliate request.');
      }

      if (existingAffiliate.requestStatus === RequestStatus.Rejected) {
        const updatedAffiliate = await this.prisma.affiliate.update({
          where: { userId },
          data: {
            reasonFrom: data.reasonFrom,
            reasonTo: null,
            requestStatus: RequestStatus.Pending,
            acceptingDate: null,
            createdAt: new Date(),
          },
        });

        return {
          message: 'Affiliate request resubmitted successfully.',
          data: updatedAffiliate,
        };
      }
    }

    const affiliate = await this.prisma.affiliate.create({
      data: {
        userId,
        reasonFrom: data.reasonFrom,
        status: AffiliateStatus.Inactive,
        requestStatus: RequestStatus.Pending,
      },
    });

    return {
      message: 'Affiliate request created successfully.',
      data: affiliate,
    };
  }

  async getAllAffiliates(options: GetAffiliateListDto) {
    let take: number | undefined;
    let skip: number | undefined;

    if (options.page && options.limit) {
      take = Number(options.limit);
      skip = (Number(options.page) - 1) * Number(options.limit);
    }

    const where: any = {};

    if (options.requestStatus) {
      where.requestStatus = options.requestStatus;
    }

    if (options.search) {
      const s = options.search;
      where.OR = [
        {
          users: {
            username: { contains: s, mode: 'insensitive' },
          },
        },
      ];
    }

    if (options.fromDate || options.toDate) {
      where.createdAt = {};

      if (options.fromDate) {
        where.createdAt.gt = new Date(options.fromDate);
      }

      if (options.toDate) {
        where.createdAt.lt = new Date(options.toDate);
      }
    }

    const total = await this.prisma.affiliate.count({
      where,
    });

    const totalRequest = await this.prisma.affiliate.count();

    const totalApproved = await this.prisma.affiliate.count({
      where: { requestStatus: RequestStatus.Approved },
    });

    const totalRejected = await this.prisma.affiliate.count({
      where: { requestStatus: RequestStatus.Rejected },
    });

    const totalPending = await this.prisma.affiliate.count({
      where: { requestStatus: RequestStatus.Pending },
    });

    const affiliatesRaw = await this.prisma.affiliate.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        users: {
          select: {
            username: true,
            mobile: true,
          },
        },
      },
    });

    const userIds = affiliatesRaw.map((a) => a.userId);

    const turnoverWhere: any = {
      userId: { in: userIds },
    };

    if (options.fromDate || options.toDate) {
      where.createdAt = {};

      if (options.fromDate) {
        where.createdAt.gt = new Date(options.fromDate);
      }

      if (options.toDate) {
        where.createdAt.lt = new Date(options.toDate);
      }
    }

    const turnoverGrouped = await this.prisma.turnoverHistory.groupBy({
      by: ['userId'],
      _sum: {
        turnoverMain: true,
        turnoverBonus: true,
      },
      where: turnoverWhere,
    });

    const turnoverMap = new Map(
      turnoverGrouped.map((t) => [
        t.userId,
        {
          mainTurnover: Number(t._sum.turnoverMain || 0),
          bonusTurnover: Number(t._sum.turnoverBonus || 0),
        },
      ]),
    );

    const affiliates = affiliatesRaw.map((a) => {
      const t = turnoverMap.get(a.userId) ?? {
        mainTurnover: 0,
        bonusTurnover: 0,
      };

      return {
        ...a,
        mainTurnover: t.mainTurnover,
        bonusTurnover: t.bonusTurnover,
      };
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
      message: 'Affiliate list fetched successfully.',
      pagination,
      totalRequest,
      totalApproved,
      totalRejected,
      totalPending,
      data: affiliates,
    };
  }

  async getAffiliateByUserId(userId: bigint) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { userId },
    });

    if (!affiliate) {
      return {
        status: 'Not Applied',
      };
    }

    if (affiliate.deletedAt) {
      throw new Error('Your affiliate account is deleted.');
    }

    if (affiliate.requestStatus === RequestStatus.Rejected) {
      return {
        status: 'Rejected',
        message: 'Your affiliate request was rejected.',
        reason: affiliate.reasonTo || 'No reason provided.',
      };
    }

    if (affiliate.requestStatus === RequestStatus.Pending) {
      return {
        status: 'Pending',
        message: 'Your affiliate request is still pending.',
        affiliate,
      };
    }

    if (affiliate.requestStatus === RequestStatus.Approved) {
      const totalActiveReferrals = await this.prisma.affiliateReferral.count({
        where: {
          affiliateId: affiliate.id,
          status: AffiliateStatus.Active,
        },
      });

      const totalInactiveReferrals = await this.prisma.affiliateReferral.count({
        where: {
          affiliateId: affiliate.id,
          status: AffiliateStatus.Inactive,
        },
      });

      const total = await this.prisma.turnoverHistory.aggregate({
        where: { userId: affiliate.userId },
        _sum: {
          turnoverMain: true,
          turnoverBonus: true,
        },
      });

      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const currentWeek = await this.prisma.turnoverHistory.aggregate({
        where: {
          userId: affiliate.userId,
          createdAt: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        _sum: {
          turnoverMain: true,
          turnoverBonus: true,
        },
      });

      const range = await this.getAllCommissionRanges();

      return {
        status: 'Approved',
        message: 'Affiliate fetched successfully.',
        affiliateStatus: affiliate.status,
        requestStatus: affiliate.requestStatus,
        referralCode: affiliate.affiliateCode,
        totalActiveReferrals,
        totalInactiveReferrals,
        totalReferrals: totalActiveReferrals + totalInactiveReferrals,
        lastCommission: affiliate.lastCommission ?? 0,
        totalCommission: affiliate.totalCommission ?? 0,
        range,
      };
    }

    return {
      status: 'Not Applied',
    };
  }

  async updateAffiliate(
    id: bigint,
    data: {
      requestStatus: RequestStatus;
      reasonTo?: string;
    },
  ) {
    const { requestStatus, reasonTo } = data;
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id },
    });

    if (!affiliate) {
      throw new Error(`Affiliate not found`);
    }

    if (affiliate.requestStatus !== RequestStatus.Pending) {
      throw new Error('Request already processed.');
    }

    if (
      requestStatus === RequestStatus.Rejected &&
      (!reasonTo || !reasonTo.trim())
    ) {
      throw new Error('Reason is required when rejecting an affiliate.');
    }

    let affiliateCode: string | undefined = undefined;
    let acceptingDate: Date | null = null;

    if (requestStatus === RequestStatus.Approved) {
      affiliateCode = await this.generateUniqueAffiliateCode();
      acceptingDate = new Date();
    }

    const updatedAffiliate = await this.prisma.affiliate.update({
      where: { id },
      data: {
        requestStatus,
        reasonTo: reasonTo?.trim() ?? null,
        acceptingDate,
        affiliateCode,
        status: AffiliateStatus.Active,
      },
    });

    return {
      message: `Affiliate status updated to ${requestStatus}`,
      data: updatedAffiliate,
    };
  }

  async deleteAffiliate(affiliateId: bigint) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      throw new Error('Affiliate not found.');
    }

    if (affiliate.deletedAt) {
      throw new Error('Affiliate is already deleted.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.affiliate.update({
        where: { id: affiliateId },
        data: { deletedAt: new Date() },
      });
    });

    return {
      success: true,
      message: 'Affiliate deleted successfully (soft delete)',
    };
  }

  async getReferralUsers(userId: bigint, options: GetReferralUsersDto) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 10;
    const skip = (page - 1) * limit;

    const affiliate = await this.prisma.affiliate.findFirst({
      where: {
        userId,
        requestStatus: RequestStatus.Approved,
        deletedAt: null,
      },
    });

    if (!affiliate) {
      return {
        status: 'Not Applied',
      };
    }

    const where: Prisma.AffiliateReferralWhereInput = {
      affiliateId: affiliate.id,
    };

    if (options.search) {
      const search = options.search.trim();
      where.referredUser = {
        OR: [{ username: { contains: search, mode: 'insensitive' } }],
      };
    }
    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gte = new Date(options.fromDate);
      if (options.toDate) where.createdAt.lte = new Date(options.toDate);
    }

    if (options.status) {
      where.status = options.status;
    }

    const total = await this.prisma.affiliateReferral.count({ where });

    const referrals = await this.prisma.affiliateReferral.findMany({
      where,
      select: {
        id: true,
        commissionEarned: true,
        status: true,
        createdAt: true,
        referredUserId: true,
        referredUser: {
          select: {
            username: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { id: 'desc' },
    });

    const userIds = referrals.map((r) => r.referredUserId);

    const weeklyCommissionMap = new Map<string, number>();

    if (userIds.length > 0) {
      const now = new Date();
      const lastWeekDate = subWeeks(now, 1);
      const weekStart = startOfWeek(lastWeekDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(lastWeekDate, { weekStartsOn: 1 });
      // const endDay = dayjs().subtract(1, 'day');
      // const weekStart = endDay.startOf('day').toDate(); // 12:00 AM (yesterday)
      // const weekEnd = endDay.endOf('day').toDate();

      // const weekEnd = dayjs().subtract(1, 'hour').toDate(); // current time
      // const weekStart = dayjs().subtract(2, 'hour').toDate();

      const weeklyRows = await this.prisma.turnoverHistory.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          createdAt: { gte: weekStart, lte: weekEnd },
        },
        _sum: {
          turnoverMain: true,
        },
      });

      for (const row of weeklyRows) {
        weeklyCommissionMap.set(
          row.userId.toString(),
          Number(row._sum.turnoverMain ?? 0),
        );
      }
    }

    const enrichedReferrals = referrals.map((r) => ({
      ...r,
      weeklyTurnover: weeklyCommissionMap.get(r.referredUserId.toString()) ?? 0,
    }));

    const totalPage = Math.ceil(
      total / (limit > 0 ? limit : total < 1 ? 1 : total),
    );
    const pagination: Pagination = {
      totalItems: total,
      limit: limit,
      currentPage: page,
      totalPage,
    };

    return {
      pagination,
      referrals: enrichedReferrals,
    };
  }

  async getWeeklyCommissionHistory(
    userId: bigint,
    options: GetWeeklyCommissionHistoryDto,
    isExport?: bigint,
  ) {
    let take: number | undefined;
    let skip: number | undefined;

    if (!isExport) {
      const page = Number(options.page);
      const limit = Number(options.limit);

      if (!isNaN(page) && !isNaN(limit) && page > 0 && limit > 0) {
        take = limit;
        skip = (page - 1) * limit;
      }
    }

    const where: any = {};

    if (options.fromDate || options.toDate) {
      where.AND = [];

      if (options.fromDate) {
        where.AND.push({
          weekEnd: {
            gte: new Date(options.fromDate), // week ends after fromDate
          },
        });
      }

      if (options.toDate) {
        where.AND.push({
          weekStart: {
            lte: new Date(options.toDate), // week starts before toDate
          },
        });
      }
    }

    if (userId) {
      const affiliate = await this.prisma.affiliate.findUnique({
        where: { userId, deletedAt: null },
      });

      if (!affiliate) {
        return {
          status: 'Not Applied',
        };
      }

      if (affiliate.requestStatus !== RequestStatus.Approved) {
        return { status: 'You are not an approved affiliate.' };
      }

      where.affiliateId = affiliate.id;
    }

    if (options.status) {
      where.status = options.status;
    }

    // if (options.search) {
    //   where.affiliate = {
    //     users: {
    //       username: { contains: options.search, mode: 'insensitive' },
    //     },
    //   };
    // }

    const total = await this.prisma.weeklyCommissionHistory.count(where);

    const weeklyData = await this.prisma.weeklyCommissionHistory.findMany({
      where,
      skip,
      take,
      orderBy: { id: 'desc' },
      include: {
        affiliate: {
          select: {
            id: true,
            users: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    const totalPage = isExport
      ? 1
      : Math.ceil(
          total /
            (options.limit && options.limit > 0
              ? options.limit
              : total < 1
                ? 1
                : total),
        );

    const pagination = {
      totalItems: total,
      limit: take ?? total,
      currentPage: isExport ? 1 : (options.page ?? 1),
      totalPage,
    };

    return {
      status: true,
      message: isExport
        ? 'Weekly commission export data fetched successfully.'
        : 'Weekly commission report fetched successfully.',
      data: weeklyData,
      pagination,
    };
  }

  async createCommissionRange(option: CreateCommissionRangeDto) {
    const { fromUser, toUser, percentage } = option;
    const newTo = toUser ?? Number.MAX_SAFE_INTEGER;

    if (!Number.isInteger(fromUser) || fromUser <= 0) {
      throw new Error('fromUser must be a positive integer');
    }

    if (toUser !== undefined && (!Number.isInteger(toUser) || toUser <= 0)) {
      throw new Error('toUser must be a positive integer if provided');
    }

    if (fromUser > newTo) {
      throw new Error(
        `Invalid range: fromUser (${fromUser}) cannot be greater than toUser (${newTo === Number.MAX_SAFE_INTEGER ? '∞' : newTo})`,
      );
    }

    if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      throw new Error('percentage must be a number between 0 and 100');
    }

    const overlap = await this.prisma.affiliateCommissionRange.findFirst({
      where: {
        AND: [{ fromUser: { lte: newTo } }, { toUser: { gte: fromUser } }],
      },
    });

    if (overlap) {
      throw new Error(
        `Range overlaps with existing range: ${overlap.fromUser} - ${overlap.toUser ?? '∞'}`,
      );
    }

    return await this.prisma.affiliateCommissionRange.create({
      data: {
        fromUser,
        toUser,
        percentage,
      },
    });
  }

  async getAllCommissionRanges() {
    return await this.prisma.affiliateCommissionRange.findMany({
      orderBy: { fromUser: 'asc' },
      select: {
        id: true,
        fromUser: true,
        toUser: true,
        percentage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getCommissionRangeHistory(options: { page?: number; limit?: number }) {
    let take: number | undefined;
    let skip: number | undefined;

    if (options.page && options.limit) {
      take = Number(options.limit);
      skip = (Number(options.page) - 1) * Number(options.limit);
    }

    const total = await this.prisma.affiliateCommissionRangeHistory.count();

    const history = await this.prisma.affiliateCommissionRangeHistory.findMany({
      orderBy: { changedAt: 'desc' },
      take,
      skip,
      select: {
        id: true,
        fromUserOld: true,
        fromUserNew: true,
        toUserOld: true,
        toUserNew: true,
        percentageOld: true,
        percentageNew: true,
        changedBy: true,
        changedAt: true,
      },
    });

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    const pagination = {
      totalItems: total,
      limit: take ?? total,
      currentPage: options.page ?? 1,
      totalPage,
    };

    return {
      data: history,
      pagination,
    };
  }

  async updateCommissionRange(
    id: bigint,
    userId: bigint,
    userType: UserType,
    dto: UpdateCommissionRangeDto,
  ) {
    const existing = await this.prisma.affiliateCommissionRange.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Commission range with ID ${id} not found.`);
    }

    let changedBy = 'SYSTEM';

    if (userType === UserType.Admin) {
      const adminRole = await this.adminService
        .getRoleByAdminId(userId)
        .catch(() => null);
      if (adminRole) changedBy = adminRole.name;
    } else {
      const userRole = await this.userService
        .getRoleByUserId(userId)
        .catch(() => null);
      if (userRole) changedBy = userRole.name;
    }

    const newFrom = dto.fromUser ?? existing.fromUser;
    const newTo = dto.toUser ?? existing.toUser ?? Number.MAX_SAFE_INTEGER;
    const newPercentage = dto.percentage ?? existing.percentage;

    if (!Number.isInteger(newFrom) || newFrom <= 0) {
      throw new Error('fromUser must be a positive integer');
    }

    if (
      dto.toUser !== undefined &&
      (!Number.isInteger(dto.toUser) || dto.toUser <= 0)
    ) {
      throw new Error('toUser must be a positive integer if provided');
    }

    if (newFrom > newTo) {
      throw new Error(
        `Invalid range: fromUser (${newFrom}) cannot be greater than toUser (${newTo === Number.MAX_SAFE_INTEGER ? '∞' : newTo})`,
      );
    }

    if (
      typeof newPercentage !== 'number' ||
      newPercentage < 0 ||
      newPercentage > 100
    ) {
      throw new Error('percentage must be a number between 0 and 100');
    }

    const overlap = await this.prisma.affiliateCommissionRange.findFirst({
      where: {
        id: { not: id },
        AND: [{ fromUser: { lte: newTo } }, { toUser: { gte: newFrom } }],
      },
    });

    if (overlap) {
      throw new Error(
        `Updated range overlaps with existing range: ${overlap.fromUser} - ${overlap.toUser ?? '∞'}`,
      );
    }

    const updated = await this.prisma.affiliateCommissionRange.update({
      where: { id },
      data: {
        fromUser: newFrom,
        toUser: dto.toUser ?? existing.toUser,
        percentage: newPercentage,
      },
    });

    await this.prisma.affiliateCommissionRangeHistory.create({
      data: {
        slabId: id,
        fromUserOld: existing.fromUser,
        fromUserNew: updated.fromUser,
        toUserOld: existing.toUser,
        toUserNew: updated.toUser,
        percentageOld: existing.percentage,
        percentageNew: updated.percentage,
        changedBy: changedBy,
      },
    });

    return updated;
  }

  async deleteCommissionRange(id: bigint) {
    const slab = await this.prisma.affiliateCommissionRange.findUnique({
      where: { id },
    });

    if (!slab) {
      throw new Error(`Commission range with ID ${id} not found.`);
    }

    try {
      const historyDelete =
        await this.prisma.affiliateCommissionRangeHistory.deleteMany({
          where: { slabId: id },
        });

      await this.prisma.affiliateCommissionRange.delete({
        where: { id },
      });

      return {
        message: 'Commission range and its history deleted successfully.',
        deletedHistoryCount: historyDelete.count,
      };
    } catch (error) {
      this.logger.error('Delete failed:', error);
      throw new Error(
        'Failed to delete commission range. Please try again later.',
      );
    }
  }

  async getAffiliateList(options: GetReferralUsersDto, isExport?: boolean) {
    let take: number | undefined;
    let skip: number | undefined;
    let page = options.page ?? 1;

    if (!isExport) {
      if (
        options.page &&
        options.limit &&
        !isNaN(options.limit) &&
        !isNaN(options.page)
      ) {
        page = options.page < 1 ? 1 : options.page;
        take = options.limit;
        skip = (page - 1) * options.limit;
      }
    }

    const where: any = {
      deletedAt: null,
      requestStatus: RequestStatus.Approved,
    };

    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gte = new Date(options.fromDate);
      if (options.toDate) where.createdAt.lte = new Date(options.toDate);
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.search) {
      const s = options.search.trim();
      const searchId = !isNaN(Number(s)) ? Number(s) : undefined;

      where.OR = [
        ...(searchId ? [{ id: searchId }] : []),
        {
          users: {
            username: { contains: s, mode: 'insensitive' },
          },
        },
      ];
    }

    const affiliates = await this.prisma.affiliate.findMany({
      where: where,
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      select: {
        id: true,
        affiliateCode: true,
        status: true,
        acceptingDate: true,
        createdAt: true,
        users: {
          select: { username: true, mobile: true },
        },
      },
    });

    const totalItems = affiliates.length;
    const totalPage = Math.ceil(totalItems / (take ?? totalItems));

    let paginatedData = affiliates;

    if (!isExport) {
      const startIndex = skip ?? 0;
      const endIndex = startIndex + (take ?? totalItems);
      paginatedData = affiliates.slice(startIndex, endIndex);
    }

    const pagination = isExport
      ? null
      : {
          totalItems,
          limit: take ?? totalItems,
          currentPage: page,
          totalPage,
        };

    return {
      message: 'Affiliate list fetched successfully',
      pagination,
      data: paginatedData,
    };
  }

  // async generateUniqueAffiliateCode(): Promise<string> {
  //   let code: string;
  //   let exists = true;

  //   do {
  //     // Example: 8-character alphanumeric code
  //     code = crypto.randomBytes(4).toString('hex').toUpperCase();

  //     // Check if code already exists
  //     const user = await this.prisma.affiliate.findFirst({
  //       where: { affiliateCode: code },
  //     });
  //     exists = !!user;
  //   } while (exists);

  //   return code;
  // }
  async generateUniqueAffiliateCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let exists = true;

    do {
      code = Array.from({ length: 9 })
        .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
        .join('');

      const user = await this.prisma.affiliate.findFirst({
        where: { affiliateCode: code },
      });

      exists = !!user;
    } while (exists);

    return code;
  }

  async getDashboardData() {
    const now = new Date();

    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const totalAffiliates = await this.prisma.affiliate.count({
      where: {
        requestStatus: RequestStatus.Approved,
        deletedAt: null,
      },
    });

    const activeAffiliates = await this.prisma.affiliate.count({
      where: {
        requestStatus: RequestStatus.Approved,
        status: AffiliateStatus.Active,
        deletedAt: null,
      },
    });

    const weeklyCommissions =
      await this.prisma.weeklyCommissionHistory.aggregate({
        _sum: { commissionAmount: true },
        where: {
          weekStart: { gte: weekStart },
          weekEnd: { lte: weekEnd },
          status: CommissionStatus.Paid,
        },
      });

    const monthlyCommissions =
      await this.prisma.weeklyCommissionHistory.aggregate({
        _sum: { commissionAmount: true },
        where: {
          weekStart: { gte: monthStart },
          weekEnd: { lte: monthEnd },
          status: CommissionStatus.Paid,
        },
      });

    const topAffiliates = await this.prisma.affiliate.findMany({
      where: {
        requestStatus: RequestStatus.Approved,
        deletedAt: null,
      },
      orderBy: {
        totalCommission: 'desc',
      },
      take: 5,
      select: {
        id: true,
        totalCommission: true,
        users: {
          select: {
            username: true,
          },
        },
      },
    });

    const result = topAffiliates.map((a) => ({
      affiliateId: a.id,
      username: a.users?.username ?? null,
      totalCommission: Number(a.totalCommission) || 0,
    }));

    return {
      message: 'Affiliate dashboard fetched successfully.',
      totalAffiliates,
      activeAffiliates,
      weeklyCommissions: weeklyCommissions._sum.commissionAmount || 0,
      monthlyCommissions: monthlyCommissions._sum.commissionAmount || 0,
      topAffiliates: result,
    };
  }

  async getReferralUsersListing(
    affiliate_id: bigint,
    options: GetReferralUsersDto,
  ) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 10;
    const skip = (page - 1) * limit;

    const affiliate = await this.prisma.affiliate.findFirst({
      where: {
        id: affiliate_id,
        requestStatus: RequestStatus.Approved,
        deletedAt: null,
      },
      include: {
        users: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!affiliate) return { status: 'Not Applied' };

    const where: Prisma.AffiliateReferralWhereInput = {
      affiliateId: affiliate.id,
    };

    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gte = new Date(options.fromDate);
      if (options.toDate) where.createdAt.lte = new Date(options.toDate);
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.search) {
      const search = options.search.trim();
      const searchId = !isNaN(Number(search))
        ? BigInt(Number(search))
        : undefined;

      where.referredUser = {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          ...(searchId ? [{ id: searchId }] : []),
        ],
      };
    }

    const referrals = await this.prisma.affiliateReferral.findMany({
      where,
      select: {
        id: true,
        status: true,
        commissionEarned: true,
        activeAt: true,
        referredUser: { select: { id: true, username: true } },
      },
      skip,
      take: limit,
      orderBy: [{ status: 'asc' }],
    });

    const totalItems = await this.prisma.affiliateReferral.count({
      where: where,
    });

    const userIds = referrals.map((r) => r.referredUser.id);

    // const endDay = dayjs().subtract(1, 'day');
    // const weekStart = endDay.startOf('day').toDate(); // 12:00 AM (yesterday)
    // const weekEnd = endDay.endOf('day').toDate();
    // const weekEnd = dayjs().subtract(1, 'hour').toDate(); // current time
    // const weekStart = dayjs().subtract(2, 'hour').toDate(); // last 3 hours from now

    // we we user a moday to sunday do display the dat
    const now = new Date();
    // // go back 1 week first
    const lastWeekDate = subWeeks(now, 1);
    // // then calculate week range
    const weekStart = startOfWeek(lastWeekDate, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(lastWeekDate, { weekStartsOn: 1 }); // Sunday

    const weeklyRows = await this.prisma.turnoverHistory.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      _sum: { turnoverMain: true, turnoverBonus: true },
    });

    const weeklyMap = new Map();
    weeklyRows.forEach((r) => {
      weeklyMap.set(r.userId, {
        main: Number(r._sum.turnoverMain || 0),
        bonus: Number(r._sum.turnoverBonus || 0),
      });
    });

    const totalRows = await this.prisma.turnoverHistory.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        createdAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      _sum: { turnoverMain: true, turnoverBonus: true },
    });

    const totalMap = new Map();
    totalRows.forEach((r) => {
      totalMap.set(r.userId, {
        main: Number(r._sum.turnoverMain || 0),
        bonus: Number(r._sum.turnoverBonus || 0),
      });
    });

    const formatted = referrals.map((r) => {
      const uid = r.referredUser.id;
      return {
        ...r,
        weeklyMainTurnover: weeklyMap.get(uid)?.main || 0,
        weeklyBonusTurnover: weeklyMap.get(uid)?.bonus || 0,
        totalMainTurnover: totalMap.get(uid)?.main || 0,
        totalBonusTurnover: totalMap.get(uid)?.bonus || 0,
      };
    });

    const totalTurnoverAgg = await this.prisma.turnoverHistory.aggregate({
      where: {
        userId: { in: userIds },
        createdAt: {
          // gte: weekStart,
          // lte: weekEnd,
        },
      },
      _sum: {
        turnoverMain: true,
        turnoverBonus: true,
      },
    });

    const totalWeeklyMainTurnover = Number(
      totalTurnoverAgg._sum.turnoverMain || 0,
    );

    // const totalWeeklyBonusTurnover = Number(
    //   totalWeeklyTurnoverAgg._sum.turnoverBonus || 0,
    // );

    const totalActive = await this.prisma.affiliateReferral.count({
      where: { affiliateId: affiliate.id, status: AffiliateStatus.Active },
    });

    const totalInactive = await this.prisma.affiliateReferral.count({
      where: { affiliateId: affiliate.id, status: AffiliateStatus.Inactive },
    });

    // const turnoverTotals = await this.prisma.turnoverHistory.aggregate({
    //   where: { userId: affiliate.userId },
    //   _sum: {
    //     turnoverMain: true,
    //     turnoverBonus: true,
    //   },
    // });

    // const totalMainTurnover = Number(turnoverTotals._sum.turnoverMain || 0);
    // const totalBonusTurnover = Number(turnoverTotals._sum.turnoverBonus || 0);

    const pagination = {
      totalItems,
      limit,
      currentPage: page,
      totalPage: Math.ceil(totalItems / limit),
    };

    return {
      pagination,
      totals: {
        activeUsers: totalActive,
        inactiveUsers: totalInactive,
        affiliateMainTurnover: totalWeeklyMainTurnover,
        affiliateBonusTurnover: 0,
      },
      referrals: formatted,
      affiliate,
    };
  }

  async getWeeklyCommissionReportForAdmin(
    options: GetWeeklyCommissionHistoryDto,
    isExport?: boolean,
  ) {
    let take: number | undefined;
    let skip: number | undefined;

    if (!isExport) {
      const page = Number(options.page);
      const limit = Number(options.limit);

      if (!isNaN(page) && !isNaN(limit) && page > 0 && limit > 0) {
        take = limit;
        skip = (page - 1) * limit;
      }
    }

    const where: any = {};

    // if (options.fromDate || options.toDate) {
    //   where.createdAt = {};

    //   if (options.fromDate) {
    //     where.createdAt.gte = new Date(options.fromDate);
    //   }

    //   if (options.toDate) {
    //     where.createdAt.lte = new Date(options.toDate);
    //   }
    // }

    if (options.fromDate && options.toDate) {
      where.AND = [
        ...(where.AND ?? []),
        {
          weekStart: {
            lte: new Date(options.toDate),
          },
          weekEnd: {
            gte: new Date(options.fromDate),
          },
        },
      ];
    }

    // const totals = await this.prisma.weeklyCommissionHistory.aggregate({
    //   _sum: {
    //     totalLoss: true,
    //     deductionAmount: true,
    //     commissionAmount: true,
    //   },
    //   where,
    // });

    const totals = await this.prisma.weeklyCommissionHistory.aggregate({
      _sum: {
        totalLoss: true,
        deductionAmount: true,
        commissionAmount: true,
      },
      where: {
        ...where,
        AND: [{ totalLoss: { gt: 0 } }, { activeUsers: { gt: 0 } }],
      },
    });

    let weeklyCommissionAmount = totals._sum.commissionAmount ?? 0;

    if (options.status) {
      where.status = options.status;
    }

    if (options.search) {
      where.affiliate = {
        users: {
          username: { contains: options.search, mode: 'insensitive' },
        },
      };
    }

    const total = await this.prisma.weeklyCommissionHistory.count({
      where: {
        ...where,
        AND: [{ totalLoss: { gt: 0 } }, { activeUsers: { gt: 0 } }],
      },
    });

    const weeklyDataRaw = await this.prisma.weeklyCommissionHistory.findMany({
      where: {
        ...where,
        AND: [{ totalLoss: { gt: 0 } }, { activeUsers: { gt: 0 } }],
      },
      skip,
      take,
      orderBy: { id: 'desc' },
      include: {
        affiliate: {
          select: {
            id: true,
            users: { select: { username: true } },
          },
        },
      },
    });

    // 1. Find the latest week
    // const latestWeek = await this.prisma.weeklyCommissionHistory.findFirst({
    //   select: { weekStart: true, weekEnd: true },
    //   orderBy: { weekStart: 'desc' },
    // });

    // if (latestWeek) {
    //   const weeklyAgg = await this.prisma.weeklyCommissionHistory.aggregate({
    //     _sum: {
    //       commissionAmount: true,
    //     },
    //     where: {
    //       weekStart: latestWeek.weekStart,
    //       weekEnd: latestWeek.weekEnd,
    //     },
    //   });
    //   weeklyCommissionAmount = Number(weeklyAgg?._sum?.commissionAmount ?? 0);
    // }

    const totalCommission = await this.prisma.weeklyCommissionHistory.aggregate(
      {
        _sum: {
          commissionAmount: true,
        },
      },
    );

    const totalPage = isExport
      ? 1
      : Math.ceil(
          total /
            (options.limit && options.limit > 0
              ? options.limit
              : total < 1
                ? 1
                : total),
        );

    const pagination = {
      totalItems: total,
      limit: take ?? total,
      currentPage: isExport ? 1 : (options.page ?? 1),
      totalPage,
    };

    return {
      status: true,
      message: isExport
        ? 'Weekly commission export data fetched successfully.'
        : 'Weekly commission report fetched successfully.',
      pagination,
      totals: {
        totalLoss: totals._sum.totalLoss ?? 0,
        totalDeduction: totals._sum.deductionAmount ?? 0,
        totalCommission: totalCommission._sum.commissionAmount ?? 0,
        weeklyCommissionAmount,
      },
      weeklyDataRaw,
    };
  }

  async getActiveUser(
    weeklyCommissionHistoryId: bigint,
    options: ActiveUserDto,
  ) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 10;
    const search = options.search?.trim();

    const skip = (page - 1) * limit;

    const where: Prisma.AffiliateWeeklyActiveUserWhereInput = {
      weeklyCommissionHistoryId,
      ...(search && {
        referredUser: {
          username: {
            contains: search,
            mode: 'insensitive',
          },
        },
      }),
    };

    const total = await this.prisma.affiliateWeeklyActiveUser.count({ where });

    const turnoverAggregate =
      await this.prisma.affiliateWeeklyActiveUser.aggregate({
        where,
        _sum: {
          turnover: true,
        },
      });

    const totalActiveUserTurnover = Number(
      turnoverAggregate._sum.turnover ?? 0,
    );

    const activeUsers = await this.prisma.affiliateWeeklyActiveUser.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: 'desc' },
      include: {
        referredUser: {
          select: {
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });
    const affiliate = await this.prisma.affiliateWeeklyActiveUser.findFirst({
      where: {
        weeklyCommissionHistoryId: BigInt(weeklyCommissionHistoryId),
      },
      select: {
        affiliate: {
          select: {
            users: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    const user = activeUsers.map((user) => ({
      id: user.id,
      affiliateId: user.affiliateId,
      weeklyCommissionHistoryId: user.weeklyCommissionHistoryId,
      referredUserId: user.referredUserId,
      turnover: user.turnover,
      createdAt: user.createdAt,
      username: user.referredUser?.username ?? null,
      firstname: user.referredUser?.firstname ?? null,
      lastname: user.referredUser?.lastname ?? null,
    }));

    const totalPage = Math.ceil(total / limit);

    const pagination: Pagination = {
      totalItems: total,
      limit,
      currentPage: page,
      totalPage,
    };

    return {
      status: true,
      message: 'Weekly commission active users fetched successfully.',
      pagination,
      totalActiveUserTurnover,
      affiliate: affiliate?.affiliate.users.username,
      user,
    };
  }

  async exportAffiliateList(userId: bigint, query: GetReferralUsersDto) {
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.affiliateList, // ensure enum exists
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        adminId: userId,

        filters: {
          search: query.search,
          status: query.status,
        },
      },
    });

    return {
      message:
        'Your Affiliate list users report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportAffiliateCommistion(
    userId: bigint,
    query: GetWeeklyCommissionHistoryDto,
  ) {
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.affiliateCommission,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        adminId: userId,

        filters: {
          search: query.search,
          status: query.status,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message:
        'Your Affiliate list users report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }
}
