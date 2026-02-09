import { PaginatedDto } from '@Common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPlatform, BannerType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';

export class GetBannersRequestDto {
  @ApiPropertyOptional({ enum: BannerPlatform, enumName: 'BannerPlatform' })
  @IsOptional()
  @IsEnum(BannerPlatform)
  platform?: BannerPlatform;

  @ApiPropertyOptional({ enum: BannerType, enumName: 'BannerType' })
  @IsOptional()
  @IsEnum(BannerType)
  type?: BannerType;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
