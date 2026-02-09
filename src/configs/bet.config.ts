import { registerAs } from '@nestjs/config';

export const betConfigFactory = registerAs('bet', () => ({
  inplayMinBetAmount: 100,
  inplayMaxBetAmount: 10_000,
  offplayMinBetAmount: 1,
  offplayMaxBetAmount: 1,
  minRate: 1,
  maxRate: 4,
  potentialProfit: 10_000,
  sessionInplayMinBetAmount: 100,
  sessionInplayMaxBetAmount: 10_000,
  sessionOffplayMinBetAmount: 100,
  sessionOffplayMaxBetAmount: 10_000,
  sessionPotentialProfit: 10_000,
  sessionMinRate: 75,
  sessionMaxRate: 130,
  bookmakerInplayMinBetAmount: 100,
  bookmakerInplayMaxBetAmount: 10_000,
  bookmakerOffplayMinBetAmount: 1,
  bookmakerOffplayMaxBetAmount: 1,
  bookmakerPotentialProfit: 10_000,
  bookmakerMinRate: 10,
  bookmakerMaxRate: 40,

  exposureLimit: 1_00_000,
  betDelay: 3,
}));
