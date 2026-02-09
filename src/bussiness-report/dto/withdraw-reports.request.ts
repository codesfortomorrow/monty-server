import { SearchableDateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportType } from 'src/reports/dto';

export enum WithdrawCategory {
  FIRST = 'FIRST',
  REFILL = 'REFILL',
}
export class WithdrawReportRequest extends SearchableDateFilterWithPaginationRequest {
  @ApiPropertyOptional({
    enum: WithdrawCategory,
    description: 'Filter by withdraw type',
  })
  @IsEnum(WithdrawCategory)
  @IsOptional()
  category?: WithdrawCategory;

  @ApiPropertyOptional({ enum: ReportType })
  @IsEnum(ReportType)
  @IsOptional()
  reportType?: ReportType;

  @ApiPropertyOptional({
    description: 'file name only for the exported report',
  })
  @IsString()
  @IsOptional()
  fileName?: string;

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
