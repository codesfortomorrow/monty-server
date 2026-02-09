import { PaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class EventRequest extends PaginationRequest {
  @ApiPropertyOptional({ enum: SportType })
  @IsString()
  @IsOptional()
  sport?: SportType;

  @ApiPropertyOptional({ enum: ['ALL', 'ACTIVE', 'INACTIVE', 'UPCOMING'] })
  @IsString()
  @IsOptional()
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'UPCOMING';

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
}
