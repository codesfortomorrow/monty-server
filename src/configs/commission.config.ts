import { registerAs } from '@nestjs/config';

export const commissionConfigFactory = registerAs('commission', () => {
  const DEFAULT_RANGES = [
    { from: 0, to: 9, commission: 1 },
    { from: 10, to: 19, commission: 1 },
    { from: 20, to: 39, commission: 1 },
    { from: 40, to: 59, commission: 1 },
    { from: 60, to: 999999999, commission: 1 },
  ];

  return {
    defaultRanges: DEFAULT_RANGES,
    turnover: Number(process.env.TURNOVER ?? 0),
    platformCost: Number(process.env.PLATFORM_COST ?? 0),
    depositFee: Number(process.env.DEPOSIT_FEE ?? 0),
    withdrawalFee: Number(process.env.WITHDRAW_FEE ?? 0),
    activeCount: Number(process.env.ACTIVE_USER_COUNT ?? 0),
  };
});
