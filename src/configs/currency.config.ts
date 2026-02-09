import { registerAs } from '@nestjs/config';

export const currencyConfigFactory = registerAs('currency', () => ({
  currencyCode: process.env.CURRENCY_CODE,
  currencyName: process.env.CURRENCY_NAME,
  currencySymbol: process.env.CURRENCY_SYMBOL,
}));
