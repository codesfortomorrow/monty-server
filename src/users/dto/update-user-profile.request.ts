import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsStrongPassword } from 'class-validator';
import { UpdateProfileDetailsRequestDto } from './update-profile.request';

export class UpdateUserProfileRequestDto extends UpdateProfileDetailsRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsStrongPassword()
  password?: string;
}
