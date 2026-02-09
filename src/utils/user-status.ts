import { UserStatus } from '@prisma/client';
import { userStatusConfigFactory } from 'src/configs/user-status.config';

export const getStatusPriorityLevel = (status: UserStatus): number | null => {
  const userStatus = userStatusConfigFactory();
  const normalized = status.trim().toLowerCase();
  if (!normalized) return null;

  // Convert both keys and input to lowercase for case-insensitive matching
  const key = Object.keys(userStatus).find(
    (k) => k.toLowerCase() === normalized,
  );

  return key ? userStatus[key as keyof typeof userStatus] : null;
};
