import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationRequest } from '@Common';

export class ActiveUserDto extends PaginationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
