import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class GetCasinoProviderRequest {
  @ApiPropertyOptional({
    description: 'Search by provider name or casino game name',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by aggregator name' })
  @IsNumber()
  @IsOptional()
  aggregator?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
