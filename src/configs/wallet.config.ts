import { registerAs } from '@nestjs/config';

export const walletConfigFactory = registerAs('wallet', () => ({
  fakeDepositAmount: 10000,
}));
