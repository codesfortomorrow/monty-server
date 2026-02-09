interface RemoteEvent {
  event: { id: string; name: string; timezone?: string; openDate: string };
  marketCount?: string;
  matchId?: string;
  gameId?: string;
  name?: string;
  seriesId?: string;
  active?: boolean;
}

export interface RemoteSeries {
  competition: { id: string; name: string };
  competitionRegion?: string;
  marketCount?: string;
  match: RemoteEvent[];
}

export interface RemoteResponse {
  message?: string;
  data?: RemoteSeries[];
}

export interface ICompetition {
  sportName: string;
  sportId: string;
  competitionName: string;
  competitionId: string;
  competitionRegion: string;
  marketCount: number;
}

// export interface CompetitionResponse {

// }
