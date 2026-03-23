export type MatchType = "singles" | "doubles";
export type RoundViewMode = "progressive" | "full";
export type EventStatus = "waiting" | "in_progress" | "completed";
export type ParticipantRole = "host" | "guest";
export type ParticipantGender = "male" | "female" | "unspecified";
export type SkillLevel = "high" | "medium" | "low";

export type Player = {
  id: string;
  name: string;
  gender?: ParticipantGender;
  skillLevel?: SkillLevel;
};

export type Match = {
  id?: string;
  court: number;
  teamA: Player[];
  teamB: Player[];
  scoreA?: number | null;
  scoreB?: number | null;
  isTieBreak?: boolean;
  completed?: boolean;
  skipped?: boolean;
};

export type Round = {
  id?: string;
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

export type Participant = {
  id: string;
  eventId: string;
  userId?: string | null;
  sessionId?: string | null;
  displayName: string;
  gender: ParticipantGender;
  skillLevel: SkillLevel;
  role: ParticipantRole;
  joinedAt?: string;
  isActive?: boolean;
};

export type Notification = {
  id: string;
  eventId: string;
  roundNumber: number;
  message: string;
  targetParticipantId?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
};

export type EventRecord = {
  id: string;
  code: string;
  eventName: string;
  hostUserId: string;
  matchType: MatchType;
  courtCount: number;
  roundCount: number;
  roundViewMode: RoundViewMode;
  status: EventStatus;
  participants: Participant[];
  rounds: Round[];
  stats: Record<string, PlayerStats>;
  notifications: Notification[];
  createdAt: string;
  updatedAt: string;
};

export type GuestAssignment = {
  type: "match" | "rest" | "waiting" | "done";
  roundNumber?: number;
  court?: number;
  teammates?: string[];
  opponents?: string[];
  message: string;
};
