import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class GetSessionPLDto {
  @ApiProperty({ example: 98765 })
  @IsNumber()
  @IsNotEmpty()
  eventId: number;

  @ApiProperty({ example: 98765 })
  @IsString()
  @IsNotEmpty()
  marketId: string;

  @ApiProperty({ example: '12345' })
  @IsString()
  @IsNotEmpty()
  selectionId: string;
}
