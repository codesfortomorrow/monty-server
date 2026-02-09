import { currencyConfigFactory } from '../../src/configs/currency.config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const seedCurrency = async () => {
  const currencyConfig = currencyConfigFactory();
  const name = currencyConfig.currencyName;
  const code = currencyConfig.currencyCode;
  const symbol = currencyConfig.currencySymbol;

  if (!name || !code) {
    console.error('Currency name and symbol are missing!');
    throw new Error('Currency name and symbol are missing!');
  }
  await prisma.currency.create({
    data: {
      name,
      code,
      symbol,
      conversionRate: 1,
    },
  });

  console.log('✅ Seeded default currency');
};
