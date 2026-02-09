import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreatesessionPayload {
  @ApiProperty({ enum: ['Mobile', 'Desktop'] })
  @IsString()
  platform: 'Mobile' | 'Desktop';
}
