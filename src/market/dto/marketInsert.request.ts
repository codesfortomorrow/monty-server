import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MarketInsertRequest {
  @ApiProperty({ enum: ['All', 'Cricket'] })
  @IsString()
  sport: 'All' | 'Cricket';
}
