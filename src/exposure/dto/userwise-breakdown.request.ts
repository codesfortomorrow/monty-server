import { PaginationRequest } from '@Common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ReportType } from 'src/reports/dto';

export class UserWiseBreakDownRequest extends PaginationRequest {
  @ApiProperty({ description: 'Event ID', example: 98765 })
  @IsNumber()
  @IsNotEmpty()
  eventId: number;

  @ApiProperty({ description: 'Market External ID', example: '98765' })
  @IsString()
  @IsNotEmpty()
  marketExtenralId: string;

  @ApiPropertyOptional({ description: 'User Id' })
  @IsNumber()
  @IsOptional()
  userId: number;

  @ApiPropertyOptional({ description: 'Search by username' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ReportType })
  @IsEnum(ReportType)
  @IsOptional()
  reportType?: ReportType;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  userType?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  uplineId: string;
}
