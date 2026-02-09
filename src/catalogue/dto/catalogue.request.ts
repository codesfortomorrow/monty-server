import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';

export class CatalogueRequest {
  @ApiPropertyOptional({ enum: SportType })
  @IsString()
  @IsOptional()
  sport?: SportType;

  // @ApiPropertyOptional({ description: 'Filter by competition' })
  // @IsNumber()
  // @IsOptional()
  // evelId?: number;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'external market id' })
  @IsString()
  @IsOptional()
  marketId?: string;

  @ApiPropertyOptional({ description: 'market Type' })
  @IsString()
  @IsOptional()
  marketType?: string;

  @ApiPropertyOptional({
    description: 'filter by inplay',
    enum: ['true', 'false'],
  })
  @IsString()
  @IsOptional()
  inplay?: string;

  @ApiPropertyOptional({
    description: 'filter by match time',
    enum: ['today', 'upcoming'],
  })
  @IsString()
  @IsOptional()
  matchTime?: string;
}
