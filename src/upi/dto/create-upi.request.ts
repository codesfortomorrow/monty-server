import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { StatusType, UpiType } from '@prisma/client';
export class CreateUpiDto {
  @ApiProperty({ example: 'john.doe@upi' })
  @IsString()
  @IsNotEmpty()
  upiId: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsOptional()
  number?: string;

  @ApiProperty({ example: 'John Doe', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: UpiType.QR1, enum: UpiType, required: false })
  @IsEnum(UpiType)
  @IsOptional()
  type?: UpiType;

  @ApiProperty({ example: 'https://example.com/qr-code.png', required: false })
  @IsString()
  @IsOptional()
  qrCode?: string;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  minAmount?: number;

  @ApiProperty({ example: 100000, required: false })
  @IsNumber()
  @IsOptional()
  maxAmount?: number;
}
