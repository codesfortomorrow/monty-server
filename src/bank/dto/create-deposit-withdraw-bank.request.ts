import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { WalletTransactionType } from '@prisma/client';

export class CreateBankTransactionDto {
  @ApiProperty({ example: WalletTransactionType.Credit })
  @IsEnum(WalletTransactionType)
  type: WalletTransactionType;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  bankId: bigint;

  @ApiProperty({ example: 'UTR123456789', required: false })
  @IsString()
  @IsOptional()
  UTR?: string;

  @ApiProperty({ example: 'https://example.com/image.jpg', required: false })
  @IsString()
  @IsOptional()
  image?: string;
}
