import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsOptional } from 'class-validator';
import { PaginationRequest } from './pagination.request';

export class DateFilterRequest {
  @ApiPropertyOptional({ description: 'Filter by from date' })
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by to date' })
  @IsDate()
  @IsOptional()
  toDate?: Date;
}

export class DateFilterWithPaginationRequest extends PaginationRequest {
  @ApiPropertyOptional({ description: 'Filter by from date' })
  @IsDate()
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by to date' })
  @IsDate()
  @IsOptional()
  toDate?: Date;
}
