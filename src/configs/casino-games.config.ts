import { registerAs } from '@nestjs/config';

export const casinoGamesConfigFactory = registerAs('casino-games', () => ({
  'Mac88 Gaming': 'Mac88 Gaming',
  'Mac88 Gaming Virtual': 'Mac88 Gaming Virtual',
  'MAC Excite': 'MAC Excite',
  'Smartsoft Gaming': 'Smartsoft Gaming',
  Spribe: 'Spribe',
  SPRIBE: 'SPRIBE',
  'Evolution Gaming': 'Evolution Gaming',
  Turbogames: 'Turbogames',
  'Turbo Games': 'Turbo Games',
  Ezugi: 'Ezugi',
  'JiLi Gaming': 'JiLi Gaming',
  'AE sexy': 'SEXYBCRT', // Mapped to SEXYBCRT from DB
  Playtech: 'Playtech',
  'Playtech Live': 'Playtech Live',
  Betsoft: 'Betsoft',
  Gamzix: 'Gamzix',
  BetGames: 'BetGames',
  'betgames.tv': 'BetGames', // Alternative name
  'Evoplay Entertainment': 'Evoplay Entertainment',
  'Asia Gaming': 'Asia Gaming',
  Winfinity: 'Winfinity',
  'Vivo Gaming': 'Vivo Gaming',
  VivoGaming: 'VivoGaming',
  KINGMAKER: 'KINGMAKER',
  'Kingmidas Gaming': 'Kingmidas Gaming',
  'Royal Gaming': 'Royal Gaming',
  'JDB Gaming': 'JDB Gaming',
}));
