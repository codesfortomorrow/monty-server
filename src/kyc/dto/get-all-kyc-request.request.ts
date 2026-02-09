import { ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from '@prisma/client';
import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsNumber,
  IsDate,
} from 'class-validator';

export class GetKycDto {
  @ApiPropertyOptional({
    description: 'Status of the KYC',
    enum: KycStatus,
  })
  @IsEnum(KycStatus)
  @IsOptional()
  status?: KycStatus;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  toDate?: Date;
}
