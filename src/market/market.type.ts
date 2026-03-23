// interface RunnerDto {
//   selectionId: string;
//   runnerName: string;
//   handicap: number;
//   sortPriority: number | string;
// }

export interface MarketDto {
  marketId: string;
  marketName: string;
  marketStartTime: any;
  totalMatched: number;
  sportId: string;
  runners: object[];
}

export interface MarketApiResponse {
  sports: MarketDto[];
}

export interface SubscribeApiResponse {
  success: boolean;
  message: string;
  error?: string;
}
