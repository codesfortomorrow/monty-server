import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateConversionRateDto {
  @ApiPropertyOptional({ example: 126 })
  @IsNotEmpty()
  @IsNumber()
  conversionRate: number;
}
