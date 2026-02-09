import { PaginationRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

enum Status {
  ALL = 'ALL',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export class GetCasinoGamesPayload extends PaginationRequest {
  @ApiPropertyOptional({ description: 'Search by game name or keyword' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'UserId for favorite mark' })
  @IsNumber()
  @IsOptional()
  userId?: number;

  @ApiPropertyOptional({ description: 'Filter by provider name' })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: Status, description: 'Filter by status' })
  @IsEnum(Status)
  @IsOptional()
  status?: Status;
}
