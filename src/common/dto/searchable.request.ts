import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DateFilterWithPaginationRequest } from './date-filter.request';
import { PaginatedDto } from './paginated.request';

export class SearchableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class SearchablePaginatedDto extends PaginatedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class SearchableDateFilterWithPaginationRequest extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
