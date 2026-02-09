import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BannerType, BannerPlatform } from '@prisma/client';

export class CreateBannerRequestDto {
  @ApiProperty({
    description: 'Banner name',
    example: 'Diwali Offer Banner',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Banner heading',
    example: 'Big Festive Sale',
  })
  @IsString()
  @IsOptional()
  heading?: string;

  @ApiProperty({
    description: 'Paragraph text to show inside banner',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: '1080x420',
  })
  @IsString()
  @IsOptional()
  size?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bannerImage: string;

  @ApiProperty({
    description: 'Type of the banner',
    enum: BannerType,
    example: 'MainBanner',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(BannerType)
  type: BannerType;

  @ApiProperty({
    description: 'Platform where the banner will be displayed',
    enum: BannerPlatform,
    example: 'WebBanner',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(BannerPlatform)
  platform: BannerPlatform;
}
