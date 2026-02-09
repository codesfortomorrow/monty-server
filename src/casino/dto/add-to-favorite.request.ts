import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AddToFavoriteCasino {
  @ApiProperty({ enum: ['FAVORITE', 'UNFAVORITE'] })
  @IsString()
  status: 'FAVORITE' | 'UNFAVORITE';
}
