import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decimal } from '@prisma/client/runtime/library';
import { IsInt, IsNumber, IsOptional } from 'class-validator';

export class CreateTurnoverHistoryDto {
  @ApiProperty()
  @IsInt()
  userId: bigint;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  betId?: bigint;

  @ApiProperty()
  @IsNumber()
  amount: Decimal;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  payout: Decimal;
}
