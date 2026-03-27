export type MatchType = "singles" | "doubles";
export type RoundViewMode = "progressive" | "full";
export type EventStatus = "waiting" | "in_progress" | "completed";
export type ParticipantRole = "host" | "guest";
export type ParticipantGender = "male" | "female" | "unspecified";
export type SkillLevel = "high" | "medium" | "low";
export type ScoreProposalStatus = "pending" | "accepted" | "disputed";
export type AppRole = "host" | "player";
export type AuthMode = "login" | "signup";
export type UserRole = "member" | "admin";
export type ClubRole = "owner" | "manager" | "member";
export type ParticipantSource = "host" | "joined" | "member" | "manual";
export type RoundCloseReason = "completed" | "force_closed" | "skipped";

export type Player = {
  id: string;
  name: string;
  gender?: ParticipantGender;
  guestNtrp?: number | null;
  hostSkillOverride?: SkillLevel | null;
  skillLevel?: SkillLevel;
};

export type ScoreProposal = {
  scoreA: number;
  scoreB: number;
  submittedByParticipantId: string;
  submittedAt: string;
  acceptedByParticipantIds: string[];
  disputedByParticipantIds: string[];
  status: ScoreProposalStatus;
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
  scoreProposal?: ScoreProposal | null;
};

export type Round = {
  id?: string;
  roundNumber: number;
  matches: Match[];
  restPlayers: Player[];
  completed?: boolean;
  forceClosed?: boolean;
  closeReason?: RoundCloseReason | null;
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
  fairPlayWarning?: boolean;
  expectedGames?: number;
  expectedRests?: number;
  expectedShortage?: number;
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
  guestNtrp?: number | null;
  hostSkillOverride?: SkillLevel | null;
  skillLevel: SkillLevel;
  role: ParticipantRole;
  source?: ParticipantSource;
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
  isSaved?: boolean;
  savedAt?: string | null;
  savedByUserId?: string | null;
};

export type GuestAssignment = {
  type: "match" | "rest" | "waiting" | "done";
  roundNumber?: number;
  court?: number;
  teammates?: string[];
  opponents?: string[];
  message: string;
};

export type AuthIdentity = {
  id: string;
  email: string;
};

export type UserProfile = {
  id: string;
  email: string;
  loginId: string;
  realName: string;
  nickname: string;
  displayName: string;
  isAdmin: boolean;
  memo: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RankedPlayer = {
  participantId: string;
  userId?: string | null;
  name: string;
  gender: ParticipantGender;
  guestNtrp?: number | null;
  rank: number;
  stats: PlayerStats;
};

export type SavedEventSummary = {
  id: string;
  sourceEventId: string;
  eventName: string;
  hostUserId: string;
  matchType: MatchType;
  participantCount: number;
  playedAt: string;
  savedAt: string;
  ranking: RankedPlayer[];
  topThree: RankedPlayer[];
};

export type SavedEventRecord = SavedEventSummary & {
  snapshot: EventRecord;
};

export type UserEventHistory = {
  id: string;
  savedEventId: string;
  eventName: string;
  matchType: MatchType;
  userId: string;
  participantId: string;
  rank: number;
  stats: PlayerStats;
  createdAt: string;
};

export type PairHistoryRecord = {
  id: string;
  userId: string;
  pairedUserId: string;
  pairKey: string;
  pairedName: string;
  frequency: number;
  lastPlayedAt: string;
};

export type MatchHistoryRecord = {
  id: string;
  savedEventId: string;
  eventName: string;
  userId: string;
  participantId: string;
  roundNumber: number;
  courtNumber: number;
  result: "win" | "loss" | "skipped";
  scoreFor: number;
  scoreAgainst: number;
  teammates: string[];
  opponents: string[];
  createdAt: string;
};

export type AdminUserSummary = {
  profile: UserProfile;
  totalSavedEvents: number;
  totalMatches: number;
  wins: number;
  losses: number;
  pointsScored: number;
  pointsAllowed: number;
  pointDiff: number;
};

export type Club = {
  id: string;
  clubName: string;
  description?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  isActive?: boolean;
  deletedAt?: string | null;
};

export type ClubMember = {
  id: string;
  clubId: string;
  userId: string;
  role: ClubRole;
  joinedAt: string;
  isActive?: boolean;
  deletedAt?: string | null;
};
