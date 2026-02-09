export interface EventResponse {
  eventId: string;
  eventName: string;
  startTime: string;
  isFancy: boolean;
  isBookmaker: boolean;
  isPopular: boolean;
  status: string;
}

export interface CloseEventResponse {
  id: string;
  competitionId: number;
  providerId: number;
  externalId: string;
  name: string;
  sport: string;
  startTime: string;
  status: string;
  isFancy: boolean;
  isBookmaker: boolean;
  isPopular: boolean;
  isResultDecleared: boolean;
  // createdAt: string;
  // updatedAt: string;
}
