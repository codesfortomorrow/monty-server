import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ExportFormat,
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import {
  PaginationRequest,
  SearchableDateFilterWithPaginationRequest,
} from '@Common';

export class UserGameTransactionRequest extends SearchableDateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: WalletTransactionContext })
  @IsOptional()
  @IsEnum(WalletTransactionContext)
  context?: WalletTransactionContext;

  @ApiPropertyOptional({ enum: WalletTransactionType })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({ enum: WalletType })
  @IsOptional()
  @IsEnum(WalletType)
  walletType?: WalletType;

  @ApiPropertyOptional({ description: 'Search by user id' })
  @IsOptional()
  @IsNumber()
  searchByUserId?: number;

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
