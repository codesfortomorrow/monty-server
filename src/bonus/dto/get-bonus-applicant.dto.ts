import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalType,
  BonusApplicantStatus,
  BonusCategory,
  ExportFormat,
  ReleaseType,
} from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DateFilterWithPaginationRequest } from '@Common';
import { isBoolean } from 'lodash';

export class GetBonusApplicantsQueryDto extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ enum: BonusApplicantStatus })
  @IsOptional()
  @IsEnum(BonusApplicantStatus)
  status?: BonusApplicantStatus;

  @ApiPropertyOptional({ enum: BonusCategory })
  @IsOptional()
  @IsEnum(BonusCategory)
  category?: BonusCategory;

  @ApiPropertyOptional({ enum: ReleaseType })
  @IsOptional()
  @IsEnum(ReleaseType)
  releaseType?: ReleaseType;

  @ApiPropertyOptional({ enum: ApprovalType })
  @IsOptional()
  @IsEnum(ApprovalType)
  approvalType?: ApprovalType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: 'search by bonus name.' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isExport?: boolean;
}
