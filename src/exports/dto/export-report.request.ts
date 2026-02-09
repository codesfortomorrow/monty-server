import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat, ExportStatus, ExportType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class getExportReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Search by game name or keyword' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;

  @ApiPropertyOptional({
    enum: ExportStatus,
  })
  @IsOptional()
  @IsEnum(ExportStatus)
  status?: ExportStatus;

  @ApiPropertyOptional({
    enum: ExportType,
  })
  @IsOptional()
  @IsEnum(ExportType)
  type?: ExportType;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
