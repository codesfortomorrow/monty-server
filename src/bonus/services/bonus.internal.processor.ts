import { BaseService, UtilsService } from '@Common';
import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ApprovalType,
  Bet,
  BetStatusType,
  BetType,
  Bonus,
  BonusApplicant,
  BonusApplicantStatus,
  BonusCategory,
  BonusEligibleRole,
  BonusInstallment,
  CasinoRoundHistory,
  DepositWithdrawRequest,
  Frequency,
  Prisma,
  Referral,
  ReferralType,
  ReleaseType,
  TriggerEvent,
  TurnoverFormula,
  WalletTransactionContext,
  WalletType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { sportConfigFactory } from 'src/configs/sport.config';
import { PrismaService } from 'src/prisma';
import { getSportId } from 'src/utils/sports';
import { WalletsService } from 'src/wallets/wallets.service';

@Injectable()
export class BonusProcessor
  extends BaseService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private isProcessorIdle = true;
  private isShutDownInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletsService,
    private readonly utilService: UtilsService,
  ) {
    super();
  }

  async onModuleDestroy() {
    this.isShutDownInProgress = true;
    await this.utilService.waitUntilValue(() => this.isProcessorIdle, true);
    this.logger.log('info', 'Method not implemented.');
  }

  onApplicationBootstrap() {
    if (this.utilService.isMaster()) {
      this.processor();
    }
    this.logger.log('info', 'Method not implemented.');
  }

  async processor() {
    // Hard guard: never allow concurrent execution
    if (this.isProcessorIdle == false) {
      return;
    }

    if (this.isShutDownInProgress) {
      this.logger.log(
        'info',
        'Bonus Processor shutdown in progress, skipping run',
      );
      return;
    }

    this.isProcessorIdle = false;
    this.logger.log('info', 'Bonus Processor started...');

    try {
      await Promise.all([
        this.bonusClaimScheduler(),
        this.bonusExpireScheduler(),
        this.turnoverCalculateScheduler(),
      ]);
    } catch (error) {
      this.logger.log('error', 'Bonus Processor error', error);
    } finally {
      this.isProcessorIdle = true;
    }

    // Schedule next run only after finishing
    if (!this.isShutDownInProgress) {
      setTimeout(() => void this.processor(), 2500);
    }
  }

  // Event Emitters

  private async emitTurnOverEvent(
    userId: bigint,
    gameId: number,
    amount: Decimal,
    bet?: Bet,
    casino?: CasinoRoundHistory,
  ) {
    const isValidUser = await this.validateUser(Number(userId));
    if (!isValidUser) return;
    const applicants = await this.prisma.bonusApplicant.findMany({
      where: {
        userId,
        status: {
          in: [BonusApplicantStatus.PENDING, BonusApplicantStatus.ACTIVE],
        },
      },
    });
    console.log('Turnover Event', applicants);
    if (!applicants.length) return;
    await this.processTurnover(applicants, gameId, amount, bet, casino);
  }

  public async emitDepositEvent(
    userId: number,
    depositAmount: Decimal,
    depositId: number | null,
    ftd = false,
  ) {
    if (!userId || isNaN(userId)) return;

    const isValidUser = await this.validateUser(userId);
    if (!isValidUser) return;

    // ✅ CRITICAL FIX: Validate that the deposit record exists
    // const deposit = await this.prisma.depositWithdrawRequest.findUnique({
    //   where: { id: depositId },
    // });

    // if (!deposit) {
    //   console.error(`❌ Deposit record not found for depositId: ${depositId}`);
    //   return;
    // }

    // // ✅ CRITICAL FIX: Ensure userId matches the deposit record
    // if (Number(deposit.userId) !== userId) {
    //   console.error(
    //     `❌ User ID mismatch: expected ${userId}, got ${deposit.userId} for depositId: ${depositId}`,
    //   );
    //   return;
    // }

    // ✅ Use the actual deposit amount from the database
    const actualDepositAmount = Number(depositAmount);

    console.log('✅ Listen deposit event', {
      userId,
      depositId,
      ftd,
      requestedAmount: depositAmount.toNumber(),
      actualAmount: actualDepositAmount,
    });

    const joiningBonuses = await this.checkAvailableBonus(
      BonusCategory.JoiningBonus,
      userId,
    );

    console.log('joiningBonuses : ', joiningBonuses);

    const depositBonuses = await this.checkAvailableBonus(
      BonusCategory.DepositBonus,
      userId,
    );

    console.log('depositBonuses : ', depositBonuses);

    const referralBonuses = await this.checkAvailableBonus(
      BonusCategory.ReferralBonus,
      userId,
    );

    if (joiningBonuses.length > 0 && ftd) {
      console.log('✅ Processing joining bonus for user:', userId);
      await this.handleJoingingBonus(
        joiningBonuses,
        userId,
        actualDepositAmount, // ✅ Use actual amount
        depositId,
      );
    }

    if (depositBonuses.length > 0 && !ftd) {
      console.log('✅ Processing deposit bonus for user:', userId);
      await this.handleDepositBonus(
        depositBonuses,
        userId,
        actualDepositAmount, // ✅ Use actual amount
        depositId,
      );
    }

    if (referralBonuses.length > 0 && ftd) {
      const referral = await this.prisma.referral.findFirst({
        where: {
          refereeId: BigInt(userId),
        },
      });

      if (!referral) return;

      const updatedReferral = await this.prisma.referral.update({
        where: {
          id: referral.id,
        },
        data: {
          firstTimeDepositDone: true,
          firstTimeDepositId: depositId,
        },
      });

      console.log('✅ Processing referral bonus for user:', userId);
      await this.handleReferralBonus(referralBonuses, userId, updatedReferral);
    }
  }

  public async emitReferralEvent(userId: number, referralCode: string) {
    try {
      console.log('line 232', userId);
      if (!userId || isNaN(userId)) return;

      const isValidUser = await this.validateUser(userId);

      console.log('line 237', isValidUser);
      if (!isValidUser) return;

      // ✅ Find referrer by referral code
      const referrer = await this.prisma.user.findFirst({
        where: {
          referralCode,
        },
      });
      console.log('line 244 ');

      if (!referrer) return;

      // ✅ Prevent duplicate referral for same referee
      const existingReferral = await this.prisma.referral.findFirst({
        where: {
          refereeId: BigInt(userId),
        },
      });
      console.log('line 254 ');
      if (existingReferral) return;

      // ✅ Create referral (BigInt-safe)
      const referral = await this.prisma.referral.create({
        data: {
          referrerId: referrer.id, // already BigInt
          refereeId: BigInt(userId),
          firstTimeDepositDone: false,
          referredThrough: referralCode,
        },
      });
      console.log('line 266 ');

      // ✅ Fetch referral bonuses
      const bonuses = await this.checkAvailableBonus(
        BonusCategory.ReferralBonus,
        userId,
      );

      console.log('line 271 : ', bonuses);

      if (!bonuses.length) return;

      // ✅ Handle referral bonus
      await this.handleReferralBonus(bonuses, userId, referral);
    } catch (error) {
      console.error('Error resolving referral event:', error);
    }
  }

  // Calculations
  private async checkAvailableBonus(bonusType: string, userId: number) {
    const bonuses = await this.prisma.$queryRaw<any[]>(
      Prisma.sql`
      SELECT
        b.id,
        b.category,
        b.name,
        b.description,
        b.status,

        b.start_date      AS "startDate",
        b.end_date        AS "endDate",

        b.approval_type   AS "approvalType",
        b.frequency,

        b.max_applicants  AS "maxApplicants",
        b.max_per_user    AS "maxPerUser",

        b.min_deposit_amount AS "minDepositAmount",
        b.max_bonus_amount   AS "maxBonusAmount",

        b.release_type    AS "releaseType",
        b.percentage,
        b.turnover_formula AS "turnoverFormula",
        b.multiplier,

        b.min_odd         AS "minOdd",
        b.max_odd         AS "maxOdd",
        b.bet_type        AS "betType",

        b.installments,
        b.expire_in_days  AS "expireInDays",

        b.claim_days      AS "claimDays",
        b.claim_months    AS "claimMonths",

        b.claim_from      AS "claimFrom",
        b.claim_to        AS "claimTo",

        b.bonus_eligible_role AS "bonusEligibleRole",
        b.referral_type        AS "referralType",

        b.referrer_release_type   AS "referrerReleaseType",
        b.referrer_percentage     AS "referrerPercentage",
        b.referrer_min_bonus_amount AS "referrerMinBonusAmount",

        b.created_at AS "createdAt",
        b.updated_at AS "updatedAt",

        /* ───── Aggregates ───── */

        COALESCE(SUM(blc.claim_count), 0)::bigint AS "totalClaims",

        COALESCE(
          SUM(
            CASE
              WHEN blc.user_id = ${BigInt(userId)}
              THEN blc.claim_count
              ELSE 0
            END
          ),
          0
        )::bigint AS "userClaims",

        COUNT(DISTINCT blc.user_id)::bigint AS "totalClaimUsers"

      FROM bonus b
      LEFT JOIN bonus_limit_counter blc
        ON blc.bonus_id = b.id

      WHERE
        b.category = ${bonusType}
        AND b.status = 'active'
        AND b.start_date <= NOW()
        AND b.end_date >= NOW()

      GROUP BY b.id

     HAVING
  (
    b.max_applicants IS NULL
    OR
    (
      /* If user already claimed, skip applicant limit */
      COALESCE(
        SUM(
          CASE
            WHEN blc.user_id = ${BigInt(userId)}
            THEN blc.claim_count
            ELSE 0
          END
        ),
        0
      ) > 0
      OR COUNT(DISTINCT blc.user_id) < b.max_applicants
    )
  )
  AND (
    b.max_per_user IS NULL
    OR b.max_per_user = 0
    OR COALESCE(
        SUM(
          CASE
            WHEN blc.user_id = ${BigInt(userId)}
            THEN blc.claim_count
            ELSE 0
          END
        ),
        0
      ) < b.max_per_user
  )

    `,
    );

    return bonuses;
  }

  private calculateAwardAmount(bonus: Bonus, deposit?: number) {
    console.log('line 337 bonus: ', bonus);
    if (!bonus.maxBonusAmount) return 0;
    console.log('line 339 : ');
    if (bonus.releaseType == ReleaseType.FIXED.toLowerCase()) {
      return bonus.maxBonusAmount;
    }
    console.log('line 341 : ', bonus.maxBonusAmount);
    console.log('line 342  :', bonus.percentage);
    console.log('line 343  :', deposit);
    console.log('bonus.releaseType : ', bonus.releaseType);
    if (
      deposit &&
      bonus.percentage &&
      bonus.releaseType == ReleaseType.PERCENTAGE.toLowerCase()
    ) {
      console.log('line 351');
      return Number(
        Math.min(
          deposit * (bonus.percentage / 100),
          bonus.maxBonusAmount,
        ).toFixed(2),
      );
    }
    console.log('line 293 : ');

    return 0;
  }

  private calculateReferralAmount(bonus: Bonus, deposit?: number) {
    if (!bonus.referrerMinBonusAmount) return 0;
    if (bonus.referrerReleaseType == ReleaseType.FIXED.toLowerCase())
      return bonus.referrerMinBonusAmount;
    if (
      deposit &&
      bonus.referrerPercentage &&
      bonus.referrerReleaseType == ReleaseType.PERCENTAGE.toLowerCase()
    )
      return Number(
        Math.max(
          deposit * (bonus.referrerPercentage / 100),
          bonus.referrerMinBonusAmount,
        ).toFixed(2),
      );
    return 0;
  }

  private calculateTurnover(
    bonus: Bonus,
    deposit?: number,
    awardedAmount?: number,
  ) {
    const multiplier = bonus.multiplier ?? 1;
    if (
      bonus.turnoverFormula ===
      TurnoverFormula.BONUS_MULTIPLIER.toLocaleLowerCase()
    )
      return awardedAmount! * multiplier;
    if (
      deposit &&
      bonus.turnoverFormula ===
        TurnoverFormula.DEPOSIT_PLUS_BONUS_MULTIPLIER.toLocaleLowerCase()
    )
      return (deposit + awardedAmount!) * multiplier;
    return 0;
  }

  private async validateFrequency(
    bonus: Bonus,
    userId: number,
  ): Promise<boolean> {
    if (bonus.frequency === Frequency.EVERY.toLocaleLowerCase()) return true;

    // Define start & end date ranges based on frequency
    const now = new Date();
    let startDate: Date, endDate: Date;
    console.log('bonus.frequency line-469 : ', bonus.frequency);
    switch (bonus.frequency) {
      case Frequency.DAILY.toLocaleLowerCase(): {
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
        );
        endDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
        );
        break;
      }

      case Frequency.WEEKLY.toLocaleLowerCase(): {
        const currentDay = now.getDay(); // 0 (Sun) - 6 (Sat)
        const diffToMonday = (currentDay + 6) % 7; // shift week start to Monday
        startDate = new Date(now);
        startDate.setDate(now.getDate() - diffToMonday);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }

      case Frequency.MONTHLY.toLocaleLowerCase(): {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        break;
      }

      default:
        return true;
    }

    console.log(startDate, ' line 522 : ', endDate);

    const alreadyClaimed = await this.prisma.bonusApplicant.findFirst({
      where: {
        bonusId: bonus.id,
        userId: userId,
        awardedAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          notIn: [
            BonusApplicantStatus.REJECTED,
            BonusApplicantStatus.CANCELLED,
          ],
        },
      },
      select: { id: true }, // lightweight check
    });

    return !alreadyClaimed;
  }

  private async validateClaimTime(bonus: Bonus) {
    const now = new Date();

    // ✅ 1. Check claim days
    if (bonus.claimDays && bonus.claimDays.length > 0) {
      // JS getDay(): 0=Sunday → map to 7, otherwise 1-6
      const today = now.getDay() == 0 ? 7 : now.getDay();
      console.log('claim day at approve', today);
      if (!bonus.claimDays.includes(today)) {
        return false;
      }
    }

    // ✅ 2. Check claim months
    if (bonus.claimMonths && bonus.claimMonths.length > 0) {
      const currentMonth = now.getMonth() + 1; // JS months: 0-11
      console.log('claim month at approve', currentMonth);
      if (!bonus.claimMonths.includes(currentMonth)) {
        return false;
      }
    }

    // ✅ 3. Check claim time range (HH:mm:ss)
    if (bonus.claimFrom && bonus.claimTo) {
      const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

      const from =
        bonus.claimFrom.getHours() * 60 + bonus.claimFrom.getMinutes();
      const to = bonus.claimTo.getHours() * 60 + bonus.claimTo.getMinutes();

      console.log('Current time', currentTime, 'from', from, 'to', to);
      if (from <= to) {
        // Normal case: e.g. 09:00 → 18:00
        console.log('Inside if', currentTime < from || currentTime > to);
        if (currentTime < from || currentTime > to) {
          return false;
        }
      } else {
        // Overnight case: e.g. 22:00 → 02:00 (wraps past midnight)
        console.log('Inside else', currentTime < from && currentTime > to);
        if (currentTime < from && currentTime > to) {
          return false;
        }
      }
    }

    console.log('All cases passed in claim');
    return true; // Passed all checks
  }

  private async validateGameCategory(
    bonus: Bonus,
    gameId: number,
  ): Promise<boolean> {
    // 1️⃣ Find the game category by externalId
    const gameCategory = await this.prisma.gameCategory.findFirst({
      where: { externalId: gameId },
    });

    if (!gameCategory) {
      console.log(`Game with externalId ${gameId} not found`);
      return false;
    }

    // 2️⃣ Collect ancestor category IDs (including self)
    const categoryIds: number[] = [];
    let current: typeof gameCategory | null = gameCategory;

    while (current) {
      categoryIds.push(current.id);

      if (!current.parentId) break;

      current = await this.prisma.gameCategory.findUnique({
        where: { id: current.parentId },
      });
    }

    // 3️⃣ Check if bonus is linked with any ancestor category
    const matched = await this.prisma.bonusGameCategory.findFirst({
      where: {
        bonusId: bonus.id,
        categoryId: {
          in: categoryIds,
        },
      },
      // ✅ no `id` field exists anymore
      select: {
        bonusId: true,
        categoryId: true,
      },
    });

    return !!matched;
  }

  private validateBet(bonus: Bonus, gameId: number, bet?: Bet): boolean {
    if (![1, 2, 4, 7, 4339].includes(gameId)) return true;

    if (!bet) return false;

    const minOdd = bonus.minOdd ?? Number.NEGATIVE_INFINITY;
    const maxOdd = bonus.maxOdd ?? Number.POSITIVE_INFINITY;

    const odds = Number(bet.odds); // ✅ use odds not amount

    console.log('---------------');
    console.log('minOdd : ', minOdd);
    console.log('maxOdd : ', maxOdd);
    console.log('odds : ', odds);
    console.log('bet.betOn : ', bet.betOn);

    if (bonus.betType === BetType.Back) {
      return bet.betOn === BetType.Back && odds >= minOdd && odds <= maxOdd;
    }

    if (bonus.betType === BetType.Lay) {
      return bet.betOn === BetType.Lay && odds >= minOdd && odds <= maxOdd;
    }

    return odds >= minOdd && odds <= maxOdd;
  }

  private async validateReferral(
    bonus: Bonus,
    referral: Referral,
  ): Promise<boolean> {
    // Signup-based referral → always valid
    if (bonus.referralType == ReferralType.SIGNUP.toLocaleLowerCase())
      return true;

    // Deposit-based referral → must have FTD
    if (!referral.firstTimeDepositDone || !referral.firstTimeDepositId) {
      return false;
    }

    const deposit = await this.prisma.depositWithdrawRequest.findUnique({
      where: {
        id: referral.firstTimeDepositId,
      },
      select: {
        amount: true,
      },
    });

    if (!deposit) return false;

    // Validate minimum deposit amount
    if (
      deposit &&
      bonus.minDepositAmount &&
      bonus.minDepositAmount <= Number(deposit.amount)
    )
      return true;
    return false;
  }

  private async validateExpiry(applicant: BonusApplicant): Promise<boolean> {
    if (!applicant.expireAt) {
      return true;
    }

    const now = new Date();

    if (applicant.expireAt <= now) {
      // Mark expired if not already
      if (applicant.status !== BonusApplicantStatus.EXPIRED) {
        const updatedApplicant = await this.prisma.bonusApplicant.update({
          where: {
            id: applicant.id,
          },
          data: {
            status: BonusApplicantStatus.EXPIRED,
          },
        });

        await this.processExpireBonus(updatedApplicant);
      }

      return false;
    }

    return true;
  }

  private async validateUser(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: BigInt(userId),
      },
      include: {
        role: true,
      },
    });
    console.log('line 754 : ', user);
    if (!user) return false;

    return user.role?.name == 'USER';
  }

  // Handler
  private async handleJoingingBonus(
    bonuses: Bonus[],
    userId: number,
    depositAmount: number,
    depositId: number | null,
  ) {
    let deposit: DepositWithdrawRequest | null = null;
    if (depositId) {
      deposit = await this.prisma.depositWithdrawRequest.findUnique({
        where: {
          id: depositId,
        },
      });

      console.log('Inside handler deposit', deposit);
      if (!deposit) return;

      // Ensure deposit amount is accurate
      const depositAmountFromDb = Number(deposit.amount);

      if (depositAmount !== depositAmountFromDb) {
        depositAmount = depositAmountFromDb;
      }
      console.log('deposit amount', depositAmount);
    }

    for (const bonus of bonuses) {
      if (
        bonus.minDepositAmount !== null &&
        bonus.minDepositAmount !== undefined &&
        depositAmount < bonus.minDepositAmount
      ) {
        continue;
      }

      console.log('bonus min deposit', bonus.minDepositAmount);

      await this.processJoiningBonus(bonus, userId, depositAmount, deposit);
    }
  }

  private async handleDepositBonus(
    bonuses: Bonus[],
    userId: number,
    depositAmount: number,
    depositId: number | null,
  ) {
    let deposit: DepositWithdrawRequest | null = null;
    if (depositId) {
      deposit = await this.prisma.depositWithdrawRequest.findUnique({
        where: { id: depositId },
      });

      if (!deposit) return;

      // Convert Prisma Decimal → number
      const dbAmount = Number(deposit.amount);

      // Ensure deposit amount is accurate
      if (depositAmount !== dbAmount) {
        depositAmount = dbAmount;
      }
    }
    for (const bonus of bonuses) {
      // Minimum deposit validation
      if (
        bonus.minDepositAmount != null &&
        depositAmount < bonus.minDepositAmount
      ) {
        continue;
      }

      // Frequency validation
      const isValid = await this.validateFrequency(bonus, userId);
      console.log('line 809 : ', isValid);
      if (!isValid) continue;
      console.log('line 811 : ');
      // Process bonus
      this.processDepositBonus(bonus, userId, depositAmount, deposit);
    }
  }

  private async handleReferralBonus(
    bonuses: Bonus[],
    userId: number,
    referral: Referral,
  ) {
    try {
      for (const bonus of bonuses) {
        console.log('referral.type : ', bonus.referralType);
        const isValid = await this.validateReferral(bonus, referral);

        console.log('referral line 827 : ', isValid);
        if (!isValid) continue;

        await this.prisma.$transaction(async (tx) => {
          const deposit = referral.firstTimeDepositId
            ? await tx.depositWithdrawRequest.findUnique({
                where: { id: referral.firstTimeDepositId },
              })
            : null;

          const depositAmount = deposit?.amount
            ? deposit.amount.toNumber()
            : undefined;

          const refereeAwardedAmount = this.calculateAwardAmount(
            bonus,
            depositAmount,
          );

          const referrerAwardedAmount = this.calculateReferralAmount(
            bonus,
            depositAmount,
          );
          console.log(
            'line 851 bonus.bonusEligibleRole : ',
            bonus.bonusEligibleRole,
          );
          // Award referee only
          if (
            bonus.bonusEligibleRole ==
            BonusEligibleRole.REFEREE.toLocaleLowerCase()
          ) {
            await this.processReferralBonus(
              bonus,
              referral,
              Number(referral.refereeId),
              refereeAwardedAmount,
              tx,
              depositAmount,
            );
            return;
          }

          // Award referrer only
          if (
            bonus.bonusEligibleRole ==
            BonusEligibleRole.REFERRER.toLocaleLowerCase()
          ) {
            await this.processReferralBonus(
              bonus,
              referral,
              Number(referral.referrerId),
              referrerAwardedAmount,
              tx,
              depositAmount,
            );
            return;
          }
          console.log('line 899 : ');
          // Award both
          await this.processReferralBonus(
            bonus,
            referral,
            Number(referral.refereeId),
            refereeAwardedAmount,
            tx,
            depositAmount,
          );

          await this.processReferralBonus(
            bonus,
            referral,
            Number(referral.referrerId),
            referrerAwardedAmount,
            tx,
            depositAmount,
          );
        });
      }
    } catch (error) {
      console.error('Error to process Referral Bonus:', error);
    }
  }
  // Processors

  private async processJoiningBonus(
    bonus: Bonus,
    userId: number,
    depositAmount: number,
    deposit: DepositWithdrawRequest | null,
  ) {
    try {
      console.log('line 776 : ');
      await this.prisma.$transaction(async (tx) => {
        console.log('line 781 : ', bonus);
        const awardedAmount = this.calculateAwardAmount(bonus, depositAmount);
        const turnoverRequired = this.calculateTurnover(
          bonus,
          depositAmount,
          awardedAmount,
        );
        console.log('turnoverRequired : ', turnoverRequired);
        console.log('awardedAmount : ', awardedAmount);

        const applicant = await tx.bonusApplicant.create({
          data: {
            userId,
            bonusId: bonus.id,
            triggerEvent: TriggerEvent.JOINING,
            awardedAmount,
            turnoverRequired,
            turnoverCompleted: 0,
            awardedAt: new Date(),
            expireAt: new Date(
              Date.now() + (bonus.expireInDays ?? 30) * 24 * 60 * 60 * 1000,
            ),
            timesClaimed: 0,
            status: BonusApplicantStatus.PENDING,
            depositId: deposit ? deposit.id : null,
          },
        });

        console.log('line 804 :');

        // ---------------- Installments ----------------
        if (bonus.installments && bonus.installments > 1) {
          const baseAmount = Number(
            (awardedAmount / bonus.installments).toFixed(2),
          );

          let accumulated = 0;
          const installments = [];

          for (let i = 1; i <= bonus.installments; i++) {
            const amount =
              i == bonus.installments
                ? Number((awardedAmount - accumulated).toFixed(2))
                : baseAmount;

            installments.push({
              bonusApplicantId: applicant.id,
              installmentNo: i,
              amount,
              status: BonusApplicantStatus.PENDING,
            });

            accumulated += amount;
          }

          await tx.bonusInstallment.createMany({
            data: installments,
          });
        }

        console.log('line 836 :');

        // ---------------- Audit Log ----------------
        await tx.bonusAuditLog.create({
          data: {
            bonusId: bonus.id,
            userId,
            action: 'Awarded Joining Bonus',
          },
        });

        // ---------------- Wallet Credit ----------------
        await this.walletService.addBalance(
          userId, // bigint | number
          new Decimal(awardedAmount), // Prisma.Decimal
          WalletType.Bonus, // wallet type
          false, // settlement flag, default false
          {
            tx, // Prisma transaction client from $transaction
            context: WalletTransactionContext.JoiningBonus, // your custom context
            entityId: deposit ? deposit.id : undefined, // optional, reference deposit
            narration: 'Joining Bonus credited', // optional narration
          },
        );

        // ---------------- Limit Counter ----------------
        await tx.bonusLimitCounter.create({
          data: {
            bonusId: bonus.id,
            userId,
            claimCount: 1,
          },
        });
      });
    } catch (error) {
      console.error('Error to process Joining Bonus:', error);
    }
  }

  private async processDepositBonus(
    bonus: Bonus,
    userId: number,
    depositAmount: number,
    deposit: DepositWithdrawRequest | null,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Calculate awarded amount
        const awardedAmount = this.calculateAwardAmount(bonus, depositAmount);

        // Create BonusApplicant
        const applicant = await tx.bonusApplicant.create({
          data: {
            userId,
            bonusId: bonus.id,
            triggerEvent: TriggerEvent.DEPOSIT,
            awardedAmount,
            turnoverRequired: this.calculateTurnover(
              bonus,
              depositAmount,
              awardedAmount,
            ),
            turnoverCompleted: 0,
            awardedAt: new Date(),
            expireAt: new Date(
              Date.now() + (bonus.expireInDays ?? 30) * 24 * 60 * 60 * 1000,
            ),
            timesClaimed: 0,
            status: BonusApplicantStatus.PENDING,
            depositId: deposit ? deposit.id : null,
          },
        });

        // Create installments if bonus is installment-based
        if (bonus.installments && bonus.installments > 1) {
          let installmentAmount = Number(
            (awardedAmount / bonus.installments).toFixed(2),
          );
          const installments = [];
          let accumulated = 0;

          for (let i = 1; i <= bonus.installments; i++) {
            if (i == bonus.installments) {
              installmentAmount = Number(
                (awardedAmount - accumulated).toFixed(2),
              );
            }
            installments.push({
              bonusApplicantId: applicant.id,
              installmentNo: i,
              amount: installmentAmount,
              status: BonusApplicantStatus.PENDING,
            });
            accumulated += installmentAmount;
          }

          await tx.bonusInstallment.createMany({ data: installments });
        }

        // Create audit log
        await tx.bonusAuditLog.create({
          data: {
            bonusId: bonus.id,
            userId,
            action: 'Awarded Deposit Bonus',
            details: applicant as any,
          },
        });

        // Add bonus to wallet
        await this.walletService.addBalance(
          userId,
          new Decimal(awardedAmount),
          WalletType.Bonus,
          false, // settlement
          {
            tx,
            context: WalletTransactionContext.Bonus,
            entityId: deposit ? deposit.id : undefined,
            narration: 'Deposit Bonus credited',
          },
        );

        // Update or create BonusLimitCounter
        const existing = await tx.bonusLimitCounter.findUnique({
          where: { bonusId_userId: { bonusId: bonus.id, userId } },
        });

        if (existing) {
          await tx.bonusLimitCounter.update({
            where: { bonusId_userId: { bonusId: bonus.id, userId } },
            data: { claimCount: { increment: 1 } },
          });
        } else {
          await tx.bonusLimitCounter.create({
            data: {
              bonusId: bonus.id,
              userId,
              claimCount: 1,
            },
          });
        }
      });
    } catch (error) {
      console.log('Error to process Deposit Bonus: ', error);
    }
  }

  private async processReferralBonus(
    bonus: Bonus,
    referral: Referral,
    userId: number,
    awardedAmount: number,
    tx: Prisma.TransactionClient,
    depositAmount?: number,
  ) {
    console.log('line 1147 :');
    // 1. Create BonusApplicant
    const applicant = await tx.bonusApplicant.create({
      data: {
        userId,
        bonusId: bonus.id,
        triggerEvent: TriggerEvent.REFERRAL,
        awardedAmount,
        turnoverRequired: this.calculateTurnover(
          bonus,
          depositAmount,
          awardedAmount,
        ),
        turnoverCompleted: 0,
        awardedAt: new Date(),
        expireAt: new Date(
          Date.now() + (bonus.expireInDays ?? 30) * 24 * 60 * 60 * 1000,
        ),
        timesClaimed: 0,
        status: BonusApplicantStatus.PENDING,
        depositId: referral.firstTimeDepositId ?? undefined,
      },
    });

    console.log('applicant 1167:', applicant.turnoverRequired);

    // 2. Create installments if bonus is installment-based
    if (bonus.installments && bonus.installments > 1) {
      let installmentAmount = Number(
        (awardedAmount / bonus.installments).toFixed(2),
      );
      const installments: Prisma.BonusInstallmentCreateManyInput[] = [];
      let accumulated = 0;

      for (let i = 1; i <= bonus.installments; i++) {
        if (i == bonus.installments) {
          installmentAmount = Number((awardedAmount - accumulated).toFixed(2));
        }
        installments.push({
          bonusApplicantId: applicant.id,
          installmentNo: i,
          amount: installmentAmount,
          status: BonusApplicantStatus.PENDING,
        });
        accumulated += installmentAmount;
      }

      await tx.bonusInstallment.createMany({ data: installments });
    }

    // 3. Create audit log
    await tx.bonusAuditLog.create({
      data: {
        bonusId: bonus.id,
        userId,
        action: 'Awarded Referral Bonus',
        details: applicant as any,
      },
    });

    await this.walletService.addBalance(
      userId,
      new Decimal(awardedAmount),
      WalletType.Bonus,
      false, // settlement
      {
        tx,
        context: WalletTransactionContext.Bonus,
        entityId: referral.firstTimeDepositId
          ? BigInt(referral.firstTimeDepositId)
          : undefined,
        narration: 'Referral Bonus credited',
      },
    );

    // 5. Update or create BonusLimitCounter
    const existing = await tx.bonusLimitCounter.findUnique({
      where: { bonusId_userId: { bonusId: bonus.id, userId } },
    });

    if (existing) {
      await tx.bonusLimitCounter.update({
        where: { bonusId_userId: { bonusId: bonus.id, userId } },
        data: { claimCount: { increment: 1 } },
      });
    } else {
      await tx.bonusLimitCounter.create({
        data: {
          bonusId: bonus.id,
          userId,
          claimCount: 1,
        },
      });
    }
  }

  private async processTurnover(
    applicants: BonusApplicant[],
    gameId: number,
    amount: Decimal,
    bet?: Bet,
    casino?: CasinoRoundHistory,
  ) {
    if (!amount || Number(amount) <= 0) return;

    // ✅ Always process oldest first
    const sortedApplicants = [...applicants].sort(
      (a, b) => Number(a.id) - Number(b.id),
    );

    let remainingAmount = Number(amount);
    let approvedApplicant: BonusApplicant | null = null;

    for (const applicant of sortedApplicants) {
      if (remainingAmount <= 0) break;

      const bonus = await this.prisma.bonus.findUnique({
        where: { id: applicant.bonusId },
      });
      if (!bonus) continue;

      const isValidGame = await this.validateGameCategory(bonus, gameId);
      const isValidBet = this.validateBet(bonus, gameId, bet);
      const isValid = await this.validateExpiry(applicant);

      if (!isValidGame || !isValidBet || !isValid) continue;

      await this.prisma.$transaction(async (tx) => {
        const freshApplicant = await tx.bonusApplicant.findUnique({
          where: { id: applicant.id },
        });

        if (!freshApplicant) return;

        const remainingTurnover =
          Number(freshApplicant.turnoverRequired) -
          Number(freshApplicant.turnoverCompleted);

        if (remainingTurnover <= 0) return;

        // ✅ Apply only required turnover, not full bet blindly
        const applyAmount = Math.min(remainingAmount, remainingTurnover);

        const updatedApplicant = await tx.bonusApplicant.update({
          where: { id: applicant.id },
          data: {
            turnoverCompleted: {
              increment: applyAmount,
            },
          },
        });

        remainingAmount -= applyAmount;

        // ✅ Mark bet/casino once turnover applied
        if (bet) {
          await tx.bet.update({
            where: { id: bet.id },
            data: { isTurnOverCalculated: true },
          });
        }

        if (casino) {
          await tx.casinoRoundHistory.update({
            where: { id: casino.id },
            data: { isTurnOverCalculated: true },
          });
        }

        const {
          turnoverCompleted,
          turnoverRequired,
          timesClaimed,
          timesRejected,
        } = updatedApplicant;

        if (!turnoverCompleted || !turnoverRequired) return;

        const isCompleted =
          Number(turnoverCompleted) >= Number(turnoverRequired);

        const isAuto = bonus.approvalType === ApprovalType.AUTO;

        const status = isAuto
          ? BonusApplicantStatus.APPROVED
          : BonusApplicantStatus.COMPLETED;

        const approveAt = isAuto ? new Date() : undefined;

        // ================= INSTALLMENT LOGIC (UNCHANGED) =================
        if (bonus.installments && bonus.installments > 1) {
          const completeInstallment = Math.floor(
            Number(turnoverCompleted) /
              (Number(turnoverRequired) / bonus.installments),
          );

          const installments = await tx.bonusInstallment.findMany({
            where: { bonusApplicantId: updatedApplicant.id },
            orderBy: { installmentNo: 'asc' },
          });

          for (
            let i = timesClaimed + timesRejected;
            i < Math.min(bonus.installments, completeInstallment);
            i++
          ) {
            const installment = installments[i];
            if (installment) {
              await tx.bonusInstallment.update({
                where: { id: installment.id },
                data: { status, releaseDate: approveAt },
              });
            }
          }

          if (isCompleted) {
            const finalApplicant = await tx.bonusApplicant.update({
              where: { id: updatedApplicant.id },
              data: {
                status,
                approvalAt: approveAt,
                turnoverCompleted: turnoverRequired,
              },
            });

            if (isAuto) approvedApplicant = finalApplicant;
          } else {
            await tx.bonusApplicant.update({
              where: { id: updatedApplicant.id },
              data: { status: BonusApplicantStatus.ACTIVE },
            });
          }
        }
        // ================= NON-INSTALLMENT =================
        else if (isCompleted) {
          const finalApplicant = await tx.bonusApplicant.update({
            where: { id: updatedApplicant.id },
            data: {
              status,
              approvalAt: approveAt,
              turnoverCompleted: turnoverRequired,
            },
          });

          if (isAuto) approvedApplicant = finalApplicant;
        }
      });

      // ✅ Only ONE applicant should consume this bet ideally
      if (remainingAmount <= 0) break;
    }

    // ✅ Call approval service ONLY for AUTO
    if (approvedApplicant) {
      await this.processApprovedBonus(approvedApplicant);
    }
  }

  public async processApprovedBonus(bonusApplicant: BonusApplicant | null) {
    if (!bonusApplicant?.id) return;

    bonusApplicant = await this.prisma.bonusApplicant.findUnique({
      where: { id: bonusApplicant.id },
    });
    if (!bonusApplicant) return;

    const bonus = await this.prisma.bonus.findUnique({
      where: { id: bonusApplicant.bonusId },
    });

    if (!bonus) {
      await this.prisma.bonusApplicant.update({
        where: { id: bonusApplicant.id },
        data: { status: BonusApplicantStatus.CANCELLED },
      });
      return;
    }

    const isValidTime = await this.validateClaimTime(bonus);
    if (!isValidTime) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        const installments = await tx.bonusInstallment.findMany({
          where: { bonusApplicantId: bonusApplicant.id },
          orderBy: { installmentNo: 'asc' },
        });

        // Handle installments
        if (installments.length > 0) {
          for (const installment of installments) {
            if (installment.status !== BonusApplicantStatus.APPROVED) continue;

            // Mark installment claimed
            await tx.bonusInstallment.update({
              where: { id: installment.id },
              data: { status: BonusApplicantStatus.CLAIMED },
            });

            // Wallet operations
            await this.walletService.subtractBalance(
              bonusApplicant.userId,
              new Prisma.Decimal(installment.amount),
              WalletType.Bonus, // use enum instead of string
              false, // settlement = false
              {
                tx, // Prisma transaction
                context: WalletTransactionContext.Bonus, // provide proper context
                entityId: bonusApplicant.id, // optional, can be bonusApplicant.id
                narration: `Subtract bonus installment-${installment.installmentNo}`,
              },
            );

            const updatedMainWallet = await this.walletService.addBalance(
              bonusApplicant.userId,
              new Prisma.Decimal(installment.amount),
              WalletType.Main, // use enum
              false, // settlement = false
              {
                tx,
                context: WalletTransactionContext.Bonus, // same context for tracking
                entityId: BigInt(bonusApplicant.id),
                narration: `Add bonus installment-${installment.installmentNo} to main wallet`,
              },
            );

            // Increment timesClaimed
            await tx.bonusApplicant.update({
              where: { id: bonusApplicant.id },
              data: { timesClaimed: { increment: 1 } },
            });

            console.log('line 1389 : ', Date.now());

            // Create transaction log
            await tx.walletTransactions.create({
              data: {
                walletId: updatedMainWallet.id, // wallet related to the user
                amount: new Prisma.Decimal(installment.amount), // Prisma.Decimal
                availableBalance: updatedMainWallet?.amount ?? 0, // new balance after credit
                type: 'Credit', // WalletTransactionType enum
                entityId: bonusApplicant.id.toString(), // as string
                context: WalletTransactionContext.Bonus, // enum
                meta: {}, // optional JSON
                narration: `You received a ${bonus.category} bonus installment-${installment.installmentNo} of ${installment.amount}.`,
                nonce: Date.now(), // simple unique nonce
                status: 'Confirmed', // WalletTransactionStatus enum
                remark: `Bonus installment-${installment.installmentNo}`,
                timestamp: new Date(),
                fromAccount: 'SYSTEM', // optional
                toAccount: bonusApplicant.userId.toString(), // optional
                isCommissionSettled: false,
                currencyId: 1, // set currencyId appropriately
                isBonusProcessed: true,
              },
            });
            console.log('line 1412 : ');

            // Bonus audit log
            await tx.bonusAuditLog.create({
              data: {
                bonusId: bonus.id,
                userId: bonusApplicant.userId,
                action: 'Installment Claimed',
                details: installment,
              },
            });
          }

          // Update bonusApplicant status if all installments claimed
          const refreshedApplicant = await tx.bonusApplicant.findUnique({
            where: { id: bonusApplicant.id },
          });

          if (
            installments.length ==
            refreshedApplicant!.timesClaimed + refreshedApplicant!.timesRejected
          ) {
            await tx.bonusApplicant.update({
              where: { id: bonusApplicant.id },
              data: { status: BonusApplicantStatus.CLAIMED },
            });
          }
        } else {
          // Single bonus
          await tx.bonusApplicant.update({
            where: { id: bonusApplicant.id },
            data: { status: BonusApplicantStatus.CLAIMED },
          });

          await this.walletService.subtractBalance(
            bonusApplicant.userId,
            new Prisma.Decimal(bonusApplicant.awardedAmount),
            WalletType.Bonus,
            false,
            {
              tx,
              context: WalletTransactionContext.Bonus,
              narration: 'Bonus converted to main wallet',
            },
          );

          await this.walletService.addBalance(
            bonusApplicant.userId,
            new Prisma.Decimal(bonusApplicant.awardedAmount),
            WalletType.Main,
            false,
            {
              tx,
              context: WalletTransactionContext.Bonus,
              narration: `You received a ${bonus.category} bonus of ${bonusApplicant.awardedAmount}.`,
              fromAccount: 'BONUS_WALLET',
              toAccount: 'MAIN_WALLET',
            },
          );

          // console.log('line 1468 : ----------------');
          // await tx.walletTransactions.create({
          //   data: {
          //     walletId: updatedMainWallet.id, // MAIN wallet ID
          //     amount: new Prisma.Decimal(bonusApplicant.awardedAmount),
          //     availableBalance: updatedMainWallet.amount,
          //     type: 'Credit',
          //     entityId: bonusApplicant.id.toString(),
          //     context: WalletTransactionContext.Bonus,
          //     narration: `You received a ${bonus.category} bonus of ${bonusApplicant.awardedAmount}.`,
          //     remark: `Bonus claimed`,
          //     nonce: Date.now(), // must be unique per wallet
          //     status: 'Confirmed',
          //     timestamp: new Date(),
          //     currencyId: updatedMainWallet.currencyId,
          //     fromAccount: 'BONUS_WALLET',
          //     toAccount: 'MAIN_WALLET',
          //     isBonusProcessed: true,
          //   },
          // });
          // console.log('line 1488 : ----------------');

          await tx.bonusAuditLog.create({
            data: {
              bonusId: bonus.id,
              userId: bonusApplicant.userId,
              action: 'Bonus Claimed',
            },
          });
        }
      });
    } catch (error) {
      console.error('Process Approved Bonus Error:', error);
    }
  }

  private async processExpireBonus(bonusApplicant: BonusApplicant) {
    if (bonusApplicant.status !== BonusApplicantStatus.EXPIRED) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        const installments = await tx.bonusInstallment.findMany({
          where: { bonusApplicantId: bonusApplicant.id },
        });

        if (installments.length > 0) {
          for (const installment of installments) {
            if (installment.status == BonusApplicantStatus.PENDING) {
              const updatedInstallment = await tx.bonusInstallment.update({
                where: { id: installment.id },
                data: { status: BonusApplicantStatus.EXPIRED },
              });

              await this.walletService.subtractBalance(
                bonusApplicant.userId,
                new Decimal(installment.amount),
                WalletType.Bonus,
                false,
                {
                  tx,
                  context: WalletTransactionContext.Bonus,
                  narration: 'Bonus installment Expired',
                },
              );

              await tx.bonusAuditLog.create({
                data: {
                  bonusId: bonusApplicant.bonusId,
                  userId: bonusApplicant.userId,
                  action: 'Installment Expired',
                  details: updatedInstallment,
                },
              });
            }
          }
        } else {
          // Single bonus
          await this.walletService.subtractBalance(
            bonusApplicant.userId,
            new Decimal(bonusApplicant.awardedAmount),
            WalletType.Bonus,
            false,
            {
              tx,
              context: WalletTransactionContext.Bonus,
              narration: 'Bonus Expired',
            },
          );

          await tx.bonusAuditLog.create({
            data: {
              bonusId: bonusApplicant.bonusId,
              userId: bonusApplicant.userId,
              action: 'Bonus Expired',
            },
          });
        }
      });
    } catch (error) {
      console.error('Error processing expired bonus:', error);
    }
  }

  public async processRejectBonus(
    bonusApplicant: BonusApplicant,
    installment?: BonusInstallment,
    reason?: string,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        if (installment) {
          if (installment.status == BonusApplicantStatus.REJECTED) {
            const updatedApplicant = await tx.bonusApplicant.update({
              where: { id: bonusApplicant.id },
              data: { timesRejected: { increment: 1 } },
            });

            const installmentCount = await tx.bonusInstallment.count({
              where: { bonusApplicantId: updatedApplicant.id },
            });

            if (installmentCount == updatedApplicant.timesRejected) {
              await tx.bonusApplicant.update({
                where: { id: updatedApplicant.id },
                data: { status: BonusApplicantStatus.REJECTED },
              });
            } else if (
              installmentCount ==
                updatedApplicant.timesClaimed +
                  updatedApplicant.timesRejected &&
              updatedApplicant.timesClaimed > 0
            ) {
              await tx.bonusApplicant.update({
                where: { id: bonusApplicant.id },
                data: { status: BonusApplicantStatus.CLAIMED },
              });
            }

            await this.walletService.subtractBalance(
              bonusApplicant.userId,
              new Decimal(installment.amount),

              WalletType.Bonus,
              false,
              {
                tx,
                context: WalletTransactionContext.Bonus,
                narration: reason,
              },
            );

            await tx.bonusAuditLog.create({
              data: {
                bonusId: bonusApplicant.bonusId,
                userId: bonusApplicant.userId,
                action: 'Installment Rejected',
                details: installment,
              },
            });
          }
        } else if (bonusApplicant.status == BonusApplicantStatus.REJECTED) {
          await this.walletService.subtractBalance(
            bonusApplicant.userId,
            new Decimal(bonusApplicant.awardedAmount),

            WalletType.Bonus,
            false,
            {
              tx,
              context: WalletTransactionContext.Bonus,
              narration: reason,
            },
          );

          await tx.bonusAuditLog.create({
            data: {
              bonusId: bonusApplicant.bonusId,
              userId: bonusApplicant.userId,
              action: 'Bonus Rejected',
            },
          });
        }
      });
    } catch (error) {
      console.error('Error processing rejected bonus:', error);
    }
  }

  // ---------------- Schedulers ----------------

  public async bonusClaimScheduler() {
    try {
      const approvedApplicants = await this.prisma.bonusApplicant.findMany({
        where: {
          status: {
            in: [
              BonusApplicantStatus.APPROVED,
              BonusApplicantStatus.ACTIVE,
              BonusApplicantStatus.COMPLETED,
            ],
          },
        },
      });

      for (const applicant of approvedApplicants) {
        if (applicant.status == BonusApplicantStatus.APPROVED) {
          console.log('Bonus Claim Scheduler applicant', applicant);
          await this.processApprovedBonus(applicant);
        } else {
          const count = await this.prisma.bonusInstallment.count({
            where: {
              bonusApplicantId: applicant.id,
              status: {
                in: [
                  BonusApplicantStatus.APPROVED,
                  BonusApplicantStatus.CLAIMED,
                ],
              },
            },
          });

          if (applicant.timesClaimed < count) {
            await this.processApprovedBonus(applicant);
          }
        }
      }
    } catch (error) {
      console.error('Error in bonusClaimScheduler:', error);
    }
  }

  public async bonusExpireScheduler() {
    try {
      const applicants = await this.prisma.bonusApplicant.findMany({
        where: {
          status: {
            in: [BonusApplicantStatus.PENDING, BonusApplicantStatus.ACTIVE],
          },
        },
      });

      for (const applicant of applicants) {
        await this.validateExpiry(applicant);
      }
    } catch (error) {
      console.error('Error in bonusExpireScheduler:', error);
    }
  }

  public async turnoverCalculateScheduler() {
    console.log('Running Turnover Scheduler');

    // Get distinct applicants with pending/active bonuses
    const applicants = await this.prisma.bonusApplicant.findMany({
      where: {
        status: {
          in: [BonusApplicantStatus.PENDING, BonusApplicantStatus.ACTIVE],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const applicant of applicants) {
      // Bets
      const bets = await this.prisma.bet.findMany({
        where: {
          userId: applicant.userId,
          isTurnOverCalculated: false,
          placedAt: { gte: applicant.awardedAt }, // assuming awardedAt is Date
          status: { in: [BetStatusType.Won, BetStatusType.Lost] },
        },
        orderBy: { placedAt: 'asc' },
      });

      for (const bet of bets) {
        const sportConfig = sportConfigFactory();
        const sportsMap = sportConfig.sports;

        await this.emitTurnOverEvent(
          applicant.userId,
          getSportId(sportsMap, bet.sport)!,
          bet.amount,
          bet,
        );
      }

      // Casino rounds
      const casinos = await this.prisma.casinoRoundHistory.findMany({
        where: {
          userId: applicant.userId,
          isTurnOverCalculated: false,
          createdAt: { gte: applicant.awardedAt },
          status: { in: [BetStatusType.Won, BetStatusType.Lost] },
        },
        include: {
          casinoGame: {
            select: {
              id: true,
              externalId: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const casino of casinos) {
        if (!casino.casinoGame) continue;
        await this.emitTurnOverEvent(
          applicant.userId,
          Number(casino.casinoGame.externalId),
          casino.totalBets,
          undefined,
          casino,
        );
      }
    }
  }
}
