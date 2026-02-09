import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { PaymentType, WalletTransactionType } from '@prisma/client';

export class CreatepaymentConfigDto {
  @ApiProperty({ enum: PaymentType, example: PaymentType.Crypto })
  @IsEnum(PaymentType)
  paymentMode: PaymentType;

  @ApiProperty({
    enum: WalletTransactionType,
    example: WalletTransactionType.Credit,
  })
  @IsEnum(WalletTransactionType)
  type: WalletTransactionType;

  @ApiPropertyOptional({ example: 10000.0 })
  @IsOptional()
  @IsNumber()
  maxAmount: number;

  @ApiPropertyOptional({ example: 100.0 })
  @IsOptional()
  @IsNumber()
  minAmount: number;
}
