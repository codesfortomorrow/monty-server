import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat, UserStatus } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';

export class GetSummaryRequest {
  @ApiPropertyOptional({ description: 'Filter by upline' })
  @IsString()
  @IsOptional()
  upline?: string;
}
