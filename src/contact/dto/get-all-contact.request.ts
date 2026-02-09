import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ContactType } from '@prisma/client';

export class FindAllContactSupportDto {
  @ApiPropertyOptional({
    description: 'Filter by contact type',
    enum: ContactType, // 👈 SHOW ENUM OPTIONS IN SWAGGER
  })
  @IsEnum(ContactType)
  @IsOptional()
  type?: ContactType;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
  })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
  })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
