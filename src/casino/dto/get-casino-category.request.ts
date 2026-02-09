import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetCasinoCategoryPayload {
  @ApiPropertyOptional({ description: 'Search by game name or keyword' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by provider name' })
  @IsString()
  @IsOptional()
  provider?: string;
}
