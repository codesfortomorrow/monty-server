import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AmountTransferDto {
  @ApiProperty({
    example: [101, 102, 103],
    description: 'List of user IDs to whom amount will be transferred',
    type: [Number],
  })
  @IsArray()
  userIds: bigint[];

  @ApiProperty({
    example: 5000,
    description: 'Total amount to transfer',
  })
  @IsNumber()
  allAmount: number;

  @ApiPropertyOptional({
    example: 'settelement distribution',
    description: 'Optional remark for the transaction',
  })
  @IsOptional()
  @IsString()
  remark?: string;
}
