import { Injectable } from '@nestjs/common';
import { UpsertBonusDto } from '../dto/upsert-bonus-by-category.dto';
import { BonusCategory } from '@prisma/client';

@Injectable()
export class BonusCategoryPayloadValidatorService {
  validateBonusByCategory(dto: UpsertBonusDto) {
    this.ensureFutureDateRange(dto);

    switch (dto.category) {
      case 'JoiningBonus':
        return this.validateJoiningBonus(dto);

      case 'DepositBonus':
        return this.validateDepositBonus(dto);

      case 'ReferralBonus':
        return this.validateReferralBonus(dto);

      default:
        throw new Error(`Unsupported bonus category: ${dto.category}`);
    }
  }

  /* ───────────── JOINING ───────────── */

  private validateJoiningBonus(dto: UpsertBonusDto) {
    if (dto.releaseType === 'PERCENTAGE') {
      if (dto.percentage === null) {
        throw new Error('PERCENTAGE requires percentage');
      }
    }

    if (dto.releaseType === 'FIXED') {
      if (dto.maxBonusAmount == null) {
        throw new Error('FIXED requires maxBonusAmount');
      }
    }

    this.ensureNoTurnover(dto);
    this.ensureNoReferral(dto);
    this.ensureNoFrequency(dto);
  }

  /* ───────────── DEPOSIT ───────────── */

  private validateDepositBonus(dto: UpsertBonusDto) {
    if (dto.turnoverFormula == null || dto.multiplier == null) {
      throw new Error('DepositBonus requires turnoverFormula and multiplier');
    }

    // frequency is ALLOWED here
    this.ensureNoReferral(dto);
  }

  /* ───────────── REFERRAL ───────────── */

  private validateReferralBonus(dto: UpsertBonusDto) {
    // ---------- REQUIRED ----------
    if (!dto.bonusEligibleRole || !dto.referralType) {
      throw new Error(
        'ReferralBonus requires bonusEligibleRole and referralType',
      );
    }

    this.ensureNoFrequency(dto);
  }

  /* ───────────── HELPERS ───────────── */

  private ensureNoReferral(dto: UpsertBonusDto) {
    if (
      dto.referrerPercentage != null ||
      dto.referrerMinBonusAmount != null ||
      dto.bonusEligibleRole != null ||
      dto.referralType != null
    ) {
      throw new Error('Referral fields are not allowed for this bonus type');
    }
  }

  private ensureNoTurnover(dto: UpsertBonusDto) {
    if (dto.turnoverFormula === null || dto.multiplier === null) {
      throw new Error('Turnover fields are not allowed for this bonus type');
    }
  }

  private ensureNoFrequency(dto: UpsertBonusDto) {
    if (dto.frequency != null) {
      throw new Error('Frequency can only be set for DepositBonus');
    }
  }

  private ensureFutureDateRange(dto: UpsertBonusDto) {
    const now = new Date();

    if (dto.startDate <= now || dto.endDate <= now) {
      throw new Error('StartDate and EndDate must be in the future');
    }

    if (dto.startDate >= dto.endDate) {
      throw new Error('StartDate must be earlier than EndDate');
    }
  }
}
