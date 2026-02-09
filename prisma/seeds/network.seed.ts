import { NetworkType, Prisma } from '@prisma/client';
import { parseUnits } from 'ethers';

export const mainnetNetworks: Prisma.NetworkCreateInput[] = [
  {
    name: 'Tron',
    nativeCoinSymbol: 'TRC20_TRX',
    nativeCoinDecimals: 6,
    nativeCoinCmcId: 1958,
    coinType: 195,
    type: NetworkType.Tron,

    paymentOptions: {
      createMany: {
        data: [
          {
            name: 'TRX',
            displayName: 'TRX (TRC20)',
            logo: 'static/img/logos/tron.png',
            symbol: 'TRC20_TRX',
            ticker: 'tron',
            decimals: 6,
            cmcId: 1958,
            minTxnValue: parseUnits('10', 6).toString(),
          },
          {
            name: 'USDT',
            displayName: 'USDT (TRC20)',
            logo: 'static/img/logos/tron_usdt.png',
            symbol: 'TRC20_USDT',
            ticker: 'tron/usdt',
            decimals: 6,
            cmcId: 825,
            usdRate: '1.0',
            minTxnValue: parseUnits('10', 6).toString(),
          },
        ],
      },
    },
  },
  {
    name: 'Binance Smart Chain',
    nativeCoinSymbol: 'BEP20_BNB',
    nativeCoinDecimals: 18,
    nativeCoinCmcId: 1839,
    coinType: 60,
    type: NetworkType.Bsc,

    paymentOptions: {
      createMany: {
        data: [
          {
            name: 'BNB',
            displayName: 'BNB (BEP20)',
            logo: 'static/img/logos/bnb.png',
            symbol: 'BEP20_BNB',
            ticker: 'bnb',
            decimals: 18,
            cmcId: 1839,
            minTxnValue: parseUnits('0.01', 18).toString(),
          },
          {
            name: 'USDT',
            displayName: 'USDT (BEP20)',
            logo: 'static/img/logos/bnb_usdt.png',
            symbol: 'BEP20_USDT',
            ticker: 'bnb/usdt',
            decimals: 18,
            cmcId: 825,
            usdRate: '1.0',
            minTxnValue: parseUnits('10', 18).toString(),
          },
        ],
      },
    },
  },
];
