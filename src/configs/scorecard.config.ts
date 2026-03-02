import { registerAs } from '@nestjs/config';

export const scorecardConfigFactory = registerAs('scorecard', () => ({
  activeScorecardProvider: process.env.SCORECARD_PROVIDER || 'SAT',
  activeTvProvider: process.env.TV_PROVIDER || 'RAVI',
  raviTvUrl:
    process.env.RAVI_TV_URL || 'https://e765432.diamondcricketid.com/glive.php',
  raviScorecardUrl:
    process.env.RAVI_SCORECARD_URL || 'https://lmt.route2222.com/#/lmt',
}));
