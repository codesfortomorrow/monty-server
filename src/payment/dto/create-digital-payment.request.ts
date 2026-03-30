import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { PaymentMode, AccountType } from '@prisma/client';

export class CreateDigitalPaymentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name: string;

  @ApiProperty({
    description: 'Payment mode (bkash, rocket, nagad, bank)',
    enum: PaymentMode,
    example: PaymentMode.bKash,
  })
  @IsEnum(PaymentMode)
  @IsNotEmpty()
  paymentMode: PaymentMode;

  @ApiPropertyOptional({
    description: 'Account type (personal, agent, Payment)',
    enum: AccountType,
    example: AccountType.Savings,
  })
  @IsEnum(AccountType)
  @IsOptional()
  accountType: AccountType;

  @ApiProperty({
    description: 'Primary number or wallet number of the account',
    example: '17XXXXXXXX',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Invalid phone number',
  })
  number: string;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  minAmount?: number;

  @ApiProperty({ example: 100000, required: false })
  @IsNumber()
  @IsOptional()
  maxAmount?: number;
}
