import { ApiProperty } from '@nestjs/swagger';
import { SportType } from '@prisma/client';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class GetUsersBookSetCalcDto {
  @ApiProperty({ description: 'sportName', example: SportType })
  @IsString()
  @IsNotEmpty()
  sport: SportType;
}
