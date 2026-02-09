import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class exportCasinoGamesPayload {
  @ApiPropertyOptional({ description: 'Filter by provider name' })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
    default: ExportFormat.Excel,
  })
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;
}
