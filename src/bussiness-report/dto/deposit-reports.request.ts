import { SearchableDateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportType } from 'src/reports/dto';

export enum DepositCategory {
  FIRST = 'FIRST',
  REFILL = 'REFILL',
}
export class DepositeReportRequest extends SearchableDateFilterWithPaginationRequest {
  @ApiPropertyOptional({
    enum: DepositCategory,
    description: 'Filter by deposite type',
  })
  @IsEnum(DepositCategory)
  @IsOptional()
  category?: DepositCategory;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({ enum: ReportType })
  @IsEnum(ReportType)
  @IsOptional()
  reportType?: ReportType;

  @ApiPropertyOptional({
    description: 'Timezone in Asia/Kolkata format ',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;
}
