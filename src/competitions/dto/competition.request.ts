import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';

export class CompetitionRequest {
  @ApiPropertyOptional({ enum: SportType })
  @IsString()
  @IsOptional()
  sport?: SportType;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsString()
  @IsOptional()
  search?: string;
}
