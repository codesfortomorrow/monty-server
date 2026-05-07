import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export enum Result {
  WINNER = 'WINNER',
  LOSER = 'LOSER',
  REMOVED = 'REMOVED',
}

export enum MarketType {
  NORMAL = 'NORMAL',
  FANCY = 'FANCY',
  PREMIUM = 'PREMIUM',
}

export class ManualRollbackRequest {
  @ApiProperty({ description: 'Market name' })
  @IsString()
  market: string;

  @ApiProperty({ enum: MarketType, description: 'Market type' })
  @IsEnum(MarketType)
  marketType: MarketType;

  @ApiProperty({ description: 'Event external id' })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'Market external id' })
  @IsString()
  marketId: string;

  // @ApiProperty({ description: 'Selection id' })
  // @IsString()
  // selectionId: string;

  // @ApiProperty({ description: 'Result' })
  // @IsString()
  // result: string;
}
