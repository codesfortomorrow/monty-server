import { PaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DownlineBetsRequest extends PaginationRequest {
  @ApiPropertyOptional({ description: 'Filter by marketId' })
  @IsString()
  @IsOptional()
  marketId?: string;
}
