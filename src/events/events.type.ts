import { Event } from '@prisma/client';

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

export interface ScorecardResponse {
  liveTvUrl: string | null;
  scorecardUrl: string | null;
}

export type ScorecardFn = (event: Event) => Promise<string | null>;

export type TvFn = (
  event: Event,
  scorecardApiResponse?: any,
) => Promise<string | null>;
