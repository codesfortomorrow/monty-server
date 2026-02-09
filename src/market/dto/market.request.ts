import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class MarketRequest {
  @ApiPropertyOptional({ description: 'Filter by event' })
  @IsNumber()
  @IsOptional()
  eventId?: number;

  @ApiPropertyOptional({ description: 'Search by market name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'filter by inplay',
    enum: ['true', 'false'],
  })
  @IsString()
  @IsOptional()
  inplay?: string;
}
