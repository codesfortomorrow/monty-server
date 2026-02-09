import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdatepaymentConfigDto {
  @ApiProperty({ example: 10000.0 })
  @IsNumber()
  @IsOptional()
  maxDeposit?: number;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  @IsOptional()
  minDeposit?: number;

  @ApiProperty({ example: 5000.0 })
  @IsNumber()
  @IsOptional()
  maxWithdraw?: number;

  @ApiProperty({ example: 50.0 })
  @IsNumber()
  @IsOptional()
  minWithdraw?: number;
}
