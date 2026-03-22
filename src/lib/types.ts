export type MatchType = "singles" | "doubles";

export type Player = {
  id: string;
  name: string;
};

export type Match = {
  court: number;
  teamA: Player[];
  teamB: Player[];
  scoreA?: number | null;
  scoreB?: number | null;
  isTieBreak?: boolean;
};

export type Round = {
  roundNumber: number;
  matches: Match[];
  restPlayers: Player[];
  completed?: boolean;
};

export type PlayerStats = {
  games: number;
  wins: number;
  losses: number;
  pointsScored: number;
  pointsAllowed: number;
  pointDiff: number;
  winRate: number;
  rests: number;
};

export type ScheduleRequest = {
  matchType: MatchType;
  courtCount: number;
  roundCount: number;
  players: Player[];
};

export type ScheduleResponse = {
  rounds: Round[];
  stats: Record<string, PlayerStats>;
};

export type StoredSchedule = {
  input: ScheduleRequest;
  output: ScheduleResponse;
};

export type MatchScore = {
  scoreA: number | null;
  scoreB: number | null;
};

export type ScoreMap = Record<string, MatchScore>;

export type SortDirection = "asc" | "desc";
