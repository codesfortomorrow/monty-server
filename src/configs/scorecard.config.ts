import { registerAs } from '@nestjs/config';

export const scorecardConfigFactory = registerAs('scorecard', () => ({
  activeScorecardProvider: process.env.SCORECARD_PROVIDER || 'SAT',
  activeTvProvider: process.env.TV_PROVIDER || 'RAVI',
  activeRaceTvProvider: process.env.RACE_TV_PROVIDER || 'RAVI',
  raviTvUrl:
    process.env.RAVI_TV_URL || 'https://e765432.diamondcricketid.com/glive.php',
  raviTvUrlForRace:
    process.env.RAVI_RACE_TV_URL ||
    'https://e765432.diamondcricketid.com/glive.php',
  raviScorecardUrl:
    process.env.RAVI_SCORECARD_URL || 'https://lmt.route2222.com/#/lmt',
  gliveTvUrl: process.env.GLIVE_TV_BASE_URL || 'https://www.glivestreaming.com',
  gliveUserId: process.env.GLIVE_USER_ID || '',
  gliveApiKey: process.env.GLIVE_API_KEY,
  brand: process.env.BRAND,
}));
