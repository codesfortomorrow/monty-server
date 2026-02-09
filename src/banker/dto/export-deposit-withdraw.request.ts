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

export class ExportDepositWithdrawQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ enum: WalletTransactionStatus })
  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;

  @ApiPropertyOptional({ enum: WalletTransactionType, example: 'Credit' })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({
    description:
      'transactionCode, username, firstname, lastname, exact amount.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Admin requesting all data',
  })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by specific banker ID',
  })
  @IsOptional()
  @IsNumber()
  bankerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isWallet?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBank?: boolean;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
    default: ExportFormat.Excel,
    description: 'Export format',
  })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;
}
