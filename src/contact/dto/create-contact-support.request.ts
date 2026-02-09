import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { ContactType } from '@prisma/client';

export class CreateContactSupportDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ enum: ContactType })
  @IsEnum(ContactType)
  type: ContactType;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  number: string;
}
