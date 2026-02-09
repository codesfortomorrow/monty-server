import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
export class activityLogDto extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional()
  @IsEnum(ExportFormat)
  @IsOptional()
  search?: ExportFormat;

  @ApiPropertyOptional({ description: 'Search by userId' })
  @IsNumber()
  @IsOptional()
  searchByUserId?: number;

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
