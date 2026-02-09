import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateBalanceRequest {
  @ApiProperty()
  @IsPositive()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  narration: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refernce?: string;

  @ApiPropertyOptional({
    description: 'Source account',
  })
  @IsOptional()
  @IsString()
  fromAccount?: string;

  @ApiPropertyOptional({
    description: 'Destination account',
  })
  @IsOptional()
  @IsString()
  toAccount?: string;

  @ApiProperty({
    description: 'Transaction code for verification',
    example: '12345',
  })
  @IsString()
  transactionCode: string;
}
