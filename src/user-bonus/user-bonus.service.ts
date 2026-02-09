// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma';
// import { $Enums, BonusCategory } from '@prisma/client';
// import { ReferredUsersQueryDto } from './dto/referred-users-query.dto';
// import { Decimal } from '@prisma/client/runtime/library';
// import {
//   DateFilterRequest,
//   DateFilterWithPaginationRequest,
//   Pagination,
// } from '@Common';
// import { BonusStatementDTO } from './dto/bonus-statement-query.dto';

// export class BonusSummaryDto {
//   totalJoiningBonus: string;
//   totalReferralBonus: string;
//   totalReferralLossCommissionBonus: string;
//   totalLossBackBonus: string;
//   totalRefillBonus: string;
// }

// function getMonthRange(date: Date) {
//   const start = new Date(date.getFullYear(), date.getMonth(), 1);
//   const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
//   return { start, end };
// }

// export class BonusStatementItemDto {
//   serialNo: number;
//   bonusType: string;
//   awardDate: Date;
//   originalBalance: string;
//   reason: string;
//   withdrawalRule: string;

//   turnoverRequired: string | 'N/A';
//   turnoverCompleted: string | 'N/A';
//   turnoverRemaining: string | 'N/A';

//   status: 'Locked' | 'Withdrawable';
// }

// interface BonusApplicantMeta {
//   reason?: string;
//   source?: string;
// }

// function parseBonusApplicantMeta(meta: unknown): BonusApplicantMeta {
//   if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
//     return {};
//   }

//   const result: BonusApplicantMeta = {};

//   if (
//     'reason' in meta &&
//     typeof (meta as Record<string, unknown>).reason === 'string'
//   ) {
//     result.reason = (meta as Record<string, unknown>).reason as string;
//   }

//   if (
//     'source' in meta &&
//     typeof (meta as Record<string, unknown>).source === 'string'
//   ) {
//     result.source = (meta as Record<string, unknown>).source as string;
//   }

//   return result;
// }

// @Injectable()
// export class UserBonusService {
//   constructor(private readonly prisma: PrismaService) {}

//   async getUserBonusSummary(
//     userId: bigint,
//     query: DateFilterRequest,
//   ): Promise<BonusSummaryDto> {
//     const { fromDate, toDate } = query;
//     const grouped = await this.prisma.bonusApplicant.groupBy({
//       by: ['bonusId'],
//       where: {
//         userId,
//         awardedAt: {
//           gte: fromDate,
//           lte: toDate,
//         },
//         // status: 'Approved',
//       },
//       _sum: {
//         originalBonus: true,
//       },
//     });

//     if (!grouped.length) {
//       return {
//         totalJoiningBonus: '0.00',
//         totalReferralBonus: '0.00',
//         totalReferralLossCommissionBonus: '0.00',
//         totalLossBackBonus: '0.00',
//         totalRefillBonus: '0.00',
//       };
//     }

//     const bonusIds = grouped.map((g) => g.bonusId);

//     const bonuses = await this.prisma.bonus.findMany({
//       where: { id: { in: bonusIds } },
//       select: { id: true, category: true },
//     });

//     const bonusCategoryMap = new Map<number, $Enums.BonusCategory>(
//       bonuses.map((b) => [b.id, b.category]),
//     );

//     const totals: Record<$Enums.BonusCategory, number> = {
//       JoiningBonus: 0,
//       ReferralBonus: 0,
//       ReferralLossCommissionBonus: 0,
//       LossBackBonus: 0,
//       DepositBonus: 0,
//     };

//     for (const row of grouped) {
//       const category = bonusCategoryMap.get(row.bonusId);
//       const amount = Number(row._sum.originalBonus ?? 0);

//       if (category) {
//         totals[category] += amount;
//       }
//     }

//     return {
//       totalJoiningBonus: totals.JoiningBonus.toFixed(2),
//       totalReferralBonus: totals.ReferralBonus.toFixed(2),
//       totalReferralLossCommissionBonus:
//         totals.ReferralLossCommissionBonus.toFixed(2),
//       totalLossBackBonus: totals.LossBackBonus.toFixed(2),
//       totalRefillBonus: totals.DepositBonus.toFixed(2),
//     };
//   }

//   async getUserBonusTurnover(
//     userId: bigint,
//     status: 'ACTIVE' | 'COMPLETED',
//     page = 1,
//     limit = 10,
//   ) {
//     page = page && page > 0 ? page : 1;
//     limit = limit ?? 10;
//     const skip = (page - 1) * limit;

//     const bonusApplicants = await this.prisma.bonusApplicant.findMany({
//       where: { userId },
//       include: { bonus: true },
//       orderBy: { createdAt: 'desc' },
//     });

