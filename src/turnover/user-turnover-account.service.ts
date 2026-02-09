// import { UtilsService } from '@Common';
// import { forwardRef, Inject } from '@nestjs/common';
// import {
//   Prisma,
//   WalletType,
//   ExportStatus,
//   WalletTransactionContext,
//   BonusApplicantStatusType,
//   UserTurnoverAccount,
// } from '@prisma/client';
// import { Decimal } from '@prisma/client/runtime/library';
// import { PrismaService } from 'src/prisma';
// import { WalletsService } from 'src/wallets/wallets.service';

// type TurnoverRow = {
//   id: bigint;
//   version: number;
//   amount: Decimal;
//   returnedAmount: Decimal;
//   requiredTurnover: Decimal;
//   bonusApplicant: bigint | null;
//   turnoverType: WalletType;
// };

// export class UserTurnoverAccountService {
//   private readonly TURNOVER_BATCH_SIZE = 25;

//   constructor(
//     private readonly prisma: PrismaService,
//     @Inject(forwardRef(() => WalletsService))
//     private readonly walletsService: WalletsService,
//     private readonly utils: UtilsService,
//   ) {}

//   async createTurnoverAccount(params: {
//     userId: bigint;
//     depositId: bigint | undefined | number;
//     walletId: bigint;
//     amount: Decimal;
//     requiredTurnover: Decimal | number;
//     walletType: WalletType;
//     bonusApplicant?: number;
//     tx?: Prisma.TransactionClient;
//   }) {
//     const {
//       userId,
//       depositId,
//       walletId,
//       amount,
//       requiredTurnover,
//       walletType,
//       bonusApplicant,
//       tx,
//     } = params;

//     const prisma = tx ?? this.prisma;

//     return prisma.userTurnoverAccount.create({
//       data: {
//         userId,
//         depositId: Number(depositId),
//         walletId,
//         amount: amount,
//         requiredTurnover,
//         returnedAmount: new Decimal(0),
//         turnoverType: walletType,
//         status: ExportStatus.Pending,
//         version: 0,
//         bonusApplicant: bonusApplicant,
//       },
//     });
//   }

//   private async hasPendingMainTurnover(
//     userId: bigint,
//     tx: Prisma.TransactionClient,
//   ): Promise<boolean> {
//     const count = await tx.userTurnoverAccount.count({
//       where: {
//         userId,
//         turnoverType: WalletType.Main,
//         status: ExportStatus.Pending,
//       },
//     });

//     return count > 0;
//   }

//   // ----------------

//   private async applyTurnoverRow(
//     turnover: TurnoverRow,
//     userId: bigint,
//     available: Decimal,
//     tx: Prisma.TransactionClient,
//   ): Promise<{ applied: Decimal; remaining: Decimal }> {
//     if (available.lte(0)) {
//       return { applied: new Decimal(0), remaining: available };
//     }

//     const remainingRequired = turnover.requiredTurnover.sub(
//       turnover.returnedAmount,
//     );
//     if (remainingRequired.lte(0)) {
//       return { applied: new Decimal(0), remaining: available };
//     }

//     const amountToApply = Decimal.min(available, remainingRequired);

//     const updated = await tx.userTurnoverAccount.updateMany({
//       where: {
//         id: turnover.id,
//         version: turnover.version,
//         status: ExportStatus.Pending,
//       },
//       data: {
//         returnedAmount: { increment: amountToApply },
//         version: { increment: 1 },
//       },
//     });

//     if (updated.count === 0) {
//       return { applied: new Decimal(0), remaining: available };
//     }

//     const fresh = await tx.userTurnoverAccount.findUniqueOrThrow({
//       where: { id: turnover.id },
//       select: {
//         returnedAmount: true,
//         requiredTurnover: true,
//         turnoverType: true,
//         bonusApplicant: true,
//         status: true,
//       },
//     });

//     const isNowCompleted = fresh.returnedAmount.gte(fresh.requiredTurnover);

//     if (isNowCompleted && fresh.status === ExportStatus.Pending) {
//       await tx.userTurnoverAccount.update({
//         where: { id: turnover.id },
//         data: {
//           status: ExportStatus.Completed,
//           setteledAt: new Date(),
//         },
//       });
//     }

//     if (fresh.turnoverType === WalletType.Bonus && fresh.bonusApplicant) {
//       const bonusApplicantId = fresh.bonusApplicant;

//       await tx.bonusApplicant.updateMany({
//         where: {
//           id: bonusApplicantId,
//           status: { not: BonusApplicantStatusType.Approved },
//         },
//         data: {
//           turnoverCompleted: { increment: amountToApply },
//         },
//       });

