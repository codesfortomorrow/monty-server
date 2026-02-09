import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ExportReport extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;
}
