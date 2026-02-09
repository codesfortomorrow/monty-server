import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { BankSelectType } from '@prisma/client';

export class CreateBankDto {
  @ApiProperty({ example: '123456789012' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({ example: 'DE89370400440532013000' })
  @IsString()
  @IsNotEmpty()
  iban: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  accountHolder: string;

  @ApiProperty({ example: 'HDFC Bank' })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({ example: 'Mumbai Main Branch' })
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @IsNotEmpty()
  distict: string;

  @ApiProperty({
    example: BankSelectType.Account1,
    enum: BankSelectType,
    required: false,
  })
  @IsEnum(BankSelectType)
  @IsOptional()
  selectType?: BankSelectType;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  minAmount?: number;

  @ApiProperty({ example: 100000, required: false })
  @IsNumber()
  @IsOptional()
  maxAmount?: number;
}
