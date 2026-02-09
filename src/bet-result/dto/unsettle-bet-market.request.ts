import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class UnsettleBetMarketRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by event or market name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: SportType, description: 'Filter by sport' })
  @IsEnum(SportType)
  @IsOptional()
  sport?: SportType;

  @ApiPropertyOptional({ description: 'Filter by event' })
  @IsNumber()
  @IsOptional()
  eventId?: number;
}
