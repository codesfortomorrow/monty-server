import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCasinoGame {
  @ApiPropertyOptional({ description: 'For update game code' })
  @IsString()
  @IsOptional()
  gameCode?: string;

  @ApiPropertyOptional({ description: 'For update game name' })
  @IsString()
  @IsOptional()
  gameName?: string;

  @ApiPropertyOptional({ description: 'For update category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'For update provider' })
  @IsString()
  @IsOptional()
  provider?: string; // maps to gameProviderName
  //   subProvider?: string;    // doesn't exist in your model – skip or handle via relation

  @ApiPropertyOptional({ description: 'For update game image' })
  @IsString()
  @IsOptional()
  thumbnailImage?: string;
  //   trendingImage?: string;

  @ApiPropertyOptional({ description: 'For update game trending status' })
  @IsBoolean()
  @IsOptional()
  trendingStatus?: boolean;

  @ApiPropertyOptional({ description: 'For update game priority' })
  @IsNumber()
  @IsOptional()
  priority?: number;
}
