import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExportFormat,
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  IsDate,
} from 'class-validator';
import { RecordType } from './get-user-transaction-request.request';

export class ExportUserTransactionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ enum: WalletTransactionContext })
  @IsOptional()
  @IsEnum(WalletTransactionContext)
  context?: WalletTransactionContext;

  @ApiPropertyOptional({ enum: RecordType })
  @IsOptional()
  @IsEnum(RecordType)
  recordType?: RecordType;

  @ApiPropertyOptional({ description: 'Search by user id' })
  @IsOptional()
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({ enum: WalletTransactionType })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({ enum: WalletType })
  @IsOptional()
  @IsEnum(WalletType)
  walletType?: WalletType;

  @ApiPropertyOptional({ description: 'Search by txnId' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
    default: ExportFormat.Excel,
    description: 'Export format',
  })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;
}
