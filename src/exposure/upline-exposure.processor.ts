import { BaseService, UtilsService } from '@Common';
import { appConfigFactory } from '@Config';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { BetStatusType, GameTypeCategory, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma';
export interface HierarchyUser {
  id: bigint | null;
  ap: number;
  username: string;
  role: string;
}
@Injectable()
export class UplineExposureBatchProcessor
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
      loggerDefaultMeta: { processor: UplineExposureBatchProcessor.name },
    });
  }

  async onApplicationBootstrap() {
    if (!this.utils.isMaster()) return;

    this.logger.info('UplineExposureBatchProcessor started');
    this.loop();
  }

  async onApplicationShutdown() {
    this.isShuttingDown = true;
    this.logger.warn('Shutdown received for UplineExposureBatchProcessor');

    if (this.currentRun) {
      await this.currentRun.catch(() => {});
    }
  }

  private async loop() {
    while (!this.isShuttingDown) {
      try {
        await this.trigger();
      } catch (e) {
        this.logger.error('UplineExposure  processor loop error', e);
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

  private async processBatch() {
    const BATCH_SIZE = 300;
    const exposures = await this.prisma.exposure.findMany({
      where: {
        isUplineExposureCalculated: false,
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (!exposures.length) {
      this.logger.debug('no UplineExposure  found');
      return;
    }
    this.logger.info(`Found ${exposures.length} UplineExposure`);
    for (const exposure of exposures) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const hierarchy = await this.getHierarchy(exposure.userId);
          if (!hierarchy || !hierarchy.data?.length) {
            throw new Error(
              `Hierarchy not found for user ${exposure.userId} (exposure${exposure.id})`,
            );
          }

          console.log('exposure', exposure);
          await this.processBetProfitLoss(
            exposure,
            hierarchy.data,
            exposure.userId,
            Number(exposure.amount),
            tx,
          );

          await tx.exposure.update({
            where: { id: exposure.id },
            data: { isUplineExposureCalculated: true },
          });
        });

        this.logger.info(`PL settled for exposureId=${exposure.id}`);
        break;
      } catch (err: any) {
        this.logger.error(
          `PL settlement failed exposureId=${exposure.id}`,
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

    if (!uplineResult.length || !uplineResult[0].upline) {
      throw new Error("User's upline path not found");
    }

    const uplinePath = uplineResult[0].upline;

    const users = await this.prisma.$queryRaw<HierarchyUser[]>(
      Prisma.sql`
      SELECT 
        u.id::bigint AS id,
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

    users.push({
      id: null,
      ap: 0,
      username: 'OWNER',
      role: 'OWNER',
    });

    return { data: users };
  }

  private async processBetProfitLoss(
    exposure: any,
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
        const existing = await tx.uplineExposure.findFirst({
          where: {
            exposureId: BigInt(exposure.id),
            userType: 'OWNER',
            uplineId: null,
          },
        });

        if (existing) {
          await tx.uplineExposure.update({
            where: { id: existing.id },
            data: {
              uplinePl: Math.round(apAmount),
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.uplineExposure.create({
            data: {
              exposureId: BigInt(exposure.id),
              uplineId: null,
              uplinePl: Math.round(apAmount),
              userType: 'OWNER',
              totalPl: forwardUpAmount,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }

        continue;
      }

      await tx.uplineExposure.upsert({
        where: {
          exposureId_uplineId_userType: {
            exposureId: BigInt(exposure.id),
            uplineId: BigInt(user.id!),
            userType: user.role,
          },
        },
        update: {
          uplinePl: Math.round(apAmount),
          updatedAt: new Date(),
        },
        create: {
          exposureId: BigInt(exposure.id),
          uplineId: BigInt(user.id!),
          uplinePl: Math.round(apAmount),
          userType: user.role,
          totalPl: forwardUpAmount,
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
