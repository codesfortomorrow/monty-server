import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginRequestDto {
  // @ApiProperty()
  // @IsEmail()
  // email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiPropertyOptional({ enum: DeviceType })
  @IsEnum(DeviceType)
  @IsOptional()
  device?: DeviceType;

  // @ApiProperty()
  // @IsString()
  // @IsOptional()
  // captchaId?: string;

  // @ApiProperty()
  // @IsString()
  // @IsOptional()
  // captchaText?: string;
}
