import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BetStatusType, ExportFormat } from '@prisma/client';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CasinoHistoryExportRequest {
  @ApiPropertyOptional({ description: 'Filter by provider name' })
  @IsNumber()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({
    enum: BetStatusType,
    description: 'Filter by bet status',
  })
  @IsString()
  @IsOptional()
  status?: BetStatusType;

  @ApiProperty({ description: 'Filter by date' })
  @IsDate()
  formData: Date;

  @ApiProperty({ description: 'Filter by date' })
  @IsDate()
  toDate: Date;

  @ApiPropertyOptional({
    enum: ExportFormat,
    default: ExportFormat.Excel,
  })
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;
}
