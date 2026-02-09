import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreditLimitRequest {
  @ApiProperty({
    description: 'Give credit to sub user',
    example: 5000,
  })
  @IsNumber()
  creditLimit: number;

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
