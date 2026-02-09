export interface WebhookMarketResult {
  market: string;
  eventId: string;
  marketId: string;
  selectionId: string | number;
  result: string | number;
  isRollback?: number;
  timestamp?: string;
}
