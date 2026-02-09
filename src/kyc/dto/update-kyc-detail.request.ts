import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateKycDetailDto {
  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiPropertyOptional({ example: 'front-image-url' })
  @IsOptional()
  @IsString()
  frontImage?: string;

  @ApiPropertyOptional({ example: 'back-image-url' })
  @IsOptional()
  @IsString()
  backImage?: string;
}