//     const enriched = bonusApplicants.map((ba) => {
//       const turnoverRequired = Number(ba.turnoverRequired);
//       const turnoverCompleted = Number(ba.turnoverCompleted);

//       const isInstant =
//         ba.bonus.releaseCondition === 'INSTANT_WITHDRAWAL' ||
//         turnoverRequired === 0;

//       const completed = isInstant || turnoverCompleted >= turnoverRequired;

//       return {
//         ba,
//         completed,
//         turnoverRequired,
//         turnoverCompleted,
//       };
//     });

//     // ✅ Filter by status
//     const filtered =
//       status === 'ACTIVE'
//         ? enriched.filter((item) => !item.completed)
//         : enriched.filter((item) => item.completed);

//     const total = filtered.length;

//     // ✅ Pagination AFTER filtering
//     const paginated = filtered.slice(skip, skip + limit);

//     const data = paginated.map(
//       ({ ba, completed, turnoverRequired, turnoverCompleted }) => {
//         const remaining = Math.max(turnoverRequired - turnoverCompleted, 0);

//         const percentage =
//           turnoverRequired > 0
//             ? Math.min(
//                 Math.round((turnoverCompleted / turnoverRequired) * 100),
//                 100,
//               )
//             : 100;

//         return {
//           bonusId: ba.bonusId,
//           category: ba.bonus.category,
//           name: ba.bonus.name ?? ba.bonus.category,

//           status: completed ? 'COMPLETED' : 'ACTIVE',

//           releaseCondition: ba.bonus.releaseCondition,
//           isInstantWithdrawable:
//             completed && ba.bonus.releaseCondition === 'INSTANT_WITHDRAWAL',

//           depositAmount: ba.depositAmount?.toFixed(2) ?? '0.00',
//           bonusAmount: ba.awardedAmount.toFixed(2),
//           originalBonus: ba.originalBonus.toFixed(2),
//           turnoverRequired: turnoverRequired.toFixed(2),
//           turnoverCompleted: turnoverCompleted.toFixed(2),
//           turnoverRemaining: remaining.toFixed(2),
//           turnoverPercentage: percentage,

//           withdrawableAmount: completed ? ba.awardedAmount.toFixed(2) : '0.00',
//         };
//       },
//     );

//     const pagination: Pagination = {
//       currentPage: page,
//       limit,
//       totalItems: total,
//       totalPage: Math.ceil(total / limit),
//     };

//     return {
//       pagination,
//       data,
//     };
//   }

//   async getUserBonusEarnings(userId: bigint) {
//     const now = new Date();

//     const { start: thisMonthStart, end: thisMonthEnd } = getMonthRange(now);

//     const { start: prevMonthStart, end: prevMonthEnd } = getMonthRange(
//       new Date(now.getFullYear(), now.getMonth() - 1, 1),
//     );

//     // Lifetime earnings
//     const lifetimeAgg = await this.prisma.bonusApplicant.aggregate({
//       where: {
//         userId,
//         // status: 'Approved',
//       },
//       _sum: {
//         originalBonus: true,
//       },
//     });

//     // This month earnings
//     const thisMonthAgg = await this.prisma.bonusApplicant.aggregate({
//       where: {
//         userId,
//         // status: 'Approved',
//         awardedAt: {
//           gte: thisMonthStart,
//           lt: thisMonthEnd,
//         },
//       },
//       _sum: {
//         originalBonus: true,
//       },
//     });

//     // Previous month earnings
//     const prevMonthAgg = await this.prisma.bonusApplicant.aggregate({
//       where: {
//         userId,
//         // status: 'Approved',
//         awardedAt: {
//           gte: prevMonthStart,
//           lt: prevMonthEnd,
//         },
//       },
//       _sum: {
//         originalBonus: true,
//       },
//     });

//     const lifetime = Number(lifetimeAgg._sum.originalBonus ?? 0);
//     const thisMonth = Number(thisMonthAgg._sum.originalBonus ?? 0);
//     const previousMonth = Number(prevMonthAgg._sum.originalBonus ?? 0);

//     return {
//       lifetime: lifetime.toFixed(2),
//       thisMonth: thisMonth.toFixed(2),
//       previousMonth: previousMonth.toFixed(2),
//     };
//   }

//   async getBonusStatement(userId: bigint, query: BonusStatementDTO) {
//     const { toDate, fromDate, status, type } = query;

//     const page = query.page && query.page > 0 ? query.page : 1;
//     const limit = query.limit ?? 10;
//     const skip = (page - 1) * limit;

