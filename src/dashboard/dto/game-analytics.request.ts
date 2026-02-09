import { DateFilterRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class GameAnalyticsRequest extends DateFilterRequest {
  @ApiPropertyOptional({
    description: 'Filter by sport',
    enum: SportType,
  })
  @IsEnum(SportType)
  @IsOptional()
  sport?: SportType;
}
