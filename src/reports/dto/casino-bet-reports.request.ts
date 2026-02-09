import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BetStatusType, ExportFormat } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ReportType } from './bet-reports.request';

export class CasinoBetReportsRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by username' })
  @IsString()
  @IsOptional()
  searchByUserName?: string;

  @ApiPropertyOptional({ description: 'Search by userId' })
  @IsNumber()
  @IsOptional()
  searchByUserId?: number;

  @ApiPropertyOptional({ description: 'Search by gameId' })
  @IsNumber()
  @IsOptional()
  searchByGameId?: number;

  @ApiPropertyOptional({ description: 'Search by game or provider name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by betId' })
  @IsNumber()
  @IsOptional()
  betId?: number;

  @ApiPropertyOptional({ description: 'Filter by gameId' })
  @IsNumber()
  @IsOptional()
  gameId?: number;

  @ApiPropertyOptional({ enum: BetStatusType, description: 'Filter by status' })
  @IsEnum(BetStatusType)
  @IsOptional()
  status?: BetStatusType;

  @ApiPropertyOptional({ enum: ReportType })
  @IsEnum(ReportType)
  @IsOptional()
  reportType?: ReportType;

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
