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

export interface GliveEventResponse {
  Match: GliveEvent[];
}

export interface GliveEvent {
  MatchID: string;
  Channel: string;
  TimeStart: string;
  UTCTimeStart: string;
  TimeStop: string;
  UTCTimeStop: string;
  Name: string;
  Home: string;
  Away: string;
  HomeCH: string;
  AwayCH: string;
  HomeTH: string;
  AwayTH: string;
  HomeCHTW: string;
  AwayCHTW: string;
  Type: string;
  League: string;
  LeagueCH: string;
  LeagueTH: string;
  LeagueCHTW: string;
  NowPlaying: number;
  IsLive: string;
  State: string;
  HomeScore: string;
  AwayScore: string;
  Hd: number;
}

export interface ScorecardResponse {
  liveTvUrl: string | null;
  scorecardUrl: string | null;
}

export type ScorecardFn = (event: Event) => Promise<string | null>;

export type TvFn = (
  event: Event,
  user?: {
    id: number;
    ip: string;
  },
) => Promise<string | null>;

export type CricketScoreCard = {
  matchId: string;
  matchName: string;
  betfairEventId: string;

  team1: {
    name: string;
    score: string;
    runRate: number | null;
    requiredRate?: number | null;
    isBatting: boolean;
  };

  team2: {
    name: string;
    score: string;
    runRate: number | null;
    requiredRate?: number | null;
    isBatting: boolean;
  };

  lastBalls: string[];

  innings?: {
    currentOver?: string;
    ballRunningStatus?: string;
    day?: string;
  };

  status: {
    isFinished: boolean;
    message?: string;
  };

  updatedAt: number;
};
