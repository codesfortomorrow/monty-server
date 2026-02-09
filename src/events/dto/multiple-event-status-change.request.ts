import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber } from 'class-validator';

enum StatusType {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export class MultipleEventStatusChangeRequest {
  @ApiProperty({ enum: StatusType })
  @IsEnum(StatusType)
  status: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ type: [Number], description: 'EventIds for status change' })
  @IsArray()
  @IsNumber({}, { each: true })
  eventIds: number[];
}
