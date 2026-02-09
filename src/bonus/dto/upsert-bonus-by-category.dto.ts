import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalType,
  BonusEligibleRole,
  BonusStatus,
  Frequency,
  ReferralType,
  ReleaseType,
  TurnoverFormula,
  BetType,
  BonusCategory,
} from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  IsString,
  IsDateString,
} from 'class-validator';

export class UpsertBonusDto {
  /* ───────────── ID (UPSERT) ───────────── */

  @ApiPropertyOptional({ example: 101 })
  @IsOptional()
  @IsInt()
  id?: number;

  /* ───────────── CORE ───────────── */

  @ApiProperty({ enum: BonusCategory })
  @IsEnum(BonusCategory)
  category: BonusCategory;

  @ApiProperty({ example: 'Deposit Refill Bonus' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: BonusStatus })
  @IsOptional()
  @IsEnum(BonusStatus)
  status?: BonusStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vip?: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsDateString()
  startDate: string | Date;

  @ApiProperty({ example: '2025-12-31T23:59:59.000Z' })
  @IsDateString()
  endDate: string | Date;

  /* ───────────── RULES ───────────── */

  @ApiPropertyOptional({ enum: ApprovalType })
  @IsOptional()
  @IsEnum(ApprovalType)
  approvalType?: ApprovalType;

  @ApiPropertyOptional({ enum: Frequency })
  @IsOptional()
  @IsEnum(Frequency)
  frequency?: Frequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxApplicants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxPerUser?: number;

  /* ───────────── DEPOSIT / BONUS ───────────── */

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minDepositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxBonusAmount?: number;

  @ApiPropertyOptional({ enum: ReleaseType })
  @IsOptional()
  @IsEnum(ReleaseType)
  releaseType?: ReleaseType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage?: number;

  /* ───────────── TURNOVER ───────────── */

  @ApiPropertyOptional({ enum: TurnoverFormula })
  @IsOptional()
  @IsEnum(TurnoverFormula)
  turnoverFormula?: TurnoverFormula;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  multiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minOdd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxOdd?: number;

  @ApiPropertyOptional({ enum: BetType })
  @IsOptional()
  @IsEnum(BetType)
  betType?: BetType;

  /* ───────────── REFERRAL ───────────── */

  @ApiPropertyOptional({ enum: BonusEligibleRole })
  @IsOptional()
  @IsEnum(BonusEligibleRole)
  bonusEligibleRole?: BonusEligibleRole;

  @ApiPropertyOptional({ enum: ReferralType })
  @IsOptional()
  @IsEnum(ReferralType)
  referralType?: ReferralType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  referrerMinBonusAmount?: number;

  @ApiPropertyOptional({ enum: ReleaseType })
  @IsOptional()
  @IsEnum(ReleaseType)
  referrerReleaseType?: ReleaseType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  referrerPercentage?: number;

  /* ───────────── CLAIM RULES ───────────── */

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  installments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expireInDays?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  claimDays?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  claimMonths?: number[];

  @ApiPropertyOptional({ example: '2025-02-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  claimFrom?: string | Date;

  @ApiPropertyOptional({ example: '2025-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  claimTo?: string | Date;

  /* ───────────── GAME CATEGORIES ───────────── */

  @ApiPropertyOptional({
    description: 'Game category IDs this bonus applies to',
    example: [12, 45, 78],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  categories?: number[];
}
