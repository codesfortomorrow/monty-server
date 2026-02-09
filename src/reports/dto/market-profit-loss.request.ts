import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class MarketProfitLossRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by market name' })
  @IsString()
  @IsOptional()
  searchByMarket?: string;

  @ApiPropertyOptional({ description: 'Transaction limit' })
  @IsNumber()
  @IsOptional()
  transactionLimit?: number;

  @ApiPropertyOptional({ enum: SportType })
  @IsEnum(SportType)
  @IsOptional()
  sport?: SportType;
}
