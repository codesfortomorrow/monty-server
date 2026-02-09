import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import {
  PaginationRequest,
  SearchableDateFilterWithPaginationRequest,
} from '@Common';

export enum RecordType {
  Transaction = 'Transaction',
  Account = 'Account',
  Gaming = 'Gaming',
  Sports = 'Sports',
  Casino = 'Casino',
}

export class GetUserTransactionsRequestDto extends SearchableDateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: WalletTransactionContext })
  @IsOptional()
  @IsEnum(WalletTransactionContext)
  context?: WalletTransactionContext;

  @ApiPropertyOptional({ enum: RecordType })
  @IsOptional()
  @IsEnum(RecordType)
  recordType?: RecordType;

  @ApiPropertyOptional({ enum: WalletTransactionType })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({ enum: WalletType })
  @IsOptional()
  @IsEnum(WalletType)
  walletType?: WalletType;
}
