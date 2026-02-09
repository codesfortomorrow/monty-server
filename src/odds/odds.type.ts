export interface MainMarketData {
  marketId: string;
  marketName: string;
  eventId: string;
  inplay: boolean;
  marketStartTime: string; // ISO date string
  status: string;
  marketType: string;

  // Settings
  maxBetAmount: number | null;
  minBetAmount: number | null;
  // offPlayMaxBetAmount: number | null;
  // offPlayMinBetAmount: number | null;
  minRate: number | null;
  maxRate: number | null;

  // totalMatched: number;
  // sportId: string;
  runners: Partial<MarketRunner>[];
}

export interface MarketRunner {
  handicap?: number;
  selectionId: string;
  runnerName: string;
  status: string;
  back: PriceSize[];
  lay: PriceSize[];
  ex: Exchange;
  sortPriority: number | string;

  backPrice1: number;
  backPrice2: number;
  backPrice3: number;

  layPrice1: number;
  layPrice2: number;
  layPrice3: number;

  backSize1: number;
  backSize2: number;
  backSize3: number;

  laySize1: number;
  laySize2: number;
  laySize3: number;
}

export interface PriceSize {
  price: number;
  size: number;
}

export interface Exchange {
  availableToBack: PriceSize[];
  availableToLay: PriceSize[];
  tradedVolume: any[]; // if structure known, replace 'any' with appropriate interface
}

export interface Odds {
  data: MainMarketData;
  eventID: string;
  marketName: string;
}

// Response Type
/** Runner / odds payload */
export interface RunnerOdds {
  handicap: number;
  runnerName: string;
  selectionId: number | string;
  sortPriority: number | string;
  meta: any;
  back: PriceSize[]; // best->worse back offers
  lay: PriceSize[]; // best->worse lay offers

  status: string;

  // Convenience flattened best prices/sizes (kept as numbers because input shows numbers)

  backPrice1: number;
  backPrice2: number;
  backPrice3: number;

  layPrice1: number;
  layPrice2: number;
  layPrice3: number;

  backSize1: number;
  backSize2: number;
  backSize3: number;

  laySize1: number;
  laySize2: number;
  laySize3: number;
}

export interface EventResponse {
  id: string | number; // your example shows "3335" as a string, can also be numeric depending on source
  competitionId: number;
  providerId: number | null;
  externalId: string;
  name: string;
  sport: string;
  startTime: string; // ISO timestamp
  status: string;

  // flags
  isFancy: boolean;
  isBookmaker: boolean;
  isPremiumFancy: boolean;
  isPopular: boolean;
  inplay: boolean;

  // relations
  competition: Partial<Competition>;
  runners: Partial<MarketRunner>[];
}

export interface Competition {
  id: number;
  name: string;
  externalId: string;
  startDate: string | null;
}

// Extra Market
export interface ExtraMarketData {
  marketId: string;
  marketName: string;
  category: string;
  marketType: string;
  status: string;
  // commissionEnabled: boolean;
  // suspended: boolean;
  // disabled: boolean;
  // inplay?: boolean;
  // limits: {
  //   minBetValue: number;
  //   maxBetValue: number;
  //   oddsLimit: number;
  //   currency: string;
  // };
  runners: ExtraRunner[];
}

export interface ExtraRunner {
  selectionId: string;
  runnerName: string;
  status: string;
  backPrices: PriceSize[];
  backPrice1?: number;
  backPrice2?: number;
  backPrice3?: number;
  backSize1?: number;
  backSize2?: number;
  backSize3?: number;
}

// Fancy Market
export interface FancyMarketData {
  marketId: string;
  marketName: string;
  gameType: string;
  marketCategory: string;
  gameStatus: string;
  // gtStatus: string;
  // min: number;
  // max: number;
  // remark: string;
  ballSession: string;
  // serialNo: number;
  sortPriority?: number;
  runners?: {
    selectionId: string;
    runnerName: string;
    status: string;
    back: PriceSize[];
    lay: PriceSize[];

    backPrice1: number;
    backPrice2: number;
    backPrice3: number;

    layPrice1: number;
    layPrice2: number;
    layPrice3: number;

    backSize1: number;
    backSize2: number;
    backSize3: number;

    laySize1: number;
    laySize2: number;
    laySize3: number;
  };
}
