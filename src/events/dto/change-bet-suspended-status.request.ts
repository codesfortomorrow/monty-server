import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

enum StatusType {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}
export class EventBetSuspendedStatusChangeRequest {
  @ApiProperty({ enum: StatusType })
  @IsEnum(StatusType)
  status: 'ACTIVE' | 'SUSPENDED';
}
