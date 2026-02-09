import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSportsProviderRequest {
  @ApiProperty({ description: 'Sports provider name' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
