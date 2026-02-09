import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat, SportType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum GameType {
  SPORTS = 'SPORTS',
  CASINO = 'CASINO',
}

export class EventProfitLossRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by event name' })
  @IsString()
  @IsOptional()
  searchByEvent?: string;

  @ApiPropertyOptional({ description: 'Transaction limit' })
  @IsNumber()
  @IsOptional()
  transactionLimit?: number;

  @ApiPropertyOptional({ description: 'Filter by userId' })
  @IsNumber()
  @IsOptional()
  userId?: number;

  @ApiPropertyOptional({ enum: GameType })
  @IsEnum(GameType)
  @IsOptional()
  gameType?: GameType;

  @ApiPropertyOptional({ description: 'Filter by game category' })
  @IsString()
  @IsOptional()
  gameCategory?: string;

  @ApiPropertyOptional({ enum: SportType })
  @IsEnum(SportType)
  @IsOptional()
  sport?: SportType;

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
}
