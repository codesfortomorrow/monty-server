import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletTransactionStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateDepositWithdrawStatusDto {
  @ApiProperty({
    enum: WalletTransactionStatus,
    example: WalletTransactionStatus.Approved,
    description: 'Set status as Approved or Rejected by banker',
  })
  @IsEnum(WalletTransactionStatus)
  status: WalletTransactionStatus;

  @ApiPropertyOptional({
    example: 'Amount mismatch with screenshot',
    description: 'Optional remark by banker for approval/rejection',
  })
  @IsString()
  @IsOptional()
  remark?: string;
}
