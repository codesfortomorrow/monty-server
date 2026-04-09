import { DateFilterWithPaginationRequest } from '@Common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BetStatusType, SportType } from '@prisma/client';
import {
  // IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export enum BetTime {
  CURRENT = 'CURRENT',
  PAST = 'PAST',
}
export class BetHistoryRequest extends DateFilterWithPaginationRequest {
  @ApiProperty({ enum: BetTime })
  @IsEnum(BetTime)
  betTime: BetTime = BetTime.CURRENT;

  @ApiPropertyOptional({ enum: BetStatusType })
  @IsEnum(BetStatusType)
  @IsOptional()
  status?: BetStatusType;

  // @ApiPropertyOptional({ description: 'Filter bet history by from date' })
  // @IsDate()
  // @IsOptional()
  // fromDate?: Date;

  // @ApiPropertyOptional({ description: 'Filter bet history by to date' })
  // @IsDate()
  // @IsOptional()
  // toDate?: Date;

  @ApiPropertyOptional({ description: 'Filter bet history by eventId' })
  @IsNumber()
  @IsOptional()
  eventId?: number;

  @ApiPropertyOptional({ enum: SportType })
  @IsEnum(SportType)
  @IsOptional()
  sport?: SportType;

  @ApiPropertyOptional({ description: 'Search by event name' })
  @IsString()
  @IsOptional()
  search?: string;
}
