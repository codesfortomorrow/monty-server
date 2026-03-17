import { registerAs } from '@nestjs/config';

export const casinoConfigFactory = registerAs('casino', () => ({
  casinoProvider: process.env.CASINO_PROVIDER,
  gapBaseUrl: process.env.GAP_BASE_URL,
  gapSignature: process.env.GAP_SIGNATURE,
  operatorId: process.env.GAP_OPERATOR_ID,
  redirectUrl: process.env.USER_WEB_URL,
  exchangeRate: Number(process.env.EXCHANGE_RATE || 1),
}));
