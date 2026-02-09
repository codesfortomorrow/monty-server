import { registerAs } from '@nestjs/config';

export const bannerConfigFactory = registerAs('banner', () => ({
  bannerImagePath: 'banner/image',
}));
