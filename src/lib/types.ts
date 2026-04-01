export type MatchType = "singles" | "doubles";
export type RoundViewMode = "progressive" | "full";
export type EventStatus = "draft" | "waiting" | "recruiting" | "in_progress" | "completed_unsaved" | "completed" | "finished" | "cancelled" | "archived";
export type ParticipantRole = "host" | "guest";
export type ParticipantGender = "male" | "female" | "other" | "unspecified";
export type SkillLevel = "high" | "medium" | "low";
export type ScoreProposalStatus = "pending" | "accepted" | "disputed";
export type AppRole = "host" | "player";
export type AuthMode = "login" | "signup";
export type UserRole = "member" | "admin";
export type ClubRole = "owner" | "manager" | "member";
export type ParticipantSource = "host" | "joined" | "member" | "manual";
export type RoundCloseReason = "completed" | "force_closed" | "skipped";
export type RoundState = "waiting" | "assigned" | "playing" | "score_pending" | "disputed" | "completed";
export type ParticipantAvailabilityState = "active" | "unavailable" | "injured" | "left_early";
export type InvitationState = "pending" | "accepted" | "declined" | "expired";
export type NotificationType = "info" | "success" | "warning" | "invitation" | "dispute" | "approval" | "system";
export type EventType = "personal" | "club";
export type ClubStatus = "pending" | "approved" | "rejected" | "active" | "inactive" | "archived";
export type ClubVisibility = "public" | "private";
export type ClubApplicationStatus = "pending" | "approved" | "rejected";
export type ClubMembershipStatus = "pending" | "approved" | "rejected" | "left" | "banned";
export type ClubJoinRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type EventParticipantStatus = "active" | "unavailable" | "injured" | "left_early" | "removed" | "completed";
export type MatchStatus = "waiting" | "assigned" | "playing" | "score_pending" | "disputed" | "completed";
export type MatchApprovalStatus = "pending" | "approved" | "rejected";
export type MatchObjectionStatus = "pending" | "resolved" | "dismissed";
export type InteractionType = "same_match" | "same_team" | "opponent" | "same_event";
export type ParticipantActiveSessionStatus = "active" | "waiting" | "action_required" | "closed" | "expired";

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
  comments?: Array<{
    participantId: string;
    reason?: string | null;
    createdAt: string;
  }>;
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
  lastScoreUpdatedByName?: string | null;
  lastScoreUpdatedByUserId?: string | null;
  lastScoreUpdatedAt?: string | null;
};

export type Round = {
  id?: string;
  roundNumber: number;
  matches: Match[];
  restPlayers: Player[];
  completed?: boolean;
  forceClosed?: boolean;
  closeReason?: RoundCloseReason | null;
  state?: RoundState;
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
  joinedAsClubId?: string | null;
  displayName: string;
  gender: ParticipantGender;
  guestNtrp?: number | null;
  ntrpAtEvent?: number | null;
  hostSkillOverride?: SkillLevel | null;
  skillLevel: SkillLevel;
  role: ParticipantRole;
  source?: ParticipantSource;
  joinedAt?: string;
  isActive?: boolean;
  availabilityState?: ParticipantAvailabilityState;
  status?: EventParticipantStatus;
  leftAt?: string | null;
  lastActiveAt?: string | null;
  returnableUntil?: string | null;
};

export type ParticipantActiveSession = {
  id: string;
  eventId: string;
  participantId: string;
  userId: string;
  currentRoundId?: string | null;
  currentMatchId?: string | null;
  sessionStatus: ParticipantActiveSessionStatus;
  lastSeenAt: string;
  expiresAt?: string | null;
};

export type Notification = {
  id: string;
  eventId: string;
  roundNumber: number;
  message: string;
  targetParticipantId?: string | null;
  targetUserId?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
  type?: NotificationType;
  actionUrl?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
};

export type Invitation = {
  id: string;
  eventId: string;
  eventName: string;
  code: string;
  invitedUserId: string;
  invitedEmail?: string | null;
  invitedDisplayName: string;
  invitedByUserId: string;
  invitedByName: string;
  status: InvitationState;
  createdAt: string;
  respondedAt?: string | null;
  expiresAt?: string | null;
  actionUrl: string;
};

