import { ApiPropertyOptional } from '@nestjs/swagger';
import { BonusApplicantStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsInt } from 'class-validator';

export class ApproveBonusApplicantDto {
  @ApiPropertyOptional({ enum: BonusApplicantStatus })
  @IsEnum(BonusApplicantStatus)
  status: BonusApplicantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  installmentId?: number;
}
