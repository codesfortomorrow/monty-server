import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';
import { StatusType, BankSelectType, AccountType } from '@prisma/client';

export class UpdateBankDto {
  @ApiProperty({
    example: '123456789012',
    description: 'Bank account number',
  })
  @IsString()
  @IsOptional()
  accountNumber?: string;

  @ApiProperty({
    example: 'HDFC0001234',
    description: 'iban code',
  })
  @IsString()
  @IsOptional()
  iban?: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Account holder name',
  })
  @IsString()
  @IsOptional()
  accountHolder?: string;

  @ApiProperty({
    example: 'HDFC Bank',
    description: 'Bank name',
    required: false,
  })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiProperty({
    example: BankSelectType.Account1,
    enum: BankSelectType,
    required: false,
  })
  @IsEnum(BankSelectType)
  @IsOptional()
  selectType?: BankSelectType;

  @ApiProperty({
    example: 100,
    description: 'Minimum deposit amount',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  minDepositAmount?: number;

  @ApiProperty({
    example: 100000,
    description: 'Maximum deposit amount',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  maxDepositAmount?: number;
}
