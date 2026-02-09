import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateDefaultBetConfigRequest {
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
  @Min(0)
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

  @ApiPropertyOptional({
    example: 30000,
    description: 'Max session in-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionInPlayMaxBetAmount?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Min session in-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionInPlayMinBetAmount?: number;

  @ApiPropertyOptional({
    example: 20000,
    description: 'Max session off-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionOffPlayMaxBetAmount?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Min session off-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionOffPlayMinBetAmount?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Max session potential profit allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionPotentialProfit?: number;

  @ApiPropertyOptional({
    example: 75,
    description: 'Minimum session market rate allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionMinRate?: number;

  @ApiPropertyOptional({
    example: 130,
    description: 'Maximum session market rate allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionMaxRate?: number;

  @ApiPropertyOptional({
    example: 30000,
    description: 'Max bookmaker in-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerInPlayMaxBetAmount?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Min bookmaker in-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerInPlayMinBetAmount?: number;

  @ApiPropertyOptional({
    example: 20000,
    description: 'Max bookmaker off-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerOffPlayMaxBetAmount?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Min bookmaker off-play bet amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerOffPlayMinBetAmount?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Max bookmaker potential profit allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerPotentialProfit?: number;

  @ApiPropertyOptional({
    example: 75,
    description: 'Minimum bookmaker market rate allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerMinRate?: number;

  @ApiPropertyOptional({
    example: 130,
    description: 'Maximum bookmaker market rate allowed',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookmakerMaxRate?: number;
}
