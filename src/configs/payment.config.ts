import { registerAs } from '@nestjs/config';

export const paymentConfigFactory = registerAs('payment', () => ({
  maxDeposit: process.env.MAX_DEPOSIT,
  minDeposit: process.env.MIN_DEPOSIT,
  maxWithdraw: process.env.MAX_WITHDRAW,
  minWithdraw: process.env.MIN_WITHDRAW,
  conversionRate: process.env.CONVERSION_RATE,
}));
