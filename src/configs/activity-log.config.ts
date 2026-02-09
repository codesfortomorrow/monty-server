import { registerAs } from '@nestjs/config';

export const activityLogConfigFactory = registerAs('activity', () => ({
  activityBaseUrl: process.env.ACTIVITY_LOG,
}));
