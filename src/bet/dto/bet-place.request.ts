import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

enum BetOn {
  BACK = 'BACK',
  LAY = 'LAY',
}
enum MarketType {
  NORMAL = 'NORMAL',
  FANCY = 'FANCY',
  PREMIUM = 'PREMIUM',
}
export class BetPlaceRequest {
  @ApiProperty({ example: 6464 })
  @IsNumber()
  eventId: number;

  @ApiProperty({ example: '1.250661251' })
  @IsString()
  marketId: string;

  @ApiProperty({ example: 'Match Odds / Fancy' })
  @IsString()
  marketName: string;

  @ApiPropertyOptional({ example: 'wpmarket' })
  @IsString()
  @IsOptional()
  marketCategory?: string;

  @ApiProperty({ enum: ['NORMAL', 'FANCY', 'PREMIUM'] })
  @IsEnum(MarketType)
  marketType: 'NORMAL' | 'FANCY' | 'PREMIUM';

  @ApiProperty({ example: '24432273' })
  @IsString()
  selectionId: string;

  @ApiProperty({ example: 'over 2.5' })
  @IsString()
  runnerName: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  stake: number;

  @ApiProperty({ example: 1.65 })
  @IsNumber()
  rate: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsNumber()
  @IsOptional()
  fancyPercentage?: number;

  @ApiProperty({ enum: ['BACK', 'LAY'] })
  @IsEnum(BetOn)
  betOn: 'BACK' | 'LAY';

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsBoolean()
  @IsOptional()
  acceptOddsChange?: boolean;
}
