import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateCommissionRangeDto {
  @ApiProperty({ example: 1, required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  fromUser?: number;

  @ApiProperty({ example: 50, required: false })
  @IsNumber()
  @IsOptional()
  toUser?: number;

  @ApiProperty({ example: 2.5, required: false })
  @IsNumber()
  @IsOptional()
  percentage?: number;
}