//     const [total, rows] = await this.prisma.$transaction([
//       this.prisma.bonusApplicant.count({
//         where: {
//           userId,
//           awardedAt: {
//             gte: fromDate,
//             lte: toDate,
//           },
//           ...(status && { status }),
//           ...(type && { bonus: { category: type } }),
//         },
//       }),
//       this.prisma.bonusApplicant.findMany({
//         where: {
//           userId,
//           awardedAt: {
//             gte: fromDate,
//             lte: toDate,
//           },
//           ...(status && { status }),
//           ...(type && { bonus: { category: type } }),
//         },
//         include: { bonus: true },
//         orderBy: { awardedAt: 'desc' },
//         skip,
//         take: limit,
//       }),
//     ]);

//     const data = rows.map((ba, index) => {
//       const turnoverRequired = Number(ba.turnoverRequired);
//       const turnoverCompleted = Number(ba.turnoverCompleted);

//       const isInstant =
//         ba.bonus.releaseCondition === 'INSTANT_WITHDRAWAL' ||
//         turnoverRequired === 0;

//       const withdrawable = isInstant || turnoverCompleted >= turnoverRequired;

//       const remaining = Math.max(turnoverRequired - turnoverCompleted, 0);

//       const meta = parseBonusApplicantMeta(ba.meta);

//       return {
//         serialNo: skip + index + 1,
//         bonusType: ba.bonus.category,
//         bonusName: ba.bonus.name,
//         awardDate: ba.awardedAt,
//         originalBalance: ba.awardedAmount.toFixed(2),
//         originalBonus: ba.originalBonus.toFixed(2),
//         reason: meta.reason ?? ba.bonus.description ?? 'Bonus credited',

//         withdrawalRule: isInstant ? 'Direct Withdrawal' : 'Turnover Required',

//         turnoverRequired: isInstant ? 0.0 : turnoverRequired.toFixed(2),

//         turnoverCompleted: isInstant ? 0.0 : turnoverCompleted.toFixed(2),

//         turnoverRemaining: isInstant ? 0.0 : remaining.toFixed(2),

//         status: withdrawable ? 'Withdrawable' : 'Locked',
//       };
//     });

//     const pagination: Pagination = {
//       currentPage: page,
//       limit,
//       totalItems: total,
//       totalPage: Math.ceil(total / limit),
//     };

//     return {
//       data,
//       pagination,
//     };
//   }

//   // Rererral----------------

//   async getReferralEarnings(userId: bigint) {
//     const now = new Date();

//     const monthStart = new Date(
//       now.getFullYear(),
//       now.getMonth(),
//       1,
//       0,
//       0,
//       0,
//       0,
//     );

//     const nextMonthStart = new Date(
//       now.getFullYear(),
//       now.getMonth() + 1,
//       1,
//       0,
//       0,
//       0,
//       0,
//     );

//     /**
//      * 1 Total referral users
//      */
//     const totalReferralUsers = await this.prisma.referral.count({
//       where: { referrerId: userId },
//     });

//     /**
//      * 2 Referral bonus earnings (BonusApplicant)
//      */
//     const referralBonusLifetime = await this.prisma.bonusApplicant.aggregate({
//       where: {
//         userId,
//         bonus: {
//           category: BonusCategory.ReferralBonus,
//         },
//       },
//       _sum: { originalBonus: true },
//     });

//     const referralBonusThisMonth = await this.prisma.bonusApplicant.aggregate({
//       where: {
//         userId,
//         bonus: {
//           category: BonusCategory.ReferralBonus,
//         },
//         awardedAt: {
//           gte: monthStart,
//           lt: nextMonthStart,
//         },
//       },
//       _sum: { originalBonus: true },
//     });

//     /**
//      * 3 Referral loss commission earnings
//      */
//     const referralLossLifetime =
//       await this.prisma.referralLossCommission.aggregate({
//         where: { referrerId: userId },
//         _sum: { commission: true },
//       });

//     const referralLossThisMonth =
//       await this.prisma.referralLossCommission.aggregate({
//         where: {
//           referrerId: userId,
//           creditedAt: {
//             gte: monthStart,
//             lt: nextMonthStart,
//           },
//         },
//         _sum: { commission: true },
//       });

//     /**
//      * 4 Final totals
//      */
//     const lifetime =
//       Number(referralBonusLifetime._sum.originalBonus ?? 0) +
//       Number(referralLossLifetime._sum.commission ?? 0);

//     const thisMonth =
//       Number(referralBonusThisMonth._sum.originalBonus ?? 0) +
//       Number(referralLossThisMonth._sum.commission ?? 0);

//     return {
//       totalReferralUsers,
//       lifetimeEarnings: lifetime.toFixed(2),
//       thisMonthEarnings: thisMonth.toFixed(2),
//     };
//   }

