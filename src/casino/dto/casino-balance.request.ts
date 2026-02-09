import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CasinoBalanceRequest {
  @ApiProperty()
  @IsString()
  PartnerId: string;

  @ApiProperty()
  @IsNumber()
  userId: number;
}
