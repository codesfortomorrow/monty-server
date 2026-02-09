import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CasinoGameListBody {
  @ApiProperty()
  @IsString()
  operatorId: string;

  @ApiProperty({ description: 'Page number for pagination' })
  @IsNumber()
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  @IsNumber()
  limit: number;
}
