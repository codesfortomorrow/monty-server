import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserForResultPanelRequest {
  @ApiPropertyOptional({
    description: 'First name of the user',
    example: 'John',
  })
  @IsString()
  @IsOptional()
  firstname?: string;

  @ApiPropertyOptional({
    description: 'Last name of the user',
    example: 'Doe',
  })
  @IsString()
  @IsOptional()
  lastname?: string;

  @ApiPropertyOptional({
    description: 'Email address of the user (optional)',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Unique username of the user (optional)',
    example: 'john123',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'Mobile number of the user (optional)',
    example: '+15551234567',
  })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({
    description: 'Password for the new sub-user (minimum 6 characters)',
    example: 'secret123',
  })
  @IsString()
  @MinLength(6)
  password: string;
}
