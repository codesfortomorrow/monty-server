// Extra Market
export interface ExtraMarketPayload {
  marketName: string;
  data: ExtraMarket[];
  eventID: string;
  eventId: string;
}

export interface ExtraMarket {
  marketId: string;
  marketName: string;
  marketTime: number;
  marketType: string;
  status: string;
  runners: ExtraRunner[];
  commissionEnabled: boolean;
  suspended: boolean;
  disabled: boolean;
  category: string;
  limits: ExtraMarketLimits;
}

export interface ExtraRunner {
  runnerId: string;
  runnerName: string;
  status: string;
  backPrices: Price[];
}

export interface Price {
  price: number;
  size: number;
}

export interface ExtraMarketLimits {
  minBetValue: number;
  maxBetValue: number;
  oddsLimit: number;
  currency: string;
}

// Fancy Market
export interface FancyMarketPayload {
  eventID: string;
  marketName: string;
  data: FancyMarket[];
}

export interface FancyMarket {
  marketId: string;
  selectionId: string;
  runnerName: string;
  gameType: string;
  marketName: string;
  gameStatus: string;
  gtStatus: string;
  min: number;
  max: number;
  remark: string;
  ballSession: string;
  serialNo: number;
  sortPriority?: number;
  back: Price[];
  lay: Price[];
}

// Main Markets
export interface OddsPayload {
  eventID: string;
  marketName: string;
  data: MarketData;
}

export interface MarketData {
  marketId: string;
  marketName: string;
  matchId: string;
  inplay: boolean;
  marketStartTime: string;
  status: string;
  marketType: string;
  totalMatched: number;
  sportId: string;
  runners: Runner[];
}

export interface Runner {
  selectionId: string;
  runnerName: string;
  status: string;
  back: Price[];
  lay: Price[];
  ex?: {
    availableToBack: Price[];
    availableToLay: Price[];
    tradedVolume: any[];
  };
  sortPriority?: number | string;
}
