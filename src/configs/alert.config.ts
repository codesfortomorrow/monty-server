import { registerAs } from '@nestjs/config';

export const alertConfigFactory = registerAs('alert', () => ({
  email: process.env.ALERT_EMAIL,
}));
