import { IsOptional, IsNumber, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionStatus, ExportFormat } from '@prisma/client';
import { DateFilterRequest } from '@Common';

export class GetWeeklyCommissionHistoryDto extends DateFilterRequest {
  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter weekly commission history by status',
    enum: CommissionStatus,
    example: CommissionStatus.Pending,
  })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;
}
