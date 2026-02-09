import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ReportType } from './bet-reports.request';

export class CasinoProfitLossReportsRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by username' })
  @IsString()
  @IsOptional()
  searchByUserName?: string;

  @ApiPropertyOptional({ description: 'Search by userId' })
  @IsNumber()
  @IsOptional()
  searchByUserId?: number;

  @ApiPropertyOptional({ description: 'Transaction limit' })
  @IsNumber()
  @IsOptional()
  transactionLimit?: number;

  @ApiPropertyOptional({ enum: ReportType })
  @IsEnum(ReportType)
  @IsOptional()
  reportType?: ReportType;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;

  @ApiPropertyOptional({ description: 'upline path' })
  @IsString()
  @IsOptional()
  path: string;
}
