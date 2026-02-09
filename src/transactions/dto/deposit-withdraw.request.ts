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

export class ExportDepositWithdraw {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Search by user id' })
  @IsOptional()
  @IsNumber()
  userId?: number;

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
