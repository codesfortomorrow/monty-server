export interface ExtraMarketResponse {
  marektName: string;
  data: ExtraMarketData[];
  eventID: string;
  eventId: string;
}

export interface ExtraMarketData {
  openDate: string;
  sportId: string;
  sportName: string;
  competitionId: string;
  competitionName: string;
  eventId: string;
  eventName: string;
  status: string;
  providerName: string;
  markets: ExtraMarketMarkets;
  enabled: boolean;
  premiumEnabled: boolean;
  winnerMarketEnabled: boolean;
  forcedInplay: boolean;
  virtualEvent: boolean;
  favorite: boolean;
  prBaseUrl: string;
  prTopic: string;
}

export interface ExtraMarketMarkets {
  premiumBaseUrl: string;
  premiumTopic: string;
  matchOdds: ExtraMarketMatchOdd[];
  enableMatchOdds: boolean;
  enableBookmaker: boolean;
  enableFancy: boolean;
  enablePremium: boolean;
  fancySuspended: boolean;
  fancyDisabled: boolean;
}

export interface ExtraMarketMatchOdd {
  marketId: string;
  marketName: string;
  marketTime: number;
  marketType: string;
  status: string;
  runners: ExtraMarketRunner[];
  commissionEnabled: boolean;
  suspended: boolean;
  disabled: boolean;
  category: string;
  limits: ExtraMarketLimits;
}

export interface ExtraMarketRunner {
  runnerId: string;
  runnerName: string;
  status: string;
  backPrices: ExtraMarketBackPrice[];
}

export interface ExtraMarketBackPrice {
  price: number;
  size: number;
}

export interface ExtraMarketLimits {
  minBetValue: number;
  maxBetValue: number;
  oddsLimit: number;
  currency: string;
}
