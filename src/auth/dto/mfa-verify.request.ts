import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MFAVerifyRequestDto {
  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  token: string;
}
