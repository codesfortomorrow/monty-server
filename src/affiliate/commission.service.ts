import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RequestStatus,
  Prisma,
  AffiliateStatus,
  CommissionStatus,
  WalletType,
  WalletTransactionContext,
  ExportType,
} from '@prisma/client';
import dayjs from 'dayjs';
import { BaseService, UtilsService } from '@Common';
import { commissionConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { WalletsService } from 'src/wallets/wallets.service';
import { SystemService } from 'src/system';
import { UsersService } from 'src/users';

@Injectable()
export class CommissionService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
    private readonly walletsService: WalletsService,
    private readonly systemService: SystemService,
    private readonly userService: UsersService,
    @Inject(commissionConfigFactory.KEY)
    private readonly commissionConfig: ConfigType<
      typeof commissionConfigFactory
    >,
  ) {
    super({ loggerDefaultMeta: { service: CommissionService.name } });
  }

  async getCommissionPercentByActiveCount(activeCount: number) {
    const dbRange = await this.prisma.affiliateCommissionRange.findFirst({
      where: {
        fromUser: { lte: activeCount },
        OR: [{ toUser: null }, { toUser: { gte: activeCount } }],
      },
      orderBy: { fromUser: 'asc' },
    });

    if (dbRange) {
      return dbRange.percentage;
    }

    const envRanges = this.commissionConfig.defaultRanges;

    for (const r of envRanges) {
      if (activeCount >= r.from && activeCount <= r.to) {
        return r.commission;
      }
    }

    return 0;
  }

  async activeStatusOfAffiliateRefral(batchSize = 150) {
    this.logger.info('RUN STARTED');

    let lastId = 0n;
    const turnoverSettings = await this.systemService.getTurnoverSettings();
    const envTurnover = Number(this.commissionConfig.turnover ?? 3000);
    const requiredTurnover = turnoverSettings?.active_user
      ? Number(turnoverSettings.active_user)
      : envTurnover;

    while (true) {
      this.logger.info(`Fetching affiliate referrals with lastId=${lastId}`);

      const affiliateReferrals = await this.prisma.affiliateReferral.findMany({
        where: {
          id: { gt: lastId },
          affiliate: {
            requestStatus: RequestStatus.Approved,
            deletedAt: null,
          },
        },
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      this.logger.info(
        `Fetched affiliate referrals: ${affiliateReferrals.length}`,
      );

      if (affiliateReferrals.length === 0) {
        this.logger.info('No more affiliate referrals — breaking loop');
        break;
      }

      const batchLastId = BigInt(
        affiliateReferrals[affiliateReferrals.length - 1].id,
      );

      const referralsByAffiliate = new Map<bigint, any[]>();
      for (const referral of affiliateReferrals) {
        const affiliateId = BigInt(referral.affiliateId);
        if (!referralsByAffiliate.has(affiliateId)) {
          referralsByAffiliate.set(affiliateId, []);
        }
        referralsByAffiliate.get(affiliateId)!.push(referral);
      }

      await this.utilsService.batchable(
        Array.from(referralsByAffiliate.entries()),
        async ([affiliateId, referrals]) => {
          this.logger.info(
            `Processing affiliate ${affiliateId} with ${referrals.length} referrals`,
          );

          const userIds = referrals.map((r) => BigInt(r.referredUserId));

          const endDay = dayjs().subtract(1, 'day');
          const weekEnd = endDay.endOf('day').toDate(); // yesterday 11:59:59 PM
          const weekStart = endDay.subtract(6, 'day').startOf('day').toDate(); // 7 days range

          // const endDay = dayjs().subtract(1, 'day');

          // const weekStart = endDay.startOf('day').toDate(); // 12:00 AM (yesterday)
          // const weekEnd = endDay.endOf('day').toDate(); // 11:59:59 PM (yesterday)

          // const weekEnd = dayjs().toDate(); // current time
          // const weekStart = dayjs().subtract(1, 'hour').toDate(); // last 3 hours from now

          //console.log(endDay, 'endDay');
          console.log('weekend', weekEnd);
          console.log('weekStart', weekStart);
          const grouped = await this.prisma.turnoverHistory.groupBy({
            by: ['userId'],
            where: {
              userId: { in: userIds },
              createdAt: { gte: weekStart, lte: weekEnd },
              turnoverMain: { gt: 0 },
            },
            _sum: {
              turnoverMain: true,
            },
          });

          const turnoverMap = new Map<bigint, Prisma.Decimal>();
          for (const g of grouped) {
            turnoverMap.set(
              g.userId,
              new Prisma.Decimal(g._sum.turnoverMain || 0),
            );
          }

          const activeReferralIds: bigint[] = [];
          const inactiveReferralIds: bigint[] = [];

          for (const ref of referrals) {
            const uid = BigInt(ref.referredUserId);
            const weeklyTurnover =
              turnoverMap.get(uid) ?? new Prisma.Decimal(0);
            console.log(uid, weeklyTurnover);
            if (weeklyTurnover.gte(requiredTurnover)) {
              activeReferralIds.push(BigInt(ref.id));
            } else {
              inactiveReferralIds.push(BigInt(ref.id));
            }
          }
          console.log('activeReferralIds', activeReferralIds);
          console.log('inactiveReferralIds', inactiveReferralIds);
          if (activeReferralIds.length > 0) {
            await this.prisma.affiliateReferral.updateMany({
              where: { id: { in: activeReferralIds } },
              data: {
                status: AffiliateStatus.Active,
                activeAt: new Date(),
              },
            });
          }

          if (inactiveReferralIds.length > 0) {
            await this.prisma.affiliateReferral.updateMany({
              where: { id: { in: inactiveReferralIds } },
              data: {
                status: AffiliateStatus.Inactive,
                activeAt: null,
              },
            });
          }
        },
        20,
      );

      lastId = batchLastId;
    }

    this.logger.info('RUN COMPLETED');
    return { ok: true };
  }

  async runWeeklyCommissionBatchable(batchSize = 150) {
    this.logger.info('RUN STARTED');

    let lastId = 0n;

    try {
      const systemSettings = await this.systemService.getTurnoverSettings();
      const depositPercent =
        systemSettings?.deposit !== undefined
          ? Number(systemSettings.deposit)
          : Number(this.commissionConfig.depositFee ?? 0);

      const withdrawPercent =
        systemSettings?.withdrawal !== undefined
          ? Number(systemSettings.withdrawal)
          : Number(this.commissionConfig.withdrawalFee ?? 0);

      const platformCostPercent =
        systemSettings?.platform !== undefined
          ? Number(systemSettings.platform)
          : Number(this.commissionConfig.platformCost ?? 0);

      const adminId = await this.prisma.admin.findFirst();
      if (!adminId) {
        throw Error(' Owner not found');
      }

      const wallet = await this.walletsService.getByAdminId(adminId.id);

      //const activeCount = Number(this.commissionConfig.activeCount ?? 5);

      const endDay = dayjs().subtract(1, 'day'); // yesterday
      const weekEnd = endDay.endOf('day').toDate(); // 11:59:59 PM
      const weekStart = endDay.subtract(6, 'day').startOf('day').toDate(); // 12:00 AM

      // const endDay = dayjs().subtract(1, 'day');

      // const weekStart = endDay.startOf('day').toDate(); // 12:00 AM (yesterday)
      // const weekEnd = endDay.endOf('day').toDate(); // 11:59:59 PM (yesterday)

      // const weekEnd = dayjs().toDate(); // current time
      // const weekStart = dayjs().subtract(1, 'hour').toDate();

      while (true) {
        this.logger.info(`Fetching affiliates with lastId=${lastId}`);

        const affiliates = await this.prisma.affiliate.findMany({
          where: {
            id: { gt: lastId },
            requestStatus: RequestStatus.Approved,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
            userId: true,
            lastCommission: true,
            totalCommission: true,
            _count: {
              select: {
                affiliateReferrals: {
                  where: {
                    status: AffiliateStatus.Active,
                  },
                },
              },
            },
          },
          take: batchSize,
          orderBy: { id: 'asc' },
        });

        this.logger.info(`Fetched affiliates: ${affiliates.length}`);
        if (!affiliates.length) break;

        const batchAffiliateIds = affiliates.map((a) => Number(a.id));

        const userSummaries =
          await this.getAffiliateUserSummaries(batchAffiliateIds);

        const userSummariesByAffiliate = new Map<bigint, any[]>();
        for (const userSummary of userSummaries) {
          const affiliateId = userSummary.affiliateId;
          if (!userSummariesByAffiliate.has(affiliateId)) {
            userSummariesByAffiliate.set(affiliateId, []);
          }
          userSummariesByAffiliate.get(affiliateId)!.push(userSummary);
        }

        await this.utilsService.batchable(affiliates, async (affiliate) => {
          try {
            const affiliateId = affiliate.id;
            const userSummaries =
              userSummariesByAffiliate.get(affiliateId) || [];

            const activeUsers = affiliate._count?.affiliateReferrals ?? 0;

            let totalDeposit = 0;
            let totalWithdrawal = 0;
            let totalBonus = 0;
            let platformProfit = 0;
            let totalLost = 0;

            for (const userSummary of userSummaries) {
              totalDeposit += Number(userSummary.totalDeposit ?? 0);
              totalWithdrawal += Number(userSummary.totalWithdrawal ?? 0);
              totalBonus += Number(userSummary.totalBonus ?? 0);

              const userProfitLoss = Number(userSummary.userProfitLoss ?? 0);

              if (userProfitLoss < 0) {
                // User lost money = Platform profit
                const userLoss = Math.abs(userProfitLoss);
                platformProfit += userLoss; // Add to platform profit
                totalLost += userLoss; // Store for record keeping
              } else if (userProfitLoss > 0) {
                // User won money = Platform loss
                platformProfit -= userProfitLoss; // Subtract from platform profit
              }
            }

            let depositFee = 0;
            let withdrawFee = 0;
            let platformCost = 0;

            if (depositPercent > 0 && totalDeposit > 0) {
              depositFee = totalDeposit * (depositPercent / 100);
            }

            if (withdrawPercent > 0 && totalWithdrawal > 0) {
              withdrawFee = totalWithdrawal * (withdrawPercent / 100);
            }

            const totalPaymentFee = depositFee + withdrawFee;

            if (platformCostPercent > 0 && platformProfit > 0) {
              platformCost = totalLost * (platformCostPercent / 100);
            }

            const netProfit =
              platformProfit - platformCost - totalBonus - totalPaymentFee;

            let commissionPercent = 0;
            let commissionAmount = 0;

            if (netProfit > 0 && activeUsers > 0) {
              commissionPercent =
                await this.getCommissionPercentByActiveCount(activeUsers);
              commissionAmount = (netProfit * commissionPercent) / 100;
            }

            let status =
              commissionAmount > 0
                ? AffiliateStatus.Active
                : AffiliateStatus.Inactive;
            if (commissionAmount < 0) {
              commissionAmount = 0;
            }

            const deductionAmount = platformCost + totalBonus + totalPaymentFee;

            await this.prisma.$transaction(async (tx) => {
              // Create weekly commission history record
              const commissionHistory = await tx.weeklyCommissionHistory.create(
                {
                  data: {
                    affiliateId: BigInt(affiliateId),
                    weekStart: weekStart,
                    weekEnd: weekEnd,
                    activeUsers: activeUsers,
                    totalLoss: platformProfit,
                    deductionAmount: deductionAmount,
                    commissionPercent: commissionPercent,
                    commissionAmount: commissionAmount,
                    status: CommissionStatus.Pending,
                  },
                },
              );

              if (commissionAmount > 0) {
                const user = await this.userService.getById(affiliate.userId);
                await this.walletsService.addBalance(
                  affiliate.userId,
                  new Prisma.Decimal(commissionAmount),
                  WalletType.Main,
                  false,
                  {
                    tx: tx,
                    context: WalletTransactionContext.Commission,
                    entityId: commissionHistory.id,
                    // fromAccount: 'OWNER',
                    // toAccount: user.username ?? 'User',
                    meta: {
                      weekStart: weekStart.toISOString(),
                      weekEnd: weekEnd.toISOString(),
                      activeUsers: activeUsers,
                      totalLoss: totalLost,
                      netProfit: netProfit,
                      commissionPercent: commissionPercent,
                      // fromAccount: 'OWNER',
                      // toAccount: user.username ?? 'User',
                    },
                    narration: `Affiliate Commission`,
                  },
                );

                // await this.walletsService.subtractBalanceFromOwner(
                //   adminId.id,
                //   new Prisma.Decimal(commissionAmount),
                //   WalletType.Main,
                //   {
                //     tx: tx,
                //     context: WalletTransactionContext.Commission,
                //     entityId: commissionHistory.id,
                //     fromAccount: 'OWNER',
                //     toAccount: user.username ?? 'User',
                //     meta: {
                //       weekStart: weekStart.toISOString(),
                //       weekEnd: weekEnd.toISOString(),
                //       activeUsers: activeUsers,
                //       totalLoss: totalLost,
                //       netProfit: netProfit,
                //       commissionPercent: commissionPercent,
                //       fromAccount: 'OWNER',
                //       toAccount: user.username ?? 'User',
                //     },
                //   },
                // );

                await tx.weeklyCommissionHistory.update({
                  where: { id: commissionHistory.id },
                  data: { status: CommissionStatus.Paid },
                });
              } else {
                await tx.weeklyCommissionHistory.update({
                  where: { id: commissionHistory.id },
                  data: { status: CommissionStatus.NotCommission },
                });
              }

              await this.createAffiliateWeeklyActiveUsers(tx, {
                affiliateId: BigInt(affiliateId),
                weeklyCommissionHistoryId: commissionHistory.id,
                weekStart: weekStart,
                weekEnd: weekEnd,
              });

              await tx.affiliate.update({
                where: { id: BigInt(affiliateId) },
                data: {
                  status: status,
                  lastCommission: commissionAmount,
                  totalCommission: { increment: commissionAmount },
                },
              });
            });
          } catch (err) {
            this.logger.error(
              `Affiliate commission failed | affiliateId=${affiliate.id}`,
              err instanceof Error ? err.stack : err,
            );
          }
        });

        lastId = BigInt(affiliates[affiliates.length - 1].id);
      }

      this.logger.info('RUN COMPLETED');
    } catch (error) {
      this.logger.error(
        'Weekly commission batch FAILED',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  async createAffiliateWeeklyActiveUsers(
    tx: Prisma.TransactionClient,
    params: {
      affiliateId: bigint;
      weeklyCommissionHistoryId: bigint;
      weekStart: Date;
      weekEnd: Date;
    },
  ) {
    const { affiliateId, weeklyCommissionHistoryId, weekStart, weekEnd } =
      params;
    try {
      const activeReferrals = await tx.affiliateReferral.findMany({
        where: {
          affiliateId,
          status: AffiliateStatus.Active,
        },
        select: {
          referredUserId: true,
        },
      });

      if (activeReferrals.length === 0) return { inserted: 0 };

      const referredUserIds = activeReferrals.map((ref) => ref.referredUserId);

      const turnoverGrouped = await tx.turnoverHistory.groupBy({
        by: ['userId'],
        where: {
          userId: { in: referredUserIds },
          createdAt: { gte: weekStart, lte: weekEnd },
          turnoverMain: { gt: 0 },
        },
        _sum: { turnoverMain: true },
      });

      const turnoverByUser = new Map<bigint, Prisma.Decimal>();
      for (const record of turnoverGrouped) {
        turnoverByUser.set(
          BigInt(record.userId),
          new Prisma.Decimal(record._sum.turnoverMain ?? 0),
        );
      }

      const activeUserRows = activeReferrals.map((ref) => ({
        affiliateId,
        weeklyCommissionHistoryId,
        referredUserId: ref.referredUserId,
        turnover:
          turnoverByUser.get(ref.referredUserId) ?? new Prisma.Decimal(0),
      }));

      await tx.affiliateWeeklyActiveUser.createMany({
        data: activeUserRows,
        skipDuplicates: true,
      });

      return { inserted: activeUserRows.length };
    } catch (error) {
      this.logger.error(
        `Failed to create weekly active users | affiliateId=${affiliateId.toString()}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  async getAffiliateUserSummaries(affiliateIds: number[]) {
    if (!affiliateIds.length) return [];

    const idList = affiliateIds.join(',');
    const rows: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT 
        ar.affiliate_id AS "affiliateId",
        uv.user_id AS "userId",
        uv.username,
        uv.total_deposit AS "totalDeposit",
        uv.total_withdrawal AS "totalWithdrawal",
        uv.user_profit_loss AS "userProfitLoss",
        uv.total_bonus AS "totalBonus"
      FROM affiliate_referral ar
      JOIN user_weekly_summary_mv uv ON uv.user_id = ar.referred_user_id
      WHERE ar.affiliate_id IN (${idList})
        AND ar.status = 'active'
        ORDER BY ar.affiliate_id, uv.user_id
    `);

    return rows;
  }

  async refreshUserWeeklySummaryView() {
    try {
      this.logger.info(
        "🔄 Refreshing materialized view 'user_weekly_summary_mv'",
      );

      await this.prisma.$executeRawUnsafe(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY user_weekly_summary_mv;
    `);

      this.logger.info(
        "✅ Materialized view 'user_weekly_summary_mv' refreshed successfully",
      );
    } catch (error: any) {
      this.logger.error('⚠️ Concurrent refresh failed, retrying normally...');
      this.logger.error(`Error: ${error.message}`);

      try {
        this.logger.info('🔁 Refreshing materialized view normally');
        await this.prisma.$executeRawUnsafe(`
        REFRESH MATERIALIZED VIEW user_weekly_summary_mv;
      `);

        this.logger.info(
          "✅ Materialized view 'user_weekly_summary_mv' refreshed normally",
        );
      } catch (err) {
        this.logger.error(
          `❌ Failed to refresh materialized view 'user_weekly_summary_mv': ${err}`,
        );
      }
    }
  }
}
