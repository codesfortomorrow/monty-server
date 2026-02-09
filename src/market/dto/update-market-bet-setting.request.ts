import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateMarketBetSetting {
  @ApiPropertyOptional({
    example: 100000,
    description: 'Max exposure limit for all bets',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exposureLimit?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Maximum bet delay',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  betDelay?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Maximum bet amount allowed when event is in-play',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inPlayMaxBetAmount?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Minimum bet amount allowed when event is in-play',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inPlayMinBetAmount?: number;

  @ApiPropertyOptional({
    example: 20000,
    description: 'Maximum bet amount allowed when event is off-play',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offPlayMaxBetAmount?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Minimum bet amount allowed when event is off-play',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offPlayMinBetAmount?: number;

  @ApiPropertyOptional({
    example: 100000,
    description: 'Maximum potential profit allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  potentialProfit?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Minimum market rate allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minRate?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Maximum market rate allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRate?: number;
}
