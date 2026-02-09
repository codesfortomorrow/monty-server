import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
} from 'class-validator';
import {
  PaymentMode,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma/client';
import { DateFilterWithPaginationRequest } from '@Common';

export class GetMyDepositWithdrawQueryDto extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: WalletTransactionStatus, example: 'Pending' })
  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;

  @ApiPropertyOptional({ enum: WalletTransactionType, example: 'Credit' })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({
    enum: PaymentMode,
    example: PaymentMode.Easypaisa,
  })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isWallet?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isBank?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCrypto?: boolean;
}
