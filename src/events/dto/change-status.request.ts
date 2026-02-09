import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

enum StatusType {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export class EventStatusChangeRequest {
  @ApiPropertyOptional({ enum: StatusType })
  @IsEnum(StatusType)
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsString()
  @IsOptional()
  isSubscribed?: 'true' | 'false';
}
