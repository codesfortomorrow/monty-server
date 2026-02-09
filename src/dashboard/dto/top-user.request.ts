import { DateFilterRequest } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum TopUserCategory {
  SPORTS = 'SPORTS',
  CASINO = 'CASINO',
}
export class TopUserRequest extends DateFilterRequest {
  @ApiPropertyOptional({
    description: 'Category of top users to fetch',
    enum: TopUserCategory,
    example: TopUserCategory.SPORTS,
  })
  @IsEnum(TopUserCategory)
  @IsOptional()
  category?: TopUserCategory;
}
