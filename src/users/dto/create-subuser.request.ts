import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsInt,
  MinLength,
  IsNumber,
} from 'class-validator';

export class CreateSubUserRequest {
  @ApiPropertyOptional({
    description: 'First name of the sub-user',
    example: 'John',
  })
  @IsString()
  @IsOptional()
  firstname?: string;

  @ApiPropertyOptional({
    description: 'Last name of the sub-user',
    example: 'Doe',
  })
  @IsString()
  @IsOptional()
  lastname?: string;

  @ApiPropertyOptional({
    description: 'Email address of the sub-user (optional)',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Unique username of the sub-user (optional)',
    example: 'john123',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'Mobile number of the sub-user (optional)',
    example: '+15551234567',
  })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({
    description:
      'Role ID of the sub-user (must be greater role level than creator)',
    example: 3,
  })
  @IsInt()
  roleId: number;

  @ApiPropertyOptional({
    description: 'Give credit to sub user',
    example: 5000,
  })
  @IsNumber()
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({
    description: 'Give partnership to sub user',
    example: 100,
  })
  @IsNumber()
  @IsOptional()
  partnership?: number;

  @ApiProperty({
    description: 'Password for the new sub-user (minimum 6 characters)',
    example: 'secret123',
  })
  @IsString()
  @MinLength(6)
  password: string;
}
