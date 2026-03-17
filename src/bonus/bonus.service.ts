import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApprovalType,
  BetType,
  BonusApplicantStatus,
  BonusCategory,
  BonusStatus,
  ExportFormat,
  ExportStatus,
  ExportType,
  Prisma,
  ReleaseType,
  TurnoverFormula,
  WalletTransactionContext,
  WalletType,
} from '@prisma/client';
import { UpsertBonusDto } from './dto/upsert-bonus-by-category.dto';
import { BonusCategoryPayloadValidatorService } from './validators/bonus-category-payload.validator';
import { WalletsService } from 'src/wallets/wallets.service';
import { GetBonusApplicantsQueryDto } from './dto/get-bonus-applicant.dto';
import { UserType } from '@Common';
import { BonusProcessor } from './services/bonus.internal.processor';

@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bonusCategoryPayloadValidatorService: BonusCategoryPayloadValidatorService,
    private readonly walletService: WalletsService,
    private readonly bonusProcessor: BonusProcessor,
  ) {}

  async getGameCategories() {
    return this.prisma.gameCategory.findMany();
  }

  async upsertByCategory(dto: UpsertBonusDto) {
    /* ───────────── BASIC VALIDATION ───────────── */
    if (!dto.category || !dto.name || !dto.startDate || !dto.endDate) {
      throw new Error('category, name, startDate and endDate are required');
    }

    if (!Object.values(BonusCategory).includes(dto.category)) {
      throw new Error(
        `Invalid category. Allowed: ${Object.values(BonusCategory).join(', ')}`,
      );
    }

    if (
      dto.turnoverFormula &&
      !Object.values(TurnoverFormula).includes(dto.turnoverFormula)
    ) {
      throw new Error(
        `Invalid turnoverFormula. Allowed: ${Object.values(TurnoverFormula).join(', ')}`,
      );
    }

    this.bonusCategoryPayloadValidatorService.validateBonusByCategory(dto);

    return this.prisma.$transaction(async (tx) => {
      /* ───────────── ACTIVE BONUS GUARD ───────────── */
      if (dto.status === BonusStatus.Active) {
        const activeBonus = await tx.bonus.findFirst({
          where: {
            category: dto.category,
            status: BonusStatus.Active,
            ...(dto.id ? { id: { not: dto.id } } : {}),
          },
          select: { id: true },
        });

        if (activeBonus) {
          throw new Error(
            `An active bonus already exists for category ${dto.category}`,
          );
        }
      }

      /* ───────────── PAYLOAD ───────────── */
      const bonusPayload: Prisma.BonusUncheckedCreateInput = {
        category: dto.category,
        name: dto.name,
        description: dto.description ?? null,

        status: dto.status ?? BonusStatus.Inactive,

        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),

        approvalType: dto.approvalType ?? ApprovalType.AUTO,
        frequency: dto.frequency ?? null,

        maxApplicants: dto.maxApplicants ?? null,
        maxPerUser: dto.maxPerUser ?? null,

        minDepositAmount: dto.minDepositAmount ?? 0,
        maxBonusAmount: dto.maxBonusAmount ?? null,

        releaseType: dto.releaseType ?? ReleaseType.FIXED,
        percentage: dto.percentage ?? null,

        turnoverFormula: dto.turnoverFormula ?? null,
        multiplier: dto.multiplier ?? 1,

        minOdd: dto.minOdd ?? null,
        maxOdd: dto.maxOdd ?? null,
        betType: dto.betType ?? BetType.All,

        bonusEligibleRole: dto.bonusEligibleRole ?? null,

        referralType: dto.referralType ?? null,
        referrerReleaseType: dto.referrerReleaseType ?? ReleaseType.FIXED,
        referrerMinBonusAmount: dto.referrerMinBonusAmount ?? null,
        referrerPercentage: dto.referrerPercentage ?? null,

        installments: dto.installments ?? 1,
        expireInDays: dto.expireInDays ?? null,

        claimDays: dto.claimDays ?? [],
        claimMonths: dto.claimMonths ?? [],
        claimFrom: dto.claimFrom,
        claimTo: dto.claimTo,
      };

      /* ───────────── UPSERT ───────────── */
      const bonus = dto.id
        ? await tx.bonus.update({
            where: { id: dto.id },
            data: bonusPayload,
          })
        : await tx.bonus.create({
            data: bonusPayload,
          });

      /* ───────────── GAME CATEGORIES ───────────── */
      if (Array.isArray(dto.categories)) {
        if (dto.categories.length > 0) {
          const existingCategories = await tx.gameCategory.findMany({
            where: { id: { in: dto.categories } },
            select: { id: true },
          });

          if (existingCategories.length !== dto.categories.length) {
            throw new Error('Some category IDs are invalid');
          }
        }

        await tx.bonusGameCategory.deleteMany({
          where: { bonusId: bonus.id },
        });

        if (dto.categories.length > 0) {
          await tx.bonusGameCategory.createMany({
            data: dto.categories.map((categoryId) => ({
              bonusId: bonus.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return bonus;
    });
  }

  async getAllBonus(
    status?: BonusStatus,
    search?: string,
    category?: BonusCategory,
    startDate?: Date,
    endDate?: Date,
    page = 1,
    limit = 10,
  ) {
    const where: Prisma.BonusWhereInput = {};

    if (status) where.status = status;
    if (category) where.category = category;

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    page = page < 1 ? 1 : page;
    const skip = (page - 1) * limit;

    const [bonuses, totalItems] = await this.prisma.$transaction([
      this.prisma.bonus.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          bonusGameCategories: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.bonus.count({ where }),
    ]);

    return {
      bonuses: bonuses,
      pagination: {
        currentPage: page,
        totalItems,
        totalPage: Math.ceil(totalItems / limit),
        limit,
      },
    };
  }

  async getBonusById(id: number) {
    const bonus = await this.prisma.bonus.findUnique({
      where: { id },
      include: {
        bonusGameCategories: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!bonus) {
      throw new Error('Bonus not found');
    }

    return bonus;
  }

  async changeStatus(id: number, status: BonusStatus) {
    const bonus = await this.prisma.bonus.findUnique({ where: { id } });

    if (!bonus) {
      throw new Error('Bonus not found');
    }

    if (status === BonusStatus.Active) {
      const alreadyActivated = await this.prisma.bonus.findFirst({
        where: {
          category: bonus.category,
          status: BonusStatus.Active,
        },
      });
      if (alreadyActivated)
        throw new Error('Same category bonus already activated');
    }

    return this.prisma.bonus.update({
      where: { id },
      data: { status },
    });
  }

  async deleteBonus(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const bonus = await tx.bonus.findUnique({
        where: { id },
      });

      if (!bonus) {
        throw new Error('Bonus not found');
      }

      /* ───────────── APPROVED APPLICANT CHECK ───────────── */

      let approvedApplicantCount = 0;

      if (bonus.installments && bonus.installments > 1) {
        approvedApplicantCount = await tx.bonusApplicant.count({
          where: {
            bonusId: bonus.id,
            // installments: {
            //   some: {
            //     status: {
            //       in: [
            //         BonusApplicantStatus.APPROVED,
            //         BonusApplicantStatus.CLAIMED,
            //       ],
            //     },
            //   },
            // },
          },
        });
      } else {
        approvedApplicantCount = await tx.bonusApplicant.count({
          where: {
            bonusId: bonus.id,
            // status: {
            //   in: [BonusApplicantStatus.APPROVED, BonusApplicantStatus.CLAIMED],
            // },
          },
        });
      }

      if (approvedApplicantCount > 0) {
        throw new Error(
          `You can’t delete this bonus because there are ${approvedApplicantCount} approved bonuses.`,
        );
      }

      /* ───────────── CANCEL PENDING / ACTIVE APPLICANTS ───────────── */

      const applicants = await tx.bonusApplicant.findMany({
        where: {
          bonusId: bonus.id,
          status: {
            in: [
              BonusApplicantStatus.PENDING,
              BonusApplicantStatus.ACTIVE,
              BonusApplicantStatus.COMPLETED,
            ],
          },
        },
      });

      for (const applicant of applicants) {
        await tx.bonusApplicant.update({
          where: { id: applicant.id },
          data: { status: BonusApplicantStatus.CANCELLED },
        });

        if (bonus.installments && bonus.installments > 1) {
          const installments = await tx.bonusInstallment.findMany({
            where: {
              bonusApplicantId: applicant.id,
              status: {
                in: [
                  BonusApplicantStatus.PENDING,
                  BonusApplicantStatus.ACTIVE,
                  BonusApplicantStatus.COMPLETED,
                ],
              },
            },
          });

          for (const installment of installments) {
            await tx.bonusInstallment.update({
              where: { id: installment.id },
              data: { status: BonusApplicantStatus.CANCELLED },
            });

            await this.walletService.subtractBalance(
              applicant.userId,
              new Prisma.Decimal(installment.amount),
              WalletType.Bonus,
              true,
              {
                tx,
                context: WalletTransactionContext.BonusCancelled,
                entityId: BigInt(applicant.bonusId),
                narration: 'Installment Cancelled / Bonus Deleted',
                meta: {
                  bonusId: applicant.bonusId,
                  installmentId: installment.id,
                },
              },
            );

            await tx.bonusAuditLog.create({
              data: {
                bonusId: applicant.bonusId,
                userId: applicant.userId,
                action: 'Installment Cancelled / Bonus Deleted',
                details: bonus as Prisma.InputJsonValue,
              },
            });
          }
        } else {
          await this.walletService.subtractBalance(
            applicant.userId,
            new Prisma.Decimal(applicant.awardedAmount),
            WalletType.Bonus,
            true,
            {
              tx,
              context: WalletTransactionContext.BonusCancelled,
              entityId: BigInt(applicant.bonusId),
              narration: 'Bonus Cancelled / Bonus Deleted',
              meta: {
                bonusId: applicant.bonusId,
              },
            },
          );

          await tx.bonusAuditLog.create({
            data: {
              bonusId: applicant.bonusId,
              userId: applicant.userId,
              action: 'Bonus Cancelled / Bonus Deleted',
              details: bonus as Prisma.InputJsonValue,
            },
          });
        }
      }

      /* ───────────── CLEANUP ───────────── */

      await tx.bonusGameCategory.deleteMany({
        where: { bonusId: bonus.id },
      });

      await tx.bonus.delete({
        where: { id: bonus.id },
      });

      return bonus;
    });
  }

  async getAllBonusApplicants(args: {
    search?: string;
    username?: string;
    status?: BonusApplicantStatus;
    startDate?: string;
    endDate?: string;
    category?: BonusCategory;
    releaseType?: ReleaseType;
    approvalType?: ApprovalType;
    userId?: number;
    page?: number;
    limit?: number;
    isExport?: boolean;
  }) {
    const {
      search,
      username,
      status,
      startDate,
      endDate,
      category,
      releaseType,
      approvalType,
      userId,
      page = 1,
      limit = 10,
      isExport = false,
    } = args;

    const where: Prisma.BonusApplicantWhereInput = {};

    /* -------------------- Filters -------------------- */

    if (status) where.status = status;
    if (userId) where.userId = userId;

    if (startDate && endDate) {
      where.awardedAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (username) {
      where.user = {
        username: {
          contains: username,
          mode: 'insensitive',
        },
      };
    }

    if (search || category || releaseType || approvalType) {
      where.bonus = {
        ...(search && {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        }),
        ...(category && { category }),
        ...(releaseType && { releaseType }),
        ...(approvalType && { approvalType }),
      };
    }

    /* -------------------- Pagination -------------------- */

    // const skip = (page - 1) * limit;
    const skip = isExport ? undefined : (page - 1) * limit;
    const take = isExport ? undefined : limit;

    /* -------------------- Query -------------------- */

    const [bonusApplicants, totalItems] = await this.prisma.$transaction([
      this.prisma.bonusApplicant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          bonus: {
            select: {
              id: true,
              name: true,
              category: true,
              releaseType: true,
              installments: true,
            },
          },
          installments: {
            orderBy: { installmentNo: 'asc' },
            select: {
              id: true,
              installmentNo: true,
              amount: true,
              releaseDate: true,
              status: true,
              rejectReason: true,
            },
          },
        },
      }),
      this.prisma.bonusApplicant.count({ where }),
    ]);

    /* -------------------- Response -------------------- */

    return {
      bonusApplicants,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        limit,
      },
    };
  }

  async approveBonusApplicant(
    applicantId: number,
    status: BonusApplicantStatus,
    reason?: string,
    installmentId?: number,
  ) {
    const applicant = await this.prisma.bonusApplicant.findUnique({
      where: { id: applicantId },
      include: {
        bonus: true,
      },
    });

    if (!applicant) {
      throw new Error('Bonus Applicant not found');
    }
    console.log('applicant.status : ', applicant.status);

    if (
      applicant.status !== BonusApplicantStatus.ACTIVE &&
      applicant.status !== BonusApplicantStatus.COMPLETED &&
      applicant.status !== BonusApplicantStatus.APPROVED
    ) {
      throw new Error('Invalid Applicant');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const approvedAt =
        status === BonusApplicantStatus.APPROVED ? new Date() : null;

      /* ───────────── INSTALLMENT FLOW ───────────── */
      if (
        applicant.bonus.installments &&
        applicant.bonus.installments > 1 &&
        installmentId
      ) {
        const installment = await tx.bonusInstallment.findUnique({
          where: { id: installmentId },
        });

        if (!installment) {
          throw new Error('Installment not found');
        }

        if (installment.status !== BonusApplicantStatus.COMPLETED) {
          throw new Error('Invalid Installment');
        }

        const updatedInstallment = await tx.bonusInstallment.update({
          where: { id: installment.id },
          data: {
            status,
            releaseDate: approvedAt,
            rejectReason: reason,
          },
        });

        if (
          (applicant.status === BonusApplicantStatus.ACTIVE ||
            applicant.status === BonusApplicantStatus.PENDING) &&
          status === BonusApplicantStatus.APPROVED
        ) {
          const updatedApplicant = await tx.bonusApplicant.update({
            where: { id: applicant.id },
            data: {
              status: BonusApplicantStatus.ACTIVE,
              rejectReason: reason,
            },
          });

          return {
            bonusApplicant: updatedApplicant,
            installment: updatedInstallment,
            type: 'Approved' as const,
          };
        }

        if (status === BonusApplicantStatus.REJECTED) {
          return {
            bonusApplicant: applicant,
            installment: updatedInstallment,
            type: 'Rejected' as const,
          };
        }
      }

      /* ───────────── NON-INSTALLMENT FLOW ───────────── */
      if (
        applicant.status !== BonusApplicantStatus.COMPLETED &&
        applicant.status !== BonusApplicantStatus.APPROVED
      ) {
        throw new Error('Invalid Applicant');
      }

      const updatedApplicant = await tx.bonusApplicant.update({
        where: { id: applicant.id },
        data: {
          status,
          approvalAt: approvedAt,
          rejectReason: reason,
        },
      });

      return {
        bonusApplicant: updatedApplicant,
        installment: undefined,
        type:
          status === BonusApplicantStatus.APPROVED
            ? ('Approved' as const)
            : ('Rejected' as const),
      };
    });

    /* ───────────── POST-TRANSACTION PROCESSING ───────────── */
    if (result?.type === 'Approved') {
      await this.bonusProcessor.processApprovedBonus(result.bonusApplicant);
    }

    if (result?.type === 'Rejected') {
      await this.bonusProcessor.processRejectBonus(
        result.bonusApplicant,
        result.installment,
        reason,
      );
    }

    return result;
  }

  async exportBonusStatementReport(
    userId: bigint,
    userType: UserType,
    query: GetBonusApplicantsQueryDto,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.bonusStatement,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Bonus Statement',
        timezone: query.timezone,
        filters: {
          userType,
          status: query.status,
          category: query.category,
          releaseType: query.releaseType,
          search: query.search,
          searchbyuserId: query.userId,
          approvalType: query.approvalType,
          searchbyusername: query.username,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
          timezone: query.timezone,
        },
      },
    });

    return {
      message: 'Your bonus statement export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }
}
