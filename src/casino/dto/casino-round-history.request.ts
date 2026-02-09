import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BetStatusType } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CasinoHistoryRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by username or casino game' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by provider name' })
  @IsNumber()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({
    enum: BetStatusType,
    description: 'Filter by bet status',
  })
  @IsString()
  @IsOptional()
  status?: BetStatusType;
}