//       if (isNowCompleted) {
//         await this.tryCompleteBonusApplicant(
//           userId,
//           bonusApplicantId,
//           Number(turnover.id),
//           tx,
//         );
//       }
//     }

//     return {
//       applied: amountToApply,
//       remaining: available.sub(amountToApply),
//     };
//   }

//   private async tryCompleteBonusApplicant(
//     userId: bigint,
//     bonusApplicantId: number,
//     triggerTurnoverId: number,
//     tx: Prisma.TransactionClient,
//   ): Promise<void> {
//     // Get current applicant state with required & completed amounts
//     const applicant = await tx.bonusApplicant.findUnique({
//       where: { id: bonusApplicantId },
//       select: {
//         status: true,
//         turnoverRequired: true,
//         turnoverCompleted: true,
//         awardedAmount: true,
//         bonus: {
//           select: { category: true },
//         },
//       },
//     });

//     if (!applicant) return;
//     if (applicant.status !== BonusApplicantStatusType.Pending) return;

//     if (applicant.turnoverCompleted.lt(applicant.turnoverRequired)) {
//       return; // still not enough total turnover
//     }

//     const pendingBonusCount = await tx.userTurnoverAccount.count({
//       where: {
//         userId,
//         turnoverType: WalletType.Bonus,
//         status: ExportStatus.Pending,
//       },
//     });

//     if (pendingBonusCount > 0) {
//       return;
//     }

//     const approved = await tx.bonusApplicant.updateMany({
//       where: {
//         id: bonusApplicantId,
//         status: BonusApplicantStatusType.Pending,
//       },
//       data: {
//         status: BonusApplicantStatusType.Approved,
//       },
//     });

//     if (approved.count !== 1) {
//       return;
//     }

//     if (applicant.awardedAmount.gt(0)) {
//       await this.walletsService.transferBalance({
//         userId,
//         amount: applicant.awardedAmount,
//         from: WalletType.Bonus,
//         to: WalletType.Main,
//         context: applicant.bonus.category,
//         entityId: triggerTurnoverId,
//         fromAccount: 'BONUS',
//         toAccount: 'MAIN',
//         tx,
//       });
//     }
//   }

//   async processTurnover(
//     params: {
//       userId: bigint;
//       turnoverAmount: Decimal;
//     },
//     tx: Prisma.TransactionClient,
//   ): Promise<{ appliedTurnover: Decimal; remainingTurnover: Decimal }> {
//     let remaining = params.turnoverAmount;
//     let appliedTotal = new Decimal(0);

//     if (remaining.lte(0)) {
//       return { appliedTurnover: appliedTotal, remainingTurnover: remaining };
//     }

//     const mainResult = await this.processByType(
//       params.userId,
//       WalletType.Main,
//       remaining,
//       tx,
//     );

//     appliedTotal = appliedTotal.add(mainResult.applied);
//     remaining = mainResult.remaining;

//     if (remaining.gt(0)) {
//       const hasAnyPendingMain = await tx.userTurnoverAccount.count({
//         where: {
//           userId: params.userId,
//           turnoverType: WalletType.Main,
//           status: ExportStatus.Pending,
//         },
//       });

//       if (hasAnyPendingMain === 0) {
//         const bonusResult = await this.processByType(
//           params.userId,
//           WalletType.Bonus,
//           remaining,
//           tx,
//         );

//         appliedTotal = appliedTotal.add(bonusResult.applied);
//         remaining = bonusResult.remaining;
//       }
//     }

//     return {
//       appliedTurnover: appliedTotal,
//       remainingTurnover: remaining,
//     };
//   }

//   private async processByType(
//     userId: bigint,
//     turnoverType: WalletType,
//     available: Decimal,
//     tx: Prisma.TransactionClient,
//   ): Promise<{ applied: Decimal; remaining: Decimal }> {
//     let appliedTotal = new Decimal(0);
//     let remaining = available;

//     const MAX_ITERATIONS = 40;

//     for (let i = 0; i < MAX_ITERATIONS && remaining.gt(0); i++) {
//       const turnover = await tx.userTurnoverAccount.findFirst({
//         where: {
//           userId,
//           turnoverType,
//           status: ExportStatus.Pending,
//         },
//         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
//         select: {
//           id: true,
//           version: true,
//           returnedAmount: true,
//           requiredTurnover: true,
//           turnoverType: true,
//           bonusApplicant: true,
//         },
//       });

//       if (!turnover) break;

//       const result = await this.applyTurnoverRow(
//         turnover as TurnoverRow,
//         userId,
//         remaining,
//         tx,
//       );

//       if (result.applied.lte(0)) {
//         break;
//       }

//       appliedTotal = appliedTotal.add(result.applied);
//       remaining = result.remaining;
//     }

//     return { applied: appliedTotal, remaining };
//   }
// }
