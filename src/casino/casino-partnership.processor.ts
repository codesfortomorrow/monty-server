import { BaseService, UtilsService } from '@Common';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  BetStatusType,
  CasinoRoundHistory,
  GameTypeCategory,
  Prisma,
} from '@prisma/client';
import { HierarchyUser } from 'src/bet-result/bet-result.service';
import { PrismaService } from 'src/prisma';
import { appConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';

@Injectable()
export class SettledCasinoBatchProcessor
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
    super({
      loggerDefaultMeta: { processor: SettledCasinoBatchProcessor.name },
    });
  }

  async onApplicationBootstrap() {
    if (!this.utils.isMaster()) return;

    this.logger.info('SettledCasinoBatchProcessor started');
    this.loop();
  }

  async onApplicationShutdown() {
    this.isShuttingDown = true;
    this.logger.warn('Shutdown received for SettledCasinoBatchProcessor');

    if (this.currentRun) {
      await this.currentRun.catch(() => {});
    }
  }

  private async loop() {
    while (!this.isShuttingDown) {
      try {
        await this.trigger();
      } catch (e) {
        this.logger.error('Casino processor loop error', e);
      }

      await this.utils.sleep(3000);
    }
  }

  private async trigger() {
    if (this.isRunning || this.isShuttingDown) return;

    this.isRunning = true;

    this.currentRun = this.processBatch()
      .catch((err) => {
        this.logger.error('Casino batch process failed', err);
      })
      .finally(() => {
        this.isRunning = false;
        this.currentRun = null;
      });

    await this.currentRun;
  }

  private async processBatch() {
    const BATCH_SIZE = 100;

    const rounds = await this.prisma.casinoRoundHistory.findMany({
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

    if (!rounds.length) {
      this.logger.debug('No unsettled casino PL found');
      return;
    }

    this.logger.info(`Found ${rounds.length} casino rounds for PL settlement`);

    for (const bet of rounds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const hierarchy = await this.getHierarchy(bet.userId);

          if (!hierarchy || !hierarchy.data?.length) {
            throw new Error(
              `Hierarchy not found for user ${bet.userId} (casinoId=${bet.id})`,
            );
          }

          const profitLoss =
            Number(bet.totalWins || 0) - Number(bet.totalBets || 0);

          await this.processBetProfitLoss(
            bet,
            hierarchy.data,
            bet.userId,
            Number(profitLoss),
            tx,
          );

          await tx.casinoRoundHistory.update({
            where: { id: bet.id },
            data: { isPlCalculated: true },
          });
        });

        this.logger.info(`Casino PL settled for roundId=${bet.id}`);
        break; // process sequentially like sports
      } catch (err: any) {
        this.logger.error(`Casino PL settlement failed roundId=${bet.id}`, err);
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

    if (!uplineResult.length || !uplineResult[0].upline) {
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
        JOIN role r ON r.id = u.role_id
        JOIN user_meta um ON um.user_id = u.id
        WHERE um.upline @> ${uplinePath}::ltree
        ORDER BY u.id DESC
      `,
    );

    // system root
    users.push({
      id: null,
      ap: 0,
      username: 'OWNER',
      role: 'OWNER',
    });

    return { data: users };
  }

  private async processBetProfitLoss(
    bet: CasinoRoundHistory,
    betUsers: HierarchyUser[],
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
            casinoId: bet.id,
            userType: 'OWNER',
            uplineId: null,
          },
        });

        if (existing) {
          await tx.betPl.update({
            where: { id: existing.id },
            data: {
              uplinePl: Math.round(apAmount),
              totalPl: forwardUpAmount,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.betPl.create({
            data: {
              casinoId: bet.id,
              uplineId: null,
              uplinePl: Math.round(apAmount),
              userType: 'OWNER',
              category: GameTypeCategory.Casino,
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
          casinoId_uplineId_userType: {
            casinoId: bet.id,
            uplineId: BigInt(user.id!),
            userType: user.role,
          },
        },
        update: {
          uplinePl: apAmount,
          totalPl: forwardUpAmount,
          updatedAt: new Date(),
        },
        create: {
          casinoId: bet.id,
          uplineId: BigInt(user.id!),
          uplinePl: Math.round(apAmount),
          userType: user.role,
          totalPl: forwardUpAmount,
          category: GameTypeCategory.Casino,
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
