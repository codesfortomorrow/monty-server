import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsDate } from 'class-validator';

export class GetBankersDto {
  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Search keyword. Matches firstname, lastname, or username (case-insensitive).',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter results starting from this date',
  })
  @IsOptional()
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter results up to this date' })
  @IsOptional()
  @IsDate()
  toDate?: Date;
}
