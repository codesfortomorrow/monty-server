import {
  DateFilterWithPaginationRequest,
  PaginationRequest,
  SearchablePaginatedDto,
} from '@Common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export class ReferredUsersQueryDto extends DateFilterWithPaginationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