//   async getReferredUsers(userId: bigint, query: ReferredUsersQueryDto) {
//     const { fromDate, toDate, status, search } = query;

//     const page = query.page && query.page > 0 ? query.page : 1;
//     const limit = query.limit ?? 10;
//     const skip = (page - 1) * limit;
//     // --- Fetch referrals with referee user info ---
//     const referrals = await this.prisma.referral.findMany({
//       where: {
//         referrerId: userId,

//         referee: {
//           ...(status && { status }),

//           ...(fromDate || toDate
//             ? {
//                 createdAt: {
//                   ...(fromDate && { gte: fromDate }),
//                   ...(toDate && { lte: toDate }),
//                 },
//               }
//             : {}),

//           ...(search
//             ? {
//                 OR: [
//                   { username: { contains: search, mode: 'insensitive' } },
//                   ...(Number.isInteger(Number(search))
//                     ? [{ id: BigInt(search) }]
//                     : []),
//                 ],
//               }
//             : {}),
//         },
//       },

//       include: { referee: true },
//       skip,
//       take: limit,
//       orderBy: { refereeId: 'asc' },
//     });

//     console.log('referrals : ', referrals);

//     const refereeIds = referrals.map((r) => r.refereeId);

//     // --- Aggregate loss commission per referee ---
//     const rlcAggs = await this.prisma.referralLossCommissionDetail.groupBy({
//       by: ['refereeId'],
//       where: { referrerId: userId, refereeId: { in: refereeIds } },
//       _sum: { commission: true },
//     });
//     const rlcMap = new Map<number, Decimal>();
//     rlcAggs.forEach((r) =>
//       rlcMap.set(Number(r.refereeId), r._sum.commission ?? new Decimal(0)),
//     );

//     // --- Get first deposit per referee from BonusApplicant ---
//     const firstDeposits = await this.prisma.bonusApplicant.findMany({
//       where: { userId: { in: refereeIds } },
//       orderBy: { awardedAt: 'asc' },
//       select: { userId: true, depositAmount: true },
//     });

//     const depositMap = new Map<number, number>();
//     firstDeposits.forEach((d) => {
//       if (!depositMap.has(Number(d.userId))) {
//         depositMap.set(Number(d.userId), Number(d.depositAmount || 0));
//       }
//     });

//     // --- Map response ---
//     const data = referrals.map((r, index) => ({
//       serialNo: skip + index + 1,
//       refereeId: r.refereeId,
//       userName: r.referee.username,
//       joinDate: r.referee.createdAt,
//       firstDeposit: depositMap.get(Number(r.refereeId)) || 0,
//       bonusEarnings: (r.referrerBonus || new Decimal(0)).toFixed(2),
//       lossCommission: (
//         rlcMap.get(Number(r.refereeId)) || new Decimal(0)
//       ).toFixed(2),
//       status: r.referee.status,
//     }));

//     // --- Total count for pagination ---
//     const totalCount = await this.prisma.referral.count({
//       where: {
//         referrerId: userId,
//         referee: {
//           status: status || undefined,
//           createdAt: {
//             gte: fromDate,
//             lte: toDate,
//           },
//           OR: search
//             ? [
//                 { username: { contains: search, mode: 'insensitive' } },
//                 { id: { equals: BigInt(search) } },
//               ]
//             : undefined,
//         },
//       },
//     });

//     const pagination: Pagination = {
//       currentPage: page,
//       limit,
//       totalItems: totalCount,
//       totalPage: Math.ceil(totalCount / limit),
//     };

//     return {
//       data,
//       pagination,
//     };
//   }

//   async getReferralTotals(userId: bigint) {
//     // --- Aggregate Referral Deposit Bonus ---
//     const depositBonusAgg = await this.prisma.referral.aggregate({
//       _sum: { referrerBonus: true },
//       where: { referrerId: userId },
//     });

//     const referralDepositBonus = new Decimal(
//       depositBonusAgg._sum.referrerBonus || 0,
//     );

//     // --- Aggregate Referral Loss Commission ---
//     const lossCommissionAgg =
//       await this.prisma.referralLossCommissionDetail.aggregate({
//         _sum: { commission: true },
//         where: { referrerId: userId },
//       });

//     const referralLossCommissionBonus = new Decimal(
//       lossCommissionAgg._sum.commission || 0,
//     );

//     return {
//       referralDepositBonus: referralDepositBonus.toFixed(2),
//       referralLossCommissionBonus: referralLossCommissionBonus.toFixed(2),
//       totalBonus: referralDepositBonus
//         .plus(referralLossCommissionBonus)
//         .toFixed(2),
//     };
//   }
// }
