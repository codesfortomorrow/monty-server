import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class FixtureRequest {
  @ApiPropertyOptional({ enum: SportType })
  @IsString()
  @IsOptional()
  sport?: SportType;

  @ApiPropertyOptional({ description: 'Filter by competition' })
  @IsNumber()
  @IsOptional()
  competitionId?: number;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsString()
  @IsOptional()
  search?: string;

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
