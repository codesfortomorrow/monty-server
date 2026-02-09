import { registerAs } from '@nestjs/config';

export const sportConfigFactory = registerAs('sport', () => ({
  sportBaseUrl: process.env.SPORT_BASE_URL,
  sports: {
    Cricket: 4,
    Soccer: 1,
    Tennis: 2,
    GreyhoundRacing: 4339,
    HorseRacing: 7,
  },
}));
