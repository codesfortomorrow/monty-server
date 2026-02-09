import { SportType, StatusType } from '@prisma/client';

export interface CompetitionDto {
  id: number;
  name: string;
  externalId: string;
  startDate: Date | null;
}

export interface RunnerPrice {
  price: number;
  size: number;
}

export interface RunnerDto {
  handicap: number;
  runnerName: string;
  selectionId: string;
  sortPriority: number;
  status?: string;
  back?: RunnerPrice[];
  lay?: RunnerPrice[];
}

export interface EventDto {
  id: string;
  competitionId: number;
  providerId: number | null;
  externalId: string;
  name: string;
  sport: SportType;
  startTime: string;
  status: StatusType;
  isFancy: boolean;
  isBookmaker: boolean;
  isPopular: boolean;
  inplay: boolean;
  competition: CompetitionDto;
  runner: RunnerDto[];
}
