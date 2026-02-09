import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class MostPlayedGameRequest {
  @ApiPropertyOptional({ description: 'UserId for geting favorite marks' })
  @IsNumber()
  @IsOptional()
  userId?: bigint;
}
