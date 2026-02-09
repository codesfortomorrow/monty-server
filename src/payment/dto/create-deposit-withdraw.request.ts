import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { WalletTransactionType } from '@prisma/client';

export class CreateDepositWithdrawRequestDto {
  @ApiProperty({
    description: 'Type of transaction: Credit (Deposit) or Debit (Withdraw)',
    example: WalletTransactionType.Debit,
    enum: WalletTransactionType,
  })
  @IsEnum(WalletTransactionType)
  type: WalletTransactionType;

  @ApiProperty({
    description: 'Amount to deposit or withdraw (up to 2 decimal places)',
    example: 1000.5,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @ApiProperty({
    description: 'Digital Payment ID',
    example: '321',
  })
  @IsNotEmpty()
  digitalPaymentId: bigint;

  @ApiProperty()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  UTR?: string;
}
