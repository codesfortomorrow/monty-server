import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class GetBookSetCalcDto {
  @ApiProperty({ description: 'Event ID', example: 98765 })
  @IsNumber()
  @IsNotEmpty()
  eventId: number;
}
