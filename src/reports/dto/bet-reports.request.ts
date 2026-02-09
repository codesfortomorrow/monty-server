import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BetStatusType, ExportFormat, SportType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// export enum BetStatusType {
//   PENDING = 'PENDING',
//   WON = 'WON',
//   LOST = 'LOST',
//   VOIDED = 'VOIDED',
//   CANCELLED = 'CANCELLED',
//   ROLLBACK = 'ROLLBACK',
// }

export enum MarketType {
  NORMAL = 'NORMAL',
  FANCY = 'FANCY',
  PREMIUM = 'PREMIUM',
  BOOKMAKER = 'BOOKMAKER',
}

export enum ReportType {
  DIRECT = 'DIRECT',
  HIERARCHY = 'HIERARCHY',
}

export class BetReportsRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by username' })
  @IsString()
  @IsOptional()
  searchByUserName?: string;

  @ApiPropertyOptional({ description: 'Search by userId' })
  @IsNumber()
  @IsOptional()
  searchByUserId?: number;

  @ApiPropertyOptional({ description: 'Search by event or market name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by betId' })
  @IsNumber()
  @IsOptional()
  betId?: number;

  @ApiPropertyOptional({ description: 'Filter by competitionId' })
  @IsNumber()
  @IsOptional()
  competitionId?: number;

  @ApiPropertyOptional({ description: 'Filter by eventId' })
  @IsNumber()
  @IsOptional()
  eventId?: number;

  @ApiPropertyOptional({ description: 'Filter by marketId' })
  @IsString()
  @IsOptional()
  marketId?: string;

  @ApiPropertyOptional({ enum: MarketType, description: 'Filter by market' })
  @IsEnum(MarketType)
  @IsOptional()
  market?: MarketType;

  @ApiPropertyOptional({ enum: BetStatusType, description: 'Filter by status' })
  @IsEnum(BetStatusType)
  @IsOptional()
  status?: BetStatusType;

  @ApiPropertyOptional({ enum: SportType })
  @IsEnum(SportType)
  @IsOptional()
  sport?: SportType;

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
