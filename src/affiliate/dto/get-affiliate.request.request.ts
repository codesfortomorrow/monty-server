import {
  IsOptional,
  IsEnum,
  IsNumberString,
  IsString,
  IsNumber,
  IsDate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';

export class GetAffiliateListDto {
  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Status of the affiliate',
    example: RequestStatus.Pending,
    enum: RequestStatus,
  })
  @IsOptional()
  @IsEnum(RequestStatus)
  requestStatus?: RequestStatus;

  @ApiPropertyOptional({
    description: 'Search by  username',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by start date',
  })
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by end date',
  })
  @IsDate()
  @IsOptional()
  toDate?: Date;
}
