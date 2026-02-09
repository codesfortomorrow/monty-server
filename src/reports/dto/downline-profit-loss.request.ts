import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class DownlineProfitLossRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by username' })
  @IsString()
  @IsOptional()
  searchByUserName?: string;

  @ApiPropertyOptional({ description: 'Transaction limit' })
  @IsNumber()
  @IsOptional()
  transactionLimit?: number;

  @ApiPropertyOptional({ description: 'upline path' })
  @IsString()
  @IsOptional()
  path: string;

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
