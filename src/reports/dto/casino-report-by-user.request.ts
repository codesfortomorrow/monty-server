import { DateFilterWithPaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PlayerCasinoProfitLossRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional({ description: 'Search by event name' })
  @IsString()
  @IsOptional()
  searchByUserName?: string;

  @ApiPropertyOptional({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  @IsOptional()
  exportFormat?: ExportFormat;
}
