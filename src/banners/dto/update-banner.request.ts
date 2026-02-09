import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BannerType, BannerPlatform } from '@prisma/client';

export class UpdateBannerRequestDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  heading?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  size?: string;

  @ApiProperty({
    description: 'New banner image (file URL)',
    required: false,
  })
  @IsString()
  @IsOptional()
  bannerImage?: string;

  @ApiProperty({
    enum: BannerType,
    required: false,
  })
  @IsEnum(BannerType)
  @IsOptional()
  type?: BannerType;

  @ApiProperty({
    enum: BannerPlatform,
    required: false,
  })
  @IsEnum(BannerPlatform)
  @IsOptional()
  platform?: BannerPlatform;
}
