// import { Injectable } from '@nestjs/common';
// import {
//   BonusApplicantStatusType,
//   ExportStatus,
//   Prisma,
//   WalletTransactionContext,
//   WalletType,
// } from '@prisma/client';
// import { Decimal } from '@prisma/client/runtime/library';
// import { WalletsService } from 'src/wallets/wallets.service';

// interface BonusDeductionOnBet {
//   userId: bigint;
//   betAmount: Decimal;
//   ctx: WalletTransactionContext;
//   narration?: string;
//   tx: Prisma.TransactionClient;
// }

// @Injectable()
// export class BonusUtilizationService {
//   constructor(private readonly wallet: WalletsService) {}

//   async deductBetAmount(data: BonusDeductionOnBet) {
//     const { userId, betAmount, tx, ctx, narration } = data;

//     if (betAmount.lte(0)) return;

//     const balance = await this.wallet.getBalanceOf(userId, WalletType.Bonus, {
//       tx,
//     });

//     if (balance.lt(betAmount)) {
//       throw new Error('Insufficient bonus balance');
//     }

//     let remainingBet = new Decimal(betAmount);

//     const applicants = await tx.bonusApplicant.findMany({
//       where: {
//         userId,
//         status: BonusApplicantStatusType.Pending,
//         awardedAmount: { gt: 0 },
//       },
//       orderBy: { id: 'asc' },
//     });

//     if (!applicants.length) {
//       throw new Error('No eligible bonus applicant found');
//     }

//     for (const applicant of applicants) {
//       if (remainingBet.lte(0)) break;

//       const deductable = Decimal.min(applicant.awardedAmount, remainingBet);

//       const newAwardedAmount = applicant.awardedAmount.sub(deductable);

//       const updatedApplicant = await tx.bonusApplicant.updateMany({
//         where: {
//           id: applicant.id,
//           status: BonusApplicantStatusType.Pending,
//         },
//         data: {
//           awardedAmount: newAwardedAmount,
//         },
//       });

//       if (updatedApplicant.count === 0) continue;

//       await this.wallet.subtractBalance(
//         userId,
//         deductable,
//         WalletType.Bonus,
//         false,
//         {
//           tx,
//           context: ctx,
//           entityId: applicant.id,
//           narration,
//         },
//       );

//       const turnovers = await tx.userTurnoverAccount.findMany({
//         where: {
//           bonusApplicant: applicant.id,
//           status: ExportStatus.Pending,
//         },
//         orderBy: { id: 'asc' },
//       });

//       let remaining = deductable;

//       for (const turnover of turnovers) {
//         if (remaining.lte(0)) break;

//         const remainingRequired = turnover.requiredTurnover.sub(
//           turnover.returnedAmount,
//         );

//         const applied = Decimal.min(remaining, remainingRequired);
//         const isTurnoverCompleted = applied.eq(remainingRequired);

//         const updatedTurnover = await tx.userTurnoverAccount.updateMany({
//           where: {
//             id: turnover.id,
//             status: ExportStatus.Pending,
//           },
//           data: {
//             returnedAmount: { increment: applied },
//             ...(isTurnoverCompleted && {
//               status: ExportStatus.Completed,
//             }),
//           },
//         });

//         if (updatedTurnover.count === 0) continue;

//         remaining = remaining.sub(applied);
//       }

//       //    awardedAmount = 0 AND all turnovers completed
//       if (newAwardedAmount.eq(0)) {
//         const pendingTurnovers = await tx.userTurnoverAccount.count({
//           where: {
//             bonusApplicant: applicant.id,
//             status: ExportStatus.Pending,
//           },
//         });

//         if (pendingTurnovers === 0) {
//           await tx.bonusApplicant.updateMany({
//             where: {
//               id: applicant.id,
//               status: BonusApplicantStatusType.Pending,
//             },
//             data: {
//               status: BonusApplicantStatusType.Approved,
//             },
//           });
//         }
//       }

//       remainingBet = remainingBet.sub(deductable);
//     }

//     if (remainingBet.gt(0)) {
//       throw new Error(
//         'Bet amount could not be fully settled from bonus applicants',
//       );
//     }

//     return { success: true };
//   }

//   async creditWinnings(data: BonusDeductionOnBet) {
//     const { userId, betAmount, tx, ctx, narration } = data;

//     if (betAmount.lte(0)) return;

//     await this.wallet.addBalance(userId, betAmount, WalletType.Bonus, false, {
//       tx,
//       context: ctx,
//       entityId: userId,
//       narration,
//     });

//     return { success: true };
//   }
// }
