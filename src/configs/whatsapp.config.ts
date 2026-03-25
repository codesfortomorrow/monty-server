import { registerAs } from '@nestjs/config';

export const whatsappConfigFactory = registerAs('whatsapp', () => ({
  phpsessid: process.env.PHPSESSID,
  secret: process.env.WHATSAPP_SECRET,
  url: process.env.WHATSAPP_BASE_URL,
}));
