import { registerAs } from '@nestjs/config';

export const stakeSetConfigFactory = registerAs('stakeSet', () => ({
  stakeSet: [
    {
      label: '100',
      value: 100,
    },
    {
      label: '500',
      value: 500,
    },
    {
      label: '1000',
      value: 1000,
    },
    {
      label: '5000',
      value: 5000,
    },
    {
      label: '10000',
      value: 10000,
    },
    {
      label: '25000',
      value: 25000,
    },
    {
      label: '50000',
      value: 50000,
    },
    {
      label: '100000',
      value: 100000,
    },
    {
      label: '500000',
      value: 500000,
    },
  ],
}));
