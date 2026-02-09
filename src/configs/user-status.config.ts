import { registerAs } from '@nestjs/config';

export const userStatusConfigFactory = registerAs('user-status', () => ({
  Inactive: 1, // High Priority
  Suspended: 2,
  Blocked: 3,
  BetLock: 4,
  Active: 5, // Low Priority
}));
