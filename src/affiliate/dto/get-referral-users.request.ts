import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsEnum, IsDate } from 'class-validator';
import { AffiliateStatus, ExportFormat } from '@prisma/client';

export class GetReferralUsersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({
    example: 'Active',
    enum: AffiliateStatus,
    description: 'Filter by referral status',
  })
  @IsOptional()
  @IsEnum(AffiliateStatus)
  status?: AffiliateStatus;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;
}
