import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class RecentGamesRequest {
  @ApiPropertyOptional({ description: 'Number of items' })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
