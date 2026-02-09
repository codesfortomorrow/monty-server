import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetTrendingGame {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsString()
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
}
