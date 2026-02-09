import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MFARequestDto {
  @ApiProperty({ description: 'Username for user and Email for admin' })
  @IsString()
  usernameOrEmail: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsString()
  status: 'ACTIVE' | 'INACTIVE';
}