export type AuditLog = {
  id: string;
  eventId?: string | null;
  actorUserId: string;
  actorName: string;
  targetUserId?: string | null;
  action: string;
  reason?: string | null;
  previousValue?: string | null;
  nextValue?: string | null;
  createdAt: string;
};

export type EventRecord = {
  id: string;
  code: string;
  participationCode?: string;
  eventName: string;
  hostUserId: string;
  matchType: MatchType;
  eventType?: EventType;
  clubId?: string | null;
  maxPlayers?: number | null;
  courtCount: number;
  roundCount: number;
  roundViewMode: RoundViewMode;
  status: EventStatus;
  participants: Participant[];
  rounds: Round[];
  stats: Record<string, PlayerStats>;
  notifications: Notification[];
  invitations?: Invitation[];
  auditLogs?: AuditLog[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
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
  gender: ParticipantGender;
  genderLockedAt?: string | null;
  ntrp?: number | null;
  defaultNtrp?: number | null;
  roleLastSelected?: AppRole | null;
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
  joinedAsClubId?: string | null;
  joinedAsClubName?: string | null;
  participantRole?: ParticipantRole;
  rank: number;
  stats: PlayerStats;
};

export type SavedEventSummary = {
  id: string;
  sourceEventId: string;
  eventName: string;
  hostUserId: string;
  matchType: MatchType;
  eventType?: EventType;
  clubId?: string | null;
  clubName?: string | null;
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
  eventType?: EventType;
  clubId?: string | null;
  clubName?: string | null;
  userId: string;
  participantId: string;
  participantRole?: ParticipantRole;
  joinedAsClubId?: string | null;
  joinedAsClubName?: string | null;
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
  clubId?: string | null;
  clubName?: string | null;
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
  region?: string | null;
  description?: string | null;
  visibility?: ClubVisibility;
  createdByUserId: string;
  status?: ClubStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
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
  membershipStatus?: ClubMembershipStatus;
  joinedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  leftAt?: string | null;
  isActive?: boolean;
  deletedAt?: string | null;
};

export type ClubApplication = {
  id: string;
  applicantUserId: string;
  clubName: string;
  region: string;
  description?: string | null;
  status: ClubApplicationStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
};

export type ClubJoinRequest = {
  id: string;
  clubId: string;
  userId: string;
  status: ClubJoinRequestStatus;
  message?: string | null;
  requestedAt: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
};

export type PlayerStatsTotal = {
  userId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  updatedAt: string;
};

export type PlayerStatsByClub = {
  userId: string;
  clubId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  updatedAt: string;
};

export type ClubStats = {
  clubId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  updatedAt: string;
};

export type PlayerRating = {
  userId: string;
  ratingPoints: number;
  confidenceScore: number;
  ntrpSeed?: number | null;
  updatedAt: string;
};

export type PointTransaction = {
  id: string;
  eventId?: string | null;
  matchId?: string | null;
  userId: string;
  clubId?: string | null;
  basePoints: number;
  ntrpBonus: number;
  upsetBonus: number;
  closeGameBonus: number;
  totalPoints: number;
  memo?: string | null;
  createdAt: string;
};

export type PlayerInteraction = {
  id: string;
  eventId: string;
  matchId?: string | null;
  userId: string;
  otherUserId: string;
  interactionType: InteractionType;
  createdAt: string;
};

export type EventInviteRecord = {
  id: string;
  eventId: string;
  invitedUserId: string;
  invitedByUserId: string;
  status: InvitationState;
  inviteLinkToken: string;
  createdAt: string;
  respondedAt?: string | null;
  expiresAt?: string | null;
};

export type MatchScoreApproval = {
  id: string;
  matchId: string;
  eventParticipantId: string;
  approvalStatus: MatchApprovalStatus;
  createdAt: string;
  updatedAt: string;
};

export type MatchObjection = {
  id: string;
  matchId: string;
  eventParticipantId: string;
  reason?: string | null;
  status: MatchObjectionStatus;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
