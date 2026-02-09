import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChangeProviderStatusRequest {
  @ApiProperty({ description: 'Provider name' })
  @IsString()
  provider: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsString()
  status: 'ACTIVE' | 'INACTIVE';
}
