import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  BonusApplicantStatusType,
  BonusCategory,
  ExportFormat,
} from '@prisma/client';

export class BonusStatementDTO extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: BonusApplicantStatusType })
  @IsEnum(BonusApplicantStatusType)
  @IsOptional()
  status?: BonusApplicantStatusType;

  @ApiPropertyOptional({ enum: BonusCategory })
  @IsEnum(BonusCategory)
  @IsOptional()
  type?: BonusCategory;

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
}
