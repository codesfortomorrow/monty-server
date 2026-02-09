import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChangeStatus {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsString()
  status: 'ACTIVE' | 'INACTIVE';
}
