import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class SetBetConfigRequest {
  @ApiPropertyOptional({ example: 100000 })
  @IsNumber()
  @IsOptional()
  inPlayMaxBetAmount?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsNumber()
  @IsOptional()
  inPlayMinBetAmount?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsNumber()
  @IsOptional()
  offPlayMaxBetAmount?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsNumber()
  @IsOptional()
  offPlayMinBetAmount?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsNumber()
  @IsOptional()
  potentialProfit?: number;
}
