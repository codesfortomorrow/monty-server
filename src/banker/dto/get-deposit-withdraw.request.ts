import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  WalletTransactionStatus,
  WalletTransactionType,
  PaymentMode,
  ExportFormat,
} from '@prisma/client';
import { extend } from 'lodash';
import { DateFilterWithPaginationRequest } from '@Common';

export class GetDepositWithdrawQueryDto extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: WalletTransactionStatus, example: 'Pending' })
  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;

  @ApiPropertyOptional({
    enum: ExportFormat,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;

  @ApiPropertyOptional({ enum: WalletTransactionType, example: 'Credit' })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({
    description: ' username, firstname, lastname, exact amount.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isWallet?: boolean;

  @ApiPropertyOptional({
    enum: PaymentMode,
    example: PaymentMode.Easypaisa,
  })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBank?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCrypto?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isUpi?: boolean;
}
