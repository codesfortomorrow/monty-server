import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class CreateCommissionRangeDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  fromUser: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @IsOptional()
  toUser?: number;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  percentage: number;
}
