import { BaseService, UtilsService } from '@Common';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Bet, BetStatusType, GameTypeCategory, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma';
import { HierarchyUser } from './bet-result.service';
import { appConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';

@Injectable()
export class SettledBetBatchProcessor
  extends BaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private isRunning = false;
  private isShuttingDown = false;
  private currentRun: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,

    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof appConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { processor: SettledBetBatchProcessor.name } });
  }

  async onApplicationBootstrap() {
    if (!this.utils.isMaster()) return;

    this.logger.info('SettledBetBatchProcessor started');
    this.loop();
  }

  async onApplicationShutdown() {
    this.isShuttingDown = true;
    this.logger.warn('Shutdown received for SettledBetBatchProcessor');

    if (this.currentRun) {
      await this.currentRun.catch(() => {});
    }
  }

  private async loop() {
    while (!this.isShuttingDown) {
      try {
        await this.trigger();
      } catch (e) {
        this.logger.error('Settled processor loop error', e);
      }

      await this.utils.sleep(3000);
    }
  }

  private async trigger() {
    if (this.isRunning || this.isShuttingDown) return;

    this.isRunning = true;

    this.currentRun = this.processBatch()
      .catch((err) => {
        this.logger.error('Batch process failed', err);
      })
      .finally(() => {
        this.isRunning = false;
        this.currentRun = null;
      });

    await this.currentRun;
  }

  // private async processBatch() {
  //   const settledBets = await this.prisma.bet.findMany({
  //     where: {
  //       status: { in: [BetStatusType.Won, BetStatusType.Lost] },
  //       isPlCalculated: false,
  //     },
  //     take: 500,
  //     orderBy: { id: 'asc' },
  //   });

  //   if (!settledBets.length) {
  //     this.logger.debug('No settled bets found');
  //     return;
  //   }

  //   const betIds = settledBets.map((b) => b.id);

  //   await this.prisma.bet.updateMany({
  //     where: {
  //       id: { in: betIds },
  //       isPlCalculated: false,
  //     },
  //     data: {
  //       isPlCalculated: true,
  //     },
  //   });

  //   await this.utils.batchable(settledBets, async (bet) => {
  //     await this.prisma.$transaction(async (tx) => {
  //       const hierarchy = await this.getHierarchy(bet.userId);

  //       if (!hierarchy) {
  //         throw new Error(
  //           `Failed to get hierarchy for user ${bet.userId}: ${hierarchy}`,
  //         );
  //       }

  //       const betUsers = hierarchy.data;
  //       console.log(
  //         `Fetched ${betUsers} users in hierarchy for user ${bet.userId}`,
  //       );

  //       await this.processBetProfitLoss(
  //         bet,
  //         hierarchy.data,
  //         bet.userId,
  //         Number(bet.payout),
  //         tx,
  //       );
  //     });
  //   });
  // }

  private async processBatch() {
    const BATCH_SIZE = 100;
    const settledBets = await this.prisma.bet.findMany({
      where: {
        status: { in: [BetStatusType.Won, BetStatusType.Lost] },
        isPlCalculated: false,
        user: {
          role: {
            NOT: {
              name: 'DEMO',
            },
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (!settledBets.length) {
      this.logger.debug('No unsettled PL bets found');
      return;
    }
    this.logger.info(`Found ${settledBets.length} bets for PL settlement`);
    for (const bet of settledBets) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const hierarchy = await this.getHierarchy(bet.userId);
          if (!hierarchy || !hierarchy.data?.length) {
            throw new Error(
              `Hierarchy not found for user ${bet.userId} (betId=${bet.id})`,
            );
          }

          console.log('bet', bet);
          await this.processBetProfitLoss(
            bet,
            hierarchy.data,
            bet.userId,
            Number(bet.payout),
            tx,
          );

          await tx.bet.update({
            where: { id: bet.id },
            data: { isPlCalculated: true },
          });
        });

        this.logger.info(`PL settled for betId=${bet.id}`);
        break;
      } catch (err: any) {
        this.logger.error(
          `PL settlement failed betId=${bet.id}`,
          err?.stack || err,
        );
        await this.utils.sleep(3000);
      }
    }
  }

  async getHierarchy(uid: bigint): Promise<{ data: HierarchyUser[] }> {
    const uplineResult = await this.prisma.$queryRawUnsafe<
      { upline: string | null }[]
    >(
      `SELECT upline::text AS upline FROM user_meta WHERE user_id = $1::bigint`,
      uid,
    );

    if (uplineResult.length === 0) {
      throw new Error("User's upline path not found");
    }

    const uplinePath = uplineResult[0].upline;

    const users = await this.prisma.$queryRaw<HierarchyUser[]>(
      Prisma.sql`
        SELECT 
          u.id, 
          u.partnership::REAL AS ap, 
          u.username,
          r.name AS role
        FROM "user" u
        join role r ON r.id = u.role_id
        JOIN user_meta um ON um.user_id = u.id
        WHERE um.upline @> ${uplinePath}::ltree
        ORDER BY u.id DESC
      `,
    );
    users.push({
      id: null,
      ap: 0,
      username: 'OWNER',
      role: 'OWNER',
    });

    return { data: users };
  }

  private async processBetProfitLoss(
    bet: Bet,
    betUsers: any[],
    userId: bigint,
    settlementAmount: number,
    tx: Prisma.TransactionClient,
  ) {
    const forwardUpAmount = settlementAmount * -1;
    const addAp = 100;

    for (let k = 0; k < betUsers.length; k++) {
      const user = betUsers[k];

      // // Skip original bettor
      // if (user.id !== null && user.id === userId) continue;

      const level = this.getLevel(user.role);
      let apAmount = 0;

      //  OWNER calculation
      if (user.role === 'OWNER') {
        if (k > 0 && betUsers[k - 1].role !== 'USER') {
          apAmount = (forwardUpAmount * betUsers[k - 1].ap) / 100;
        } else {
          apAmount = forwardUpAmount;
        }
      } //  for user
      else if (this.isUser(level)) {
        apAmount = forwardUpAmount;
      }
      //  Direct upline of USER
      else if (this.isDirectUplineOfUser(level)) {
        apAmount = (forwardUpAmount * (addAp - user.ap)) / 100;
      } else {
        if (k > 0 && betUsers[k - 1].role !== 'USER') {
          const diff = betUsers[k - 1].ap - user.ap;
          apAmount = (forwardUpAmount * diff) / 100;
        } else {
          apAmount = (forwardUpAmount * (addAp - user.ap)) / 100;
        }
      }

      const isOwner = user.role === 'OWNER';
      if (isOwner) {
        const existing = await tx.betPl.findFirst({
          where: {
            betId: BigInt(bet.id),
            userType: 'OWNER',
            uplineId: null,
          },
        });

        if (existing) {
          await tx.betPl.update({
            where: { id: existing.id },
            data: {
              uplinePl: apAmount,
              totalPl: forwardUpAmount,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.betPl.create({
            data: {
              betId: BigInt(bet.id),
              uplineId: null,
              uplinePl: apAmount,
              userType: 'OWNER',
              category: GameTypeCategory.Sports,
              totalPl: forwardUpAmount,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }

        continue;
      }

      await tx.betPl.upsert({
        where: {
          betId_uplineId_userType: {
            betId: BigInt(bet.id),
            uplineId: BigInt(user.id!),
            userType: user.role,
          },
        },
        update: {
          uplinePl: Math.round(apAmount),
          totalPl: forwardUpAmount,
          updatedAt: new Date(),
        },
        create: {
          betId: BigInt(bet.id),
          uplineId: BigInt(user.id!),
          uplinePl: apAmount,
          userType: user.role,
          totalPl: forwardUpAmount,
          category: GameTypeCategory.Sports,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
  }

  private getLevel(role: string): number {
    return this.appConfig.userTypes[role]?.level ?? Number.MAX_SAFE_INTEGER;
  }

  private getUserLevel(): number {
    const user = this.appConfig.userTypes['USER'];
    if (!user) throw new Error('USER role missing in config');
    return user.level;
  }

  private isUser(level: number): boolean {
    return level === this.getUserLevel();
  }

  private isDirectUplineOfUser(level: number): boolean {
    return level === this.getUserLevel() - 1;
  }

  private isOwnerLike(level: number): boolean {
    const minLevel = Math.min(
      ...Object.values(this.appConfig.userTypes).map((u) => u.level),
    );
    return level === minLevel;
  }
}
