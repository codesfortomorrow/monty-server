import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

enum StatusType {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export class EventInplayStatusChangeRequest {
  @ApiProperty({ enum: StatusType })
  @IsEnum(StatusType)
  status: 'ACTIVE' | 'INACTIVE';
}
