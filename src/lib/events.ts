import { generateSchedule, regenerateRoundsFrom } from "@/lib/scheduler";
import { createParticipant, resolveParticipantSkill } from "@/lib/participants";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import {
  createEventBroadcastChannel,
  getSessionId,
  loadEvents as loadCachedEvents,
  saveEvents as saveCachedEvents,
} from "@/lib/storage";
import {
  AuditLog,
  EventRecord,
  Invitation,
  Match,
  Notification,
  Participant,
  ParticipantGender,
  ParticipantAvailabilityState,
  Player,
  Round,
  RoundState,
  RoundViewMode,
  SkillLevel,
} from "@/lib/types";
import { accumulateRoundStats, createStatsRecord } from "@/lib/stats";
import { createEventNotification, createInvitationNotification, getGuestNotifications, markNotificationRead, notifyRoundCompletion } from "@/lib/notifications";
import { generateScheduleSchema } from "@/lib/validator";
import { calculateExpectedParticipation, calculateLeaderboard } from "@/lib/leaderboard";

type EventRow = {
  id: string;
  code: string | null;
  event_name: string;
  title?: string | null;
  host_user_id: string;
  match_type: EventRecord["matchType"];
  event_type?: EventRecord["eventType"] | null;
  club_id?: string | null;
  participation_code?: string | null;
  max_players?: number | null;
  court_count: number;
  round_count: number;
  round_view_mode: RoundViewMode;
  status: EventRecord["status"];
  state: EventRecord | null;
  is_saved?: boolean | null;
  saved_at?: string | null;
  saved_by_user_id?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeParticipants(participants: EventRecord["participants"] | null | undefined): EventRecord["participants"] {
  return safeArray(participants).filter(Boolean).map((participant) => ({
    ...participant,
    eventId: participant?.eventId ?? "",
    displayName: participant?.displayName ?? "",
    gender: participant?.gender ?? "unspecified",
    joinedAsClubId: participant?.joinedAsClubId ?? null,
    guestNtrp: typeof participant?.guestNtrp === "number" ? participant.guestNtrp : null,
    ntrpAtEvent: typeof participant?.ntrpAtEvent === "number" ? participant.ntrpAtEvent : (typeof participant?.guestNtrp === "number" ? participant.guestNtrp : null),
    hostSkillOverride: participant?.hostSkillOverride ?? null,
    skillLevel: resolveParticipantSkill({
      guestNtrp: typeof participant?.guestNtrp === "number" ? participant.guestNtrp : null,
      hostSkillOverride: participant?.hostSkillOverride ?? null,
    }),
    role: participant?.role ?? "guest",
    source: participant?.source ?? (participant?.role === "host" ? "host" : participant?.userId ? "joined" : "manual"),
    sessionId: participant?.sessionId ?? null,
    userId: participant?.userId ?? null,
    joinedAt: participant?.joinedAt ?? undefined,
    isActive: participant?.isActive ?? true,
    availabilityState: (participant?.availabilityState ?? "active") as ParticipantAvailabilityState,
  }));
}

function normalizeNotifications(notifications: Notification[] | null | undefined): Notification[] {
  return safeArray(notifications).filter(Boolean).map((notification) => ({
    ...notification,
    message: notification?.message ?? "",
    roundNumber: notification?.roundNumber ?? 0,
    targetParticipantId: notification?.targetParticipantId ?? null,
    targetUserId: notification?.targetUserId ?? null,
    readAt: notification?.readAt ?? null,
    createdAt: notification?.createdAt ?? null,
    type: notification?.type ?? "info",
    actionUrl: notification?.actionUrl ?? null,
    metadata: notification?.metadata ?? null,
  }));
}

function normalizeInvitations(invitations: Invitation[] | null | undefined, eventId: string, eventName: string, code: string): Invitation[] {
  return safeArray(invitations).filter(Boolean).map((invitation) => ({
    id: invitation.id,
    eventId: invitation.eventId ?? eventId,
    eventName: invitation.eventName ?? eventName,
    code: invitation.code ?? code,
    invitedUserId: invitation.invitedUserId,
    invitedEmail: invitation.invitedEmail ?? null,
    invitedDisplayName: invitation.invitedDisplayName ?? "",
    invitedByUserId: invitation.invitedByUserId,
    invitedByName: invitation.invitedByName,
    status: invitation.status ?? "pending",
    createdAt: invitation.createdAt ?? new Date().toISOString(),
    respondedAt: invitation.respondedAt ?? null,
    expiresAt: invitation.expiresAt ?? null,
    actionUrl: invitation.actionUrl ?? `/guest?eventId=${eventId}&invite=${invitation.id}`,
  }));
}

function normalizeAuditLogs(auditLogs: AuditLog[] | null | undefined): AuditLog[] {
  return safeArray(auditLogs).filter(Boolean).map((log) => ({
    id: log.id,
    eventId: log.eventId ?? null,
    actorUserId: log.actorUserId,
    actorName: log.actorName,
    targetUserId: log.targetUserId ?? null,
    action: log.action,
    reason: log.reason ?? null,
    previousValue: log.previousValue ?? null,
    nextValue: log.nextValue ?? null,
    createdAt: log.createdAt ?? new Date().toISOString(),
  }));
}

function normalizeRounds(rounds: EventRecord["rounds"] | null | undefined): EventRecord["rounds"] {
  return safeArray(rounds).filter(Boolean).map((round, roundIndex) => ({
    ...round,
    id: round?.id ?? undefined,
    roundNumber: round?.roundNumber ?? roundIndex + 1,
    completed: Boolean(round?.completed),
    forceClosed: Boolean(round?.forceClosed),
    closeReason: round?.closeReason ?? null,
    state: (round?.state ?? (round?.completed ? "completed" : "waiting")) as RoundState,
    restPlayers: safeArray(round?.restPlayers).filter(Boolean),
    matches: safeArray(round?.matches).filter(Boolean).map((match, matchIndex) => ({
      ...match,
      id: match?.id ?? undefined,
      court: match?.court ?? matchIndex + 1,
      teamA: safeArray(match?.teamA).filter(Boolean),
      teamB: safeArray(match?.teamB).filter(Boolean),
      scoreA: typeof match?.scoreA === "number" ? match.scoreA : null,
      scoreB: typeof match?.scoreB === "number" ? match.scoreB : null,
      isTieBreak: Boolean(match?.isTieBreak),
      completed: Boolean(match?.completed),
      skipped: Boolean(match?.skipped),
      scoreProposal: match?.scoreProposal
        ? {
            scoreA: match.scoreProposal.scoreA,
            scoreB: match.scoreProposal.scoreB,
            submittedByParticipantId: match.scoreProposal.submittedByParticipantId,
            submittedAt: match.scoreProposal.submittedAt,
            acceptedByParticipantIds: safeArray(match.scoreProposal.acceptedByParticipantIds),
            disputedByParticipantIds: safeArray(match.scoreProposal.disputedByParticipantIds),
            status: match.scoreProposal.status ?? "pending",
          }
        : null,
    })),
  }));
}

function normalizeStats(
  stats: EventRecord["stats"] | null | undefined,
  participants: EventRecord["participants"],
): EventRecord["stats"] {
  const nextStats = typeof stats === "object" && stats ? { ...stats } : {};
  for (const participant of participants) {
    if (!nextStats[participant.id]) {
      nextStats[participant.id] = {
        games: 0,
        wins: 0,
        losses: 0,
        pointsScored: 0,
        pointsAllowed: 0,
        pointDiff: 0,
        winRate: 0,
        rests: 0,
        expectedGames: 0,
        expectedRests: 0,
        expectedShortage: 0,
      };
    }
  }

  return nextStats;
}

function calculateEventStats(event: EventRecord): EventRecord["stats"] {
  return calculateLeaderboard(buildPlayers(event.participants), event.rounds, event.matchType);
}

function normalizeEventRecord(event: Partial<EventRecord> & Pick<EventRecord, "id">): EventRecord {
  const participants = normalizeParticipants(event.participants);
  const rounds = normalizeRounds(event.rounds);
  const notifications = normalizeNotifications(event.notifications);
  const invitations = normalizeInvitations(event.invitations, event.id, event.eventName ?? "", event.code ?? "");
  const auditLogs = normalizeAuditLogs(event.auditLogs);

  return {
    id: event.id,
    code: event.code ?? "",
    participationCode: event.participationCode ?? event.code ?? "",
    eventName: event.eventName ?? "",
    hostUserId: event.hostUserId ?? "",
    matchType: event.matchType ?? "singles",
    eventType: event.eventType ?? "personal",
    clubId: event.clubId ?? null,
    maxPlayers: typeof event.maxPlayers === "number" ? event.maxPlayers : null,
    courtCount: typeof event.courtCount === "number" ? event.courtCount : 1,
    roundCount: typeof event.roundCount === "number" ? event.roundCount : 1,
    roundViewMode: event.roundViewMode ?? "progressive",
    status: (event.status ?? "waiting") as EventRecord["status"],
    participants,
    rounds,
    stats: normalizeStats(event.stats, participants),
    notifications,
    invitations,
    auditLogs,
    createdAt: event.createdAt ?? new Date().toISOString(),
    updatedAt: event.updatedAt ?? new Date().toISOString(),
    startedAt: event.startedAt ?? null,
    finishedAt: event.finishedAt ?? null,
    isSaved: Boolean(event.isSaved),
    savedAt: event.savedAt ?? null,
    savedByUserId: event.savedByUserId ?? null,
  };
}

function formatSupabaseError(error: { code?: string; message?: string } | null): Error {
  if (error?.code === "PGRST205") {
    return new Error("Supabase events 테이블이 없습니다. supabase/schema.sql을 먼저 적용해 주세요.");
  }

  return new Error(error?.message ?? "Supabase 요청에 실패했습니다.");
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function makeEventCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function stampEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    updatedAt: new Date().toISOString(),
  };
}

function cacheEvent(event: EventRecord): void {
  const events = loadCachedEvents();
  const nextEvents = [...events];
  const index = nextEvents.findIndex((item) => item.id === event.id);
  if (index >= 0) {
    nextEvents[index] = event;
  } else {
    nextEvents.push(event);
  }
  saveCachedEvents(nextEvents);
}

function hydrateEvent(row: EventRow): EventRecord {
  try {
    const state = row.state;
    if (state) {
    const hydrated = normalizeEventRecord({
        ...state,
        id: state.id ?? row.id,
        code: state.code ?? row.code ?? "",
        eventName: state.eventName ?? row.event_name,
        hostUserId: state.hostUserId ?? row.host_user_id,
        matchType: state.matchType ?? row.match_type,
        eventType: state.eventType ?? row.event_type ?? "personal",
        clubId: state.clubId ?? row.club_id ?? null,
        participationCode: state.participationCode ?? row.participation_code ?? row.code ?? "",
        maxPlayers: state.maxPlayers ?? row.max_players ?? null,
        courtCount: state.courtCount ?? row.court_count,
        roundCount: state.roundCount ?? row.round_count,
        roundViewMode: state.roundViewMode ?? row.round_view_mode,
        status: toActiveEventStatus((state.status ?? row.status) as EventRecord["status"]),
        isSaved: state.isSaved ?? row.is_saved ?? false,
        savedAt: state.savedAt ?? row.saved_at ?? null,
        savedByUserId: state.savedByUserId ?? row.saved_by_user_id ?? null,
        createdAt: state.createdAt ?? row.created_at ?? new Date().toISOString(),
        updatedAt: state.updatedAt ?? row.updated_at ?? new Date().toISOString(),
        startedAt: state.startedAt ?? null,
        finishedAt: state.finishedAt ?? null,
      });
      cacheEvent(hydrated);
      return hydrated;
    }

    const fallback = normalizeEventRecord({
      id: row.id,
      code: row.code ?? "",
      eventName: row.event_name,
      hostUserId: row.host_user_id,
      matchType: row.match_type,
      eventType: row.event_type ?? "personal",
      clubId: row.club_id ?? null,
      participationCode: row.participation_code ?? row.code ?? "",
      maxPlayers: row.max_players ?? null,
      courtCount: row.court_count,
      roundCount: row.round_count,
      roundViewMode: row.round_view_mode,
      status: toActiveEventStatus(row.status as EventRecord["status"]),
      participants: [],
      rounds: [],
      stats: {},
      notifications: [],
      isSaved: row.is_saved ?? false,
      savedAt: row.saved_at ?? null,
      savedByUserId: row.saved_by_user_id ?? null,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });
    cacheEvent(fallback);
    return fallback;
  } catch (error) {
    console.error("[events] hydrateEvent failed", error, row);
    return normalizeEventRecord({
      id: row.id,
      code: row.code ?? "",
      eventName: row.event_name,
      hostUserId: row.host_user_id,
      matchType: row.match_type,
      eventType: row.event_type ?? "personal",
      clubId: row.club_id ?? null,
      participationCode: row.participation_code ?? row.code ?? "",
      maxPlayers: row.max_players ?? null,
      courtCount: row.court_count,
      roundCount: row.round_count,
      roundViewMode: row.round_view_mode,
      status: toActiveEventStatus(row.status as EventRecord["status"]),
      participants: [],
      rounds: [],
      stats: {},
      notifications: [],
      isSaved: row.is_saved ?? false,
      savedAt: row.saved_at ?? null,
      savedByUserId: row.saved_by_user_id ?? null,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });
  }
}

async function persistEvent(event: EventRecord): Promise<void> {
  cacheEvent(event);

  if (!isSupabaseEnabled()) {
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("events").upsert(
    {
      id: event.id,
      code: event.code,
      event_name: event.eventName,
      title: event.eventName,
      host_user_id: event.hostUserId,
      match_type: event.matchType,
      event_type: event.eventType ?? "personal",
      club_id: event.clubId ?? null,
      participation_code: event.participationCode ?? event.code,
      max_players: event.maxPlayers ?? null,
      court_count: event.courtCount,
      round_count: event.roundCount,
      round_view_mode: event.roundViewMode,
      status: event.status,
      state: event,
      is_saved: event.isSaved ?? false,
      saved_at: event.savedAt ?? null,
      saved_by_user_id: event.savedByUserId ?? null,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw formatSupabaseError(error);
  }
}

async function loadEventsFromSource(): Promise<EventRecord[]> {
  try {
    if (!isSupabaseEnabled()) {
      return loadCachedEvents();
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return loadCachedEvents();
    }

    const { data, error } = await supabase
      .from("events")
      .select("id, code, event_name, title, host_user_id, match_type, event_type, club_id, participation_code, max_players, court_count, round_count, round_view_mode, status, state, is_saved, saved_at, saved_by_user_id, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error || !data) {
      if (error?.code === "PGRST205") {
        return loadCachedEvents();
      }
      console.error("[events] loadEventsFromSource failed", error);
      return loadCachedEvents();
    }

    const events = safeArray(data as EventRow[]).map(hydrateEvent);
    saveCachedEvents(events);
    return events;
  } catch (error) {
    console.error("[events] loadEventsFromSource exception", error);
    return loadCachedEvents();
  }
}

export async function loadAllEvents(): Promise<EventRecord[]> {
  return loadEventsFromSource();
}

function emitEventUpdate(event: EventRecord): void {
  const channel = createEventBroadcastChannel(event.id);
  channel?.postMessage({ type: "event_updated", eventId: event.id });
  channel?.close();

  if (!isSupabaseEnabled()) {
    return;
  }

  const supabase = getSupabaseClient();
  const realtimeChannel = supabase?.channel(`event:${event.id}`, {
    config: {
      broadcast: { self: true },
    },
  });

  realtimeChannel?.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void realtimeChannel.send({
        type: "broadcast",
        event: "event_updated",
        payload: { eventId: event.id },
      });

      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          void supabase?.removeChannel(realtimeChannel);
        }, 1000);
      }
    }
  });
}

function buildPlayers(participants: Participant[]): Player[] {
  return participants.map((participant) => ({
    id: participant.id,
    name: participant.displayName,
    gender: participant.gender,
    guestNtrp: participant.guestNtrp ?? null,
    hostSkillOverride: participant.hostSkillOverride ?? null,
    skillLevel: participant.skillLevel,
  }));
}

function uniquePlayers(players: Player[]): Player[] {
  const map = new Map<string, Player>();
  for (const player of players) {
    if (player?.id) {
      map.set(player.id, player);
    }
  }
  return Array.from(map.values());
}

function buildMatchFromPlayerIds(
  matchType: EventRecord["matchType"],
  court: number,
  playerIds: string[],
  playerMap: Map<string, Player>,
): Match {
  const selectedPlayers = playerIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  if (matchType === "singles") {
    return {
      court,
      teamA: selectedPlayers.slice(0, 1),
      teamB: selectedPlayers.slice(1, 2),
      scoreA: null,
      scoreB: null,
      isTieBreak: false,
      skipped: false,
      completed: false,
      scoreProposal: null,
    };
  }

  return {
    court,
    teamA: selectedPlayers.slice(0, 2),
    teamB: selectedPlayers.slice(2, 4),
    scoreA: null,
    scoreB: null,
    isTieBreak: false,
    skipped: false,
    completed: false,
    scoreProposal: null,
  };
}

function validateParticipants(participants: Participant[]): void {
  const normalizedNames = participants.map((participant) => participant.displayName.trim().toLowerCase());
  if (normalizedNames.some((name) => !name)) {
    throw new Error("참가자 이름은 비어 있을 수 없습니다.");
  }

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("이미 같은 이름의 참가자가 있습니다.");
  }

  const userIds = participants.map((participant) => participant.userId).filter(Boolean) as string[];
  if (new Set(userIds).size !== userIds.length) {
    throw new Error("이미 추가된 회원입니다.");
  }

  const participantIds = participants.map((participant) => participant.id).filter(Boolean);
  if (new Set(participantIds).size !== participantIds.length) {
    throw new Error("중복된 참가자 정보가 있습니다.");
  }
}

function withMatchIds(rounds: Round[]): Round[] {
  return rounds.map((round) => ({
    ...round,
    id: round.id ?? makeId(`round_${round.roundNumber}`),
    forceClosed: Boolean(round.forceClosed),
    closeReason: round.closeReason ?? null,
    matches: round.matches.map((match) => ({
      ...match,
      id: match.id ?? makeId(`match_${round.roundNumber}_${match.court}`),
      completed: Boolean(match.completed),
    })),
  }));
}

function withDerivedEventState(event: EventRecord): EventRecord {
  return {
    ...event,
    stats: calculateEventStats(event),
  };
}

function toActiveEventStatus(status: EventRecord["status"]): EventRecord["status"] {
  if (status === "finished" || status === "completed") {
    return "finished";
  }

  if (status === "draft" || status === "waiting") {
    return "recruiting";
  }

  return status;
}

function currentRoundState(round: Round): RoundState {
  if (round.completed) {
    return "completed";
  }

  if (round.matches.some((match) => match.scoreProposal?.status === "disputed")) {
    return "disputed";
  }

  if (round.matches.some((match) => match.scoreProposal)) {
    return "score_pending";
  }

  if (round.matches.length > 0) {
    return "playing";
  }

  return "waiting";
}

async function updateEvent(eventId: string, updater: (event: EventRecord) => EventRecord): Promise<EventRecord | null> {
  const currentEvent = await loadEvent(eventId);
  if (!currentEvent) {
    return null;
  }

  const nextEvent = stampEvent(updater(currentEvent));
  await persistEvent(nextEvent);
  emitEventUpdate(nextEvent);
  return nextEvent;
}

function makeInviteLink(eventId: string, invitationId: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const path = `/guest?eventId=${eventId}&invite=${invitationId}`;
  return base ? `${base}${path}` : path;
}

function isInvitationExpired(invitation: Invitation): boolean {
  if (!invitation.expiresAt) {
    return false;
  }

  return new Date(invitation.expiresAt).getTime() < Date.now();
}

function appendAuditLog(event: EventRecord, input: Omit<AuditLog, "id" | "createdAt">): AuditLog[] {
  return [
    ...safeArray(event.auditLogs),
    {
      id: makeId("audit"),
      createdAt: new Date().toISOString(),
      ...input,
    },
  ];
}

export async function createMemberInvitations(
  eventId: string,
  input: {
    invitedUserIds: string[];
    invitedByUserId: string;
    invitedByName: string;
    userDirectory?: Array<{ id: string; email: string; displayName: string }>;
  },
): Promise<EventRecord | null> {
  const uniqueUserIds = Array.from(new Set(input.invitedUserIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return loadEvent(eventId);
  }

  return updateEvent(eventId, (event) => {
    const nextInvitations = [...safeArray(event.invitations)];
    const nextNotifications = [...event.notifications];
    for (const invitedUserId of uniqueUserIds) {
      const alreadyJoined = event.participants.some((participant) => participant.userId === invitedUserId);
      if (alreadyJoined) {
        continue;
      }

      const existingPending = nextInvitations.find(
        (invitation) => invitation.invitedUserId === invitedUserId && invitation.status === "pending" && !isInvitationExpired(invitation),
      );
      if (existingPending) {
        continue;
      }

      const invitedUser = input.userDirectory?.find((user) => user.id === invitedUserId);
      const invitationId = makeId("invite");
      const invitation: Invitation = {
        id: invitationId,
        eventId: event.id,
        eventName: event.eventName,
        code: event.code,
        invitedUserId,
        invitedEmail: invitedUser?.email ?? null,
        invitedDisplayName: invitedUser?.displayName ?? invitedUser?.email ?? "회원",
        invitedByUserId: input.invitedByUserId,
        invitedByName: input.invitedByName,
        status: "pending",
        createdAt: new Date().toISOString(),
        respondedAt: null,
        expiresAt: null,
        actionUrl: makeInviteLink(event.id, invitationId),
      };
      nextInvitations.push(invitation);
      nextNotifications.push(createInvitationNotification(invitation));
    }

    return {
      ...event,
      invitations: nextInvitations,
      notifications: nextNotifications,
    };
  });
}

export async function updateInvitationStatus(
  eventId: string,
  invitationId: string,
  status: Invitation["status"],
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    invitations: safeArray(event.invitations).map((invitation) => {
      if (invitation.id !== invitationId) {
        return invitation;
      }

      return {
        ...invitation,
        status: isInvitationExpired(invitation) && status === "pending" ? "expired" : status,
        respondedAt: status === "pending" ? invitation.respondedAt ?? null : new Date().toISOString(),
      };
    }),
  }));
}

export async function loadUserInvitations(userId: string): Promise<Invitation[]> {
  if (!userId) {
    return [];
  }

  const events = await loadEventsFromSource();
  return events
    .flatMap((event) => safeArray(event.invitations))
    .filter((invitation) => invitation.invitedUserId === userId)
    .map((invitation) =>
      isInvitationExpired(invitation) && invitation.status === "pending"
        ? { ...invitation, status: "expired" as const }
        : invitation,
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function createEvent(input: {
  eventName: string;
  matchType: "singles" | "doubles";
  eventType?: EventRecord["eventType"];
  clubId?: string | null;
  courtCount: number;
  roundCount: number;
  roundViewMode: RoundViewMode;
  hostName: string;
  hostUserId?: string;
}): Promise<{ event: EventRecord; hostParticipant: Participant }> {
  const sessionId = input.hostUserId ?? getSessionId("host");
  const eventId = makeId("event");
  const participationCode = makeEventCode();
  const hostParticipant = createParticipant({
    eventId,
    displayName: input.hostName.trim(),
    role: "host",
    sessionId,
    userId: input.hostUserId ?? sessionId,
    joinedAsClubId: input.eventType === "club" ? input.clubId ?? null : null,
    gender: "unspecified",
    guestNtrp: null,
    hostSkillOverride: "medium",
    source: "host",
  });

  const event: EventRecord = {
    id: eventId,
    code: participationCode,
    participationCode,
    eventName: input.eventName.trim(),
    hostUserId: sessionId,
    matchType: input.matchType,
    eventType: input.eventType ?? "personal",
    clubId: input.eventType === "club" ? input.clubId ?? null : null,
    maxPlayers: null,
    courtCount: input.courtCount,
    roundCount: input.roundCount,
    roundViewMode: input.roundViewMode,
    status: "recruiting",
    participants: [hostParticipant],
    rounds: [],
    stats: createStatsRecord([{ id: hostParticipant.id, name: hostParticipant.displayName }]),
    notifications: [],
    invitations: [],
    auditLogs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    isSaved: false,
    savedAt: null,
    savedByUserId: null,
  };

  await persistEvent(event);
  emitEventUpdate(event);
  return { event, hostParticipant };
}

export async function loadEvent(eventId: string): Promise<EventRecord | null> {
  if (!eventId?.trim()) {
    return null;
  }

  try {
    if (!isSupabaseEnabled()) {
      return loadCachedEvents().find((event) => event.id === eventId) ?? null;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return loadCachedEvents().find((event) => event.id === eventId) ?? null;
    }

    const { data, error } = await supabase
      .from("events")
      .select("id, code, event_name, title, host_user_id, match_type, event_type, club_id, participation_code, max_players, court_count, round_count, round_view_mode, status, state, is_saved, saved_at, saved_by_user_id, created_at, updated_at")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !data) {
      if (error?.code === "PGRST205") {
        return loadCachedEvents().find((event) => event.id === eventId) ?? null;
      }
      console.error("[events] loadEvent failed", { eventId, error });
      return loadCachedEvents().find((event) => event.id === eventId) ?? null;
    }

    return hydrateEvent(data as EventRow);
  } catch (error) {
    console.error("[events] loadEvent exception", { eventId, error });
    return loadCachedEvents().find((event) => event.id === eventId) ?? null;
  }
}

export async function findEventByCodeOrName(query: string): Promise<EventRecord | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const events = await loadEventsFromSource();
  return (
    events.find(
      (event) =>
        event.id.toLowerCase() === normalized ||
        event.code.toLowerCase() === normalized ||
        event.eventName.toLowerCase() === normalized,
    ) ?? null
  );
}

export async function joinEvent(
  eventId: string,
  input: {
    displayName: string;
    gender: ParticipantGender;
    guestNtrp?: number | null;
    userId?: string | null;
    joinedAsClubId?: string | null;
    inviteId?: string | null;
  },
): Promise<Participant | null> {
  const sessionId = getSessionId("guest");
  const event = await loadEvent(eventId);
  if (!event) {
    throw new Error("유효하지 않은 참여 링크입니다.");
  }

  if (event.status === "finished" || event.status === "completed" || event.status === "archived") {
    throw new Error("이미 종료된 이벤트입니다.");
  }

  const normalizedName = input.displayName.trim();
  const existingByUser = input.userId
    ? event.participants.find((participant) => participant.userId === input.userId)
    : null;
  const existingBySession = event.participants.find((participant) => participant.sessionId === sessionId);
  if (existingByUser) {
    if (input.inviteId) {
      await updateInvitationStatus(eventId, input.inviteId, "accepted");
    }
    return existingByUser;
  }
  if (existingBySession) {
    if (input.inviteId) {
      await updateInvitationStatus(eventId, input.inviteId, "accepted");
    }
    return existingBySession;
  }

  const duplicateName = event.participants.some(
    (participant) => participant.displayName.trim().toLowerCase() === normalizedName.toLowerCase(),
  );
  if (duplicateName) {
    throw new Error("이미 같은 이름의 참가자가 있습니다.");
  }

  const nextParticipant = createParticipant({
    eventId,
    sessionId,
    userId: input.userId ?? null,
    joinedAsClubId: input.joinedAsClubId ?? null,
    displayName: normalizedName,
    gender: input.gender,
    guestNtrp: input.guestNtrp ?? null,
    ntrpAtEvent: input.guestNtrp ?? null,
    hostSkillOverride: null,
    role: "guest",
    source: "joined",
  });

  await updateEvent(eventId, (currentEvent) => ({
      ...currentEvent,
      participants: [...currentEvent.participants, nextParticipant],
      invitations: safeArray(currentEvent.invitations).map((invitation) =>
        invitation.id === input.inviteId
          ? {
              ...invitation,
              status: "accepted",
              respondedAt: new Date().toISOString(),
            }
          : invitation,
      ),
      notifications: [
        ...currentEvent.notifications,
        createEventNotification({
          eventId,
          message: `${normalizedName}님이 이벤트에 참여했습니다.`,
          type: "success",
        }),
      ],
    }));

  return nextParticipant;
}

export async function saveParticipants(eventId: string, participants: Participant[]): Promise<EventRecord | null> {
  validateParticipants(participants);

  const normalizedParticipants = participants.map((participant) => ({
    ...participant,
    guestNtrp: participant.guestNtrp ?? null,
    hostSkillOverride: participant.hostSkillOverride ?? null,
    skillLevel: resolveParticipantSkill({
      guestNtrp: participant.guestNtrp ?? null,
      hostSkillOverride: participant.hostSkillOverride ?? null,
    }),
    source: participant.source ?? (participant.role === "host" ? "host" : participant.userId ? "joined" : "manual"),
  }));

  return updateEvent(eventId, (event) => {
    const nextEvent = {
      ...event,
      participants: normalizedParticipants,
      stats: createStatsRecord(buildPlayers(normalizedParticipants)),
    };

    return {
      ...nextEvent,
      stats: calculateEventStats(nextEvent),
    };
  });
}

export async function generateEventSchedule(eventId: string): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const players = buildPlayers(event.participants);
  if (event.matchType === "doubles" && event.participants.length < event.courtCount * 4) {
    throw new Error(`복식은 최소 ${event.courtCount * 4}명이 필요합니다.`);
  }

  const validation = generateScheduleSchema.safeParse({
    matchType: event.matchType,
    courtCount: event.courtCount,
    roundCount: event.roundCount,
    players,
  });

  if (!validation.success) {
    throw new Error(validation.error.errors[0]?.message ?? "Invalid event setup.");
  }

  const schedule = generateSchedule({
    matchType: event.matchType,
    courtCount: event.courtCount,
    roundCount: event.roundCount,
    players,
  });

  return updateEvent(eventId, (currentEvent) =>
    withDerivedEventState({
      ...currentEvent,
      roundCount: schedule.rounds.length,
      rounds: withMatchIds(schedule.rounds).map((round, index) => ({
        ...round,
        state: index === 0 ? "assigned" : "waiting",
      })),
      stats: createStatsRecord(players),
      notifications: [],
      status: "in_progress",
    }),
  );
}

function isValidScore(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  return (
    (scoreA === 6 && typeof scoreB === "number" && scoreB >= 0 && scoreB <= 5) ||
    (scoreB === 6 && typeof scoreA === "number" && scoreA >= 0 && scoreA <= 5)
  );
}

function hasConfirmedNonStandardScore(match: Round["matches"][number]): boolean {
  return Boolean(
    match.scoreProposal?.status === "accepted" &&
    Number.isInteger(match.scoreA) &&
    Number.isInteger(match.scoreB),
  );
}

function canFinalizeMatch(match: Round["matches"][number]): boolean {
  if (match.skipped) {
    return true;
  }

  return isValidScore(match.scoreA, match.scoreB) || hasConfirmedNonStandardScore(match);
}

function getMatchParticipantIds(round: Round, matchId: string): string[] {
  const match = safeArray(round.matches).find((item) => item.id === matchId);
  if (!match) {
    return [];
  }

  return [...safeArray(match.teamA), ...safeArray(match.teamB)].map((player) => player.id);
}

function isConfirmationRequiredParticipant(event: EventRecord, participantId: string): boolean {
  const participant = safeArray(event.participants).find((item) => item.id === participantId);
  return Boolean(participant && participant.userId && (participant.source === "joined" || participant.source === "host"));
}

export async function finalizeRound(eventId: string, roundNumber: number): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = event.rounds.find((round) => round.roundNumber === roundNumber);
  if (!targetRound) {
    return null;
  }

  for (const match of targetRound.matches) {
    if (!canFinalizeMatch(match)) {
      throw new Error("현재 라운드의 모든 경기는 6:0부터 6:5 사이의 완료 점수여야 합니다.");
    }
  }

  return updateEvent(eventId, (currentEvent) => {
    const nextRounds = currentEvent.rounds.map((round) =>
      round.roundNumber === roundNumber
        ? {
            ...round,
            completed: true,
            forceClosed: Boolean(round.forceClosed),
            closeReason: round.forceClosed ? round.closeReason ?? "force_closed" : "completed",
            state: "completed" as const,
            matches: round.matches.map((match) => ({
              ...match,
              completed: true,
              isTieBreak:
                (match.scoreA === 6 && match.scoreB === 5) ||
                (match.scoreA === 5 && match.scoreB === 6),
            })),
          }
        : round,
    ) as Round[];

    const completedRounds = nextRounds.filter((round) => round.completed);
    let stats = createStatsRecord(buildPlayers(currentEvent.participants));
    for (const round of completedRounds) {
      stats = accumulateRoundStats(stats, round, currentEvent.matchType);
    }

    const notifications = notifyRoundCompletion({
      event: currentEvent,
      rounds: nextRounds,
      completedRoundNumber: roundNumber,
    });

    const allCompleted = nextRounds.length > 0 && nextRounds.every((round) => round.completed);

    return withDerivedEventState({
      ...currentEvent,
      rounds: nextRounds,
      stats,
      notifications,
      status: (allCompleted ? "finished" : "in_progress") as EventRecord["status"],
    });
  });
}

export async function updateMatchScores(
  eventId: string,
  roundNumber: number,
  matchId: string,
  scores: { scoreA: number | null; scoreB: number | null },
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) =>
    withDerivedEventState({
      ...event,
      rounds: event.rounds.map((round) =>
        round.roundNumber === roundNumber
        ? {
            ...round,
            state: currentRoundState({
              ...round,
              matches: round.matches.map((match) =>
                match.id === matchId
                  ? {
                      ...match,
                      scoreA: scores.scoreA,
                      scoreB: scores.scoreB,
                      scoreProposal: null,
                      isTieBreak:
                        (scores.scoreA === 6 && scores.scoreB === 5) ||
                        (scores.scoreA === 5 && scores.scoreB === 6),
                    }
                  : match,
              ),
            }),
            matches: round.matches.map((match) =>
                match.id === matchId
                  ? {
                      ...match,
                      scoreA: scores.scoreA,
                      scoreB: scores.scoreB,
                      scoreProposal: null,
                      isTieBreak:
                        (scores.scoreA === 6 && scores.scoreB === 5) ||
                        (scores.scoreA === 5 && scores.scoreB === 6),
                    }
                  : match,
              ),
            }
          : round,
      ),
    }),
  );
}

export async function submitMatchScoreProposal(
  eventId: string,
  roundNumber: number,
  matchId: string,
  participantId: string,
  scores: { scoreA: number; scoreB: number },
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) =>
    withDerivedEventState({
      ...event,
      rounds: event.rounds.map((round) =>
        round.roundNumber === roundNumber
          ? {
              ...round,
              state: "score_pending",
              matches: round.matches.map((match) =>
                match.id === matchId
                  ? {
                      ...match,
                      scoreProposal: {
                        scoreA: scores.scoreA,
                        scoreB: scores.scoreB,
                        submittedByParticipantId: participantId,
                        submittedAt: new Date().toISOString(),
                        acceptedByParticipantIds: [],
                        disputedByParticipantIds: [],
                        status: "pending",
                      },
                    }
                  : match,
              ),
            }
          : round,
      ),
    }),
  );
}

export async function respondToScoreProposal(
  eventId: string,
  roundNumber: number,
  matchId: string,
  participantId: string,
  response: "accept" | "dispute",
  reason?: string | null,
): Promise<EventRecord | null> {
  const nextEvent = await updateEvent(eventId, (event) => {
    const hostParticipant = safeArray(event.participants).find((participant) => participant.role === "host");
    const actorParticipant = safeArray(event.participants).find((participant) => participant.id === participantId);
    const hasExistingDisputeNotification = safeArray(event.notifications).some(
      (notification) =>
        notification.type === "dispute" &&
        notification.metadata?.matchId === matchId &&
        notification.metadata?.participantId === participantId,
    );

    return withDerivedEventState({
      ...event,
      notifications:
        response === "dispute" && hostParticipant && !hasExistingDisputeNotification
          ? [
              ...event.notifications,
              createEventNotification({
                eventId,
                roundNumber,
                targetParticipantId: hostParticipant.id,
                targetUserId: hostParticipant.userId ?? null,
                message: `점수 이의신청 발생: Round ${roundNumber}, Match ${matchId}`,
                type: "dispute",
                metadata: {
                  matchId,
                  participantId,
                  roundNumber,
                },
              }),
            ]
          : event.notifications,
      rounds: event.rounds.map((round) => {
        if (round.roundNumber !== roundNumber) {
          return round;
        }

        const participantIds = getMatchParticipantIds(round, matchId);
        return {
          ...round,
          state: currentRoundState({
            ...round,
            matches: round.matches.map((match) => {
              if (match.id !== matchId || !match.scoreProposal) {
                return match;
              }

              const acceptedByParticipantIds =
                response === "accept"
                  ? Array.from(new Set([...match.scoreProposal.acceptedByParticipantIds, participantId]))
                  : match.scoreProposal.acceptedByParticipantIds;

              const disputedByParticipantIds =
                response === "dispute"
                  ? Array.from(new Set([...match.scoreProposal.disputedByParticipantIds, participantId]))
                  : match.scoreProposal.disputedByParticipantIds;

              const requiredAcceptCount =
                participantIds.length >= 4
                  ? 3
                  : Math.max(
                      participantIds.filter(
                        (id) =>
                          id !== match.scoreProposal?.submittedByParticipantId &&
                          isConfirmationRequiredParticipant(event, id),
                      ).length,
                      0,
                    );
              const accepted = acceptedByParticipantIds.length >= requiredAcceptCount && disputedByParticipantIds.length === 0;

              return {
                ...match,
                scoreA: accepted ? match.scoreProposal.scoreA : match.scoreA ?? null,
                scoreB: accepted ? match.scoreProposal.scoreB : match.scoreB ?? null,
                isTieBreak:
                  accepted &&
                  ((match.scoreProposal.scoreA === 6 && match.scoreProposal.scoreB === 5) ||
                    (match.scoreProposal.scoreA === 5 && match.scoreProposal.scoreB === 6)),
                scoreProposal: {
                  ...match.scoreProposal,
                  acceptedByParticipantIds,
                  disputedByParticipantIds,
                  comments:
                    response === "dispute"
                      ? [
                          ...safeArray(match.scoreProposal.comments),
                          {
                            participantId,
                            reason: reason ?? null,
                            createdAt: new Date().toISOString(),
                          },
                        ]
                      : safeArray(match.scoreProposal.comments),
                  status: disputedByParticipantIds.length > 0 ? "disputed" : accepted ? "accepted" : "pending",
                },
              };
            }),
          }),
          matches: round.matches.map((match) => {
            if (match.id !== matchId || !match.scoreProposal) {
              return match;
            }

            const acceptedByParticipantIds =
              response === "accept"
                ? Array.from(new Set([...match.scoreProposal.acceptedByParticipantIds, participantId]))
                : match.scoreProposal.acceptedByParticipantIds;

            const disputedByParticipantIds =
              response === "dispute"
                ? Array.from(new Set([...match.scoreProposal.disputedByParticipantIds, participantId]))
                : match.scoreProposal.disputedByParticipantIds;

            const requiredAcceptCount =
              participantIds.length >= 4
                ? 3
                : Math.max(
                    participantIds.filter(
                      (id) =>
                        id !== match.scoreProposal?.submittedByParticipantId &&
                        isConfirmationRequiredParticipant(event, id),
                    ).length,
                    0,
                  );
            const accepted = acceptedByParticipantIds.length >= requiredAcceptCount && disputedByParticipantIds.length === 0;

            return {
              ...match,
              scoreA: accepted ? match.scoreProposal.scoreA : match.scoreA ?? null,
              scoreB: accepted ? match.scoreProposal.scoreB : match.scoreB ?? null,
              isTieBreak:
                accepted &&
                ((match.scoreProposal.scoreA === 6 && match.scoreProposal.scoreB === 5) ||
                  (match.scoreProposal.scoreA === 5 && match.scoreProposal.scoreB === 6)),
              scoreProposal: {
                ...match.scoreProposal,
                acceptedByParticipantIds,
                disputedByParticipantIds,
                comments:
                  response === "dispute"
                    ? [
                        ...safeArray(match.scoreProposal.comments),
                        {
                          participantId,
                          reason: reason ?? null,
                          createdAt: new Date().toISOString(),
                        },
                      ]
                    : safeArray(match.scoreProposal.comments),
                status: disputedByParticipantIds.length > 0 ? "disputed" : accepted ? "accepted" : "pending",
              },
            };
          }),
        };
      }),
      auditLogs:
        response === "dispute" && actorParticipant?.userId
          ? appendAuditLog(event, {
              eventId,
              actorUserId: actorParticipant.userId,
              actorName: actorParticipant.displayName,
              targetUserId: hostParticipant?.userId ?? null,
              action: "match_disputed",
              reason: reason ?? null,
            })
          : event.auditLogs ?? [],
    });
  });

  if (!nextEvent) {
    return null;
  }

  const updatedRound = safeArray(nextEvent.rounds).find((round) => round.roundNumber === roundNumber);
  if (updatedRound && !updatedRound.completed && updatedRound.matches.every((match) => canFinalizeMatch(match))) {
    return finalizeRound(eventId, roundNumber);
  }

  return nextEvent;
}

export async function skipMatch(eventId: string, roundNumber: number, matchId: string): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) =>
    withDerivedEventState({
      ...event,
      rounds: event.rounds.map((round) =>
        round.roundNumber === roundNumber
          ? {
              ...round,
              matches: round.matches.map((match) =>
                match.id === matchId
                  ? {
                      ...match,
                      skipped: !match.skipped,
                      scoreA: null,
                      scoreB: null,
                    }
                  : match,
              ),
            }
          : round,
      ),
    }),
  );
}

export async function forceCloseRound(
  eventId: string,
  roundNumber: number,
  audit?: { actorUserId: string; actorName: string; reason?: string | null },
): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  return updateEvent(eventId, (currentEvent) => {
    const nextRounds = currentEvent.rounds.map((round) =>
      round.roundNumber === roundNumber
        ? {
            ...round,
            completed: true,
            forceClosed: true,
            closeReason: "skipped" as const,
            state: "completed" as const,
            matches: round.matches.map((match) => ({
              ...match,
              skipped: true,
              completed: true,
              scoreA: null,
              scoreB: null,
              scoreProposal: null,
            })),
          }
        : round,
    ) as Round[];

    const nextEvent = {
      ...currentEvent,
      rounds: nextRounds,
      status: (nextRounds.every((round) => round.completed) ? "finished" : "in_progress") as EventRecord["status"],
      notifications: [
        ...notifyRoundCompletion({
          event: currentEvent,
          rounds: nextRounds,
          completedRoundNumber: roundNumber,
        }),
        createEventNotification({
          eventId,
          roundNumber,
          message: "호스트가 현재 라운드를 강제 종료했습니다.",
          type: "warning",
        }),
      ],
      auditLogs: audit
        ? appendAuditLog(currentEvent, {
            eventId,
            actorUserId: audit.actorUserId,
            actorName: audit.actorName,
            action: "round_force_closed",
            reason: audit.reason ?? null,
          })
        : currentEvent.auditLogs ?? [],
    };

    return withDerivedEventState(nextEvent);
  });
}

export async function reassignRound(
  eventId: string,
  roundNumber: number,
  audit?: { actorUserId: string; actorName: string; reason?: string | null },
): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = event.rounds.find((round) => round.roundNumber === roundNumber);
  if (!targetRound) {
    return null;
  }

  const players = buildPlayers(event.participants);
  const regeneratedRounds = regenerateRoundsFrom({
    matchType: event.matchType,
    courtCount: event.courtCount,
    roundCount: event.roundCount,
    players,
    existingRounds: event.rounds,
    startRoundNumber: roundNumber,
  });

  return updateEvent(eventId, (currentEvent) =>
    withDerivedEventState({
      ...currentEvent,
      auditLogs: audit
        ? appendAuditLog(currentEvent, {
            eventId,
            actorUserId: audit.actorUserId,
            actorName: audit.actorName,
            action: "round_reassigned",
            reason: audit.reason ?? null,
          })
        : currentEvent.auditLogs ?? [],
      notifications: [
        ...currentEvent.notifications,
        createEventNotification({
          eventId,
          roundNumber,
          message: "호스트가 라운드 배정을 변경했습니다. 화면을 다시 확인해 주세요.",
          type: "warning",
        }),
      ],
      rounds: currentEvent.rounds.map((round) => {
        if (round.roundNumber < roundNumber) {
          return round;
        }

        const nextRound = regeneratedRounds.find((item) => item.roundNumber === round.roundNumber);
        if (!nextRound) {
          return round;
        }

        return {
          ...nextRound,
          id: round.id ?? nextRound.id,
          completed: false,
          forceClosed: false,
          closeReason: null,
          matches: nextRound.matches.map((match, index) => ({
            ...match,
            id: round.matches[index]?.id ?? match.id,
            scoreA: null,
            scoreB: null,
            scoreProposal: null,
            skipped: false,
            completed: false,
          })),
        };
      }),
    }),
  );
}

export async function addFutureRound(eventId: string): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const startRoundNumber = safeArray(event.rounds).find((round) => !round.completed)?.roundNumber ?? event.roundCount + 1;
  const nextRoundCount = event.roundCount + 1;
  const regeneratedRounds = regenerateRoundsFrom({
    matchType: event.matchType,
    courtCount: event.courtCount,
    roundCount: nextRoundCount,
    players: buildPlayers(event.participants),
    existingRounds: event.rounds,
    startRoundNumber,
  });

  return updateEvent(eventId, (currentEvent) =>
    withDerivedEventState({
      ...currentEvent,
      roundCount: nextRoundCount,
      rounds: withMatchIds(regeneratedRounds).map((round) => {
        const existing = currentEvent.rounds.find((item) => item.roundNumber === round.roundNumber);
        if (!existing || existing.completed) {
          return existing ?? round;
        }

          return {
            ...round,
            id: existing.id ?? round.id,
            state: existing.state ?? round.state ?? "waiting",
            matches: round.matches.map((match, index) => ({
            ...match,
            id: existing.matches[index]?.id ?? match.id,
          })),
        };
      }),
      status: ((currentEvent.status === "completed" || currentEvent.status === "finished") ? "in_progress" : currentEvent.status) as EventRecord["status"],
    }),
  );
}

export async function deleteFutureRound(eventId: string, roundNumber: number): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = safeArray(event.rounds).find((round) => round.roundNumber === roundNumber);
  if (!targetRound || targetRound.completed) {
    throw new Error("완료된 라운드는 삭제할 수 없습니다.");
  }

  const preservedRounds = safeArray(event.rounds).filter((round) => round.roundNumber < roundNumber);
  const remainingFutureRounds = safeArray(event.rounds)
    .filter((round) => round.roundNumber > roundNumber && !round.completed)
    .map((round, index) => ({
      ...round,
      roundNumber: roundNumber + index,
      completed: false,
      forceClosed: false,
      closeReason: null,
      matches: round.matches.map((match) => ({
        ...match,
        scoreA: null,
        scoreB: null,
        skipped: false,
        completed: false,
        scoreProposal: null,
      })),
    }));

  return updateEvent(eventId, (currentEvent) =>
    withDerivedEventState({
      ...currentEvent,
      roundCount: Math.max(0, currentEvent.roundCount - 1),
      rounds: [...preservedRounds, ...remainingFutureRounds],
      status: ([...preservedRounds, ...remainingFutureRounds].every((round) => round.completed) ? "finished" : "in_progress") as EventRecord["status"],
    }),
  );
}

export async function reassignSingleMatch(
  eventId: string,
  roundNumber: number,
  matchId: string,
  audit?: { actorUserId: string; actorName: string; reason?: string | null },
): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = safeArray(event.rounds).find((round) => round.roundNumber === roundNumber);
  const targetMatch = safeArray(targetRound?.matches).find((match) => match.id === matchId);
  if (!targetRound || !targetMatch || targetRound.completed) {
    return event;
  }

  const playersPerMatch = event.matchType === "singles" ? 2 : 4;
  const pool = [...safeArray(targetMatch.teamA), ...safeArray(targetMatch.teamB), ...safeArray(targetRound.restPlayers)];
  if (pool.length < playersPerMatch) {
    return event;
  }

  const rebuiltMatches = withMatchIds([
    {
      roundNumber,
      matches: generateSchedule({
        matchType: event.matchType,
        courtCount: 1,
        roundCount: 1,
        players: pool,
      }).rounds[0]?.matches ?? [],
      restPlayers: [],
    },
  ])[0]?.matches ?? [];
  const rebuiltMatch = rebuiltMatches[0];
  if (!rebuiltMatch) {
    return event;
  }

  const usedIds = new Set([...rebuiltMatch.teamA, ...rebuiltMatch.teamB].map((player) => player.id));
  const nextRestPlayers = pool.filter((player) => !usedIds.has(player.id));

  return updateEvent(eventId, (currentEvent) =>
    withDerivedEventState({
      ...currentEvent,
      auditLogs: audit
        ? appendAuditLog(currentEvent, {
            eventId,
            actorUserId: audit.actorUserId,
            actorName: audit.actorName,
            action: "match_reassigned",
            reason: audit.reason ?? null,
          })
        : currentEvent.auditLogs ?? [],
      notifications: [
        ...currentEvent.notifications,
        createEventNotification({
          eventId,
          roundNumber,
          message: "호스트가 일부 경기 배정을 변경했습니다. 점수/확인 상태가 초기화되었습니다.",
          type: "warning",
          metadata: { matchId },
        }),
      ],
      rounds: currentEvent.rounds.map((round) =>
        round.roundNumber !== roundNumber
          ? round
          : {
              ...round,
              restPlayers: [
                ...nextRestPlayers,
                ...round.restPlayers.filter((player) => !pool.some((poolPlayer) => poolPlayer.id === player.id)),
              ],
              matches: round.matches.map((match) =>
                match.id !== matchId
                  ? match
                  : {
                      ...rebuiltMatch,
                      id: match.id,
                      court: match.court,
                      scoreA: null,
                      scoreB: null,
                      skipped: false,
                      completed: false,
                      scoreProposal: null,
                    },
              ),
            },
      ),
    }),
  );
}

export async function updateRoundMatchAssignment(
  eventId: string,
  roundNumber: number,
  matchId: string,
  participantIds: string[],
  audit?: { actorUserId: string; actorName: string; reason?: string | null },
): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = safeArray(event.rounds).find((round) => round.roundNumber === roundNumber);
  const targetMatch = safeArray(targetRound?.matches).find((match) => match.id === matchId);
  if (!targetRound || !targetMatch || targetRound.completed) {
    return event;
  }

  const playersPerMatch = event.matchType === "singles" ? 2 : 4;
  const selectedIds = participantIds.filter(Boolean);
  if (selectedIds.length !== playersPerMatch || new Set(selectedIds).size !== playersPerMatch) {
    throw new Error("한 경기의 선수 수가 올바르지 않거나 중복된 선수가 선택되었습니다.");
  }

  const roundPool = uniquePlayers([
    ...safeArray(targetRound.restPlayers),
    ...safeArray(targetRound.matches).flatMap((match) => [...safeArray(match.teamA), ...safeArray(match.teamB)]),
  ]);
  const roundPoolIds = new Set(roundPool.map((player) => player.id));
  if (selectedIds.some((id) => !roundPoolIds.has(id))) {
    throw new Error("현재 라운드에 포함된 선수만 직접 편집할 수 있습니다.");
  }

  const allPlayers = uniquePlayers(buildPlayers(event.participants));
  const playerMap = new Map(allPlayers.map((player) => [player.id, player]));
  const originalTargetIds = [...safeArray(targetMatch.teamA), ...safeArray(targetMatch.teamB)].map((player) => player.id);
  const takenFromElsewhere = selectedIds.filter((id) => !originalTargetIds.includes(id));
  const displacedIds = originalTargetIds.filter((id) => !selectedIds.includes(id));
  const replacementQueue = [...displacedIds];

  return updateEvent(eventId, (currentEvent) => {
    const currentRound = safeArray(currentEvent.rounds).find((round) => round.roundNumber === roundNumber);
    if (!currentRound) {
      return currentEvent;
    }

    const nextMatches = currentRound.matches.map((match) => {
      const currentIds = [...safeArray(match.teamA), ...safeArray(match.teamB)].map((player) => player.id);
      const nextIds =
        match.id === matchId
          ? selectedIds
          : currentIds.map((id) => {
              if (!takenFromElsewhere.includes(id)) {
                return id;
              }
              return replacementQueue.shift() ?? id;
            });

      const changed =
        match.id === matchId ||
        nextIds.some((id, index) => id !== currentIds[index]);

      if (!changed) {
        return match;
      }

      const rebuilt = buildMatchFromPlayerIds(currentEvent.matchType, match.court, nextIds, playerMap);
      return {
        ...rebuilt,
        id: match.id,
      };
    });

    const assignedIds = new Set(nextMatches.flatMap((match) => [...match.teamA, ...match.teamB].map((player) => player.id)));
    const nextRestPlayers = roundPool.filter((player) => !assignedIds.has(player.id));
    const nextRound = {
      ...currentRound,
      state: currentRoundState({
        ...currentRound,
        restPlayers: nextRestPlayers,
        matches: nextMatches,
      }),
      restPlayers: nextRestPlayers,
      matches: nextMatches,
    };

    return withDerivedEventState({
      ...currentEvent,
      auditLogs: audit
        ? appendAuditLog(currentEvent, {
            eventId,
            actorUserId: audit.actorUserId,
            actorName: audit.actorName,
            action: "match_assignment_updated",
            reason: audit.reason ?? null,
          })
        : currentEvent.auditLogs ?? [],
      notifications: [
        ...currentEvent.notifications,
        createEventNotification({
          eventId,
          roundNumber,
          message: "호스트가 경기 선수를 직접 수정했습니다. 점수와 확인 상태가 초기화되었습니다.",
          type: "warning",
          metadata: { matchId },
        }),
      ],
      rounds: currentEvent.rounds.map((round) => (round.roundNumber === roundNumber ? nextRound : round)),
    });
  });
}

export function subscribeToEvent(eventId: string, callback: () => void): (() => void) {
  const cleanups: Array<() => void> = [];

  const broadcastChannel = createEventBroadcastChannel(eventId);
  if (broadcastChannel) {
    broadcastChannel.onmessage = () => {
      try {
        callback();
      } catch (error) {
        console.error("[events] local broadcast callback failed", error);
      }
    };
    cleanups.push(() => broadcastChannel.close());
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    const channel = supabase
      ?.channel(`event:${eventId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on("broadcast", { event: "event_updated" }, (payload) => {
        try {
          console.debug("[events] realtime payload", payload);
          callback();
        } catch (error) {
          console.error("[events] realtime callback failed", error, payload);
        }
      })
      .subscribe();

    if (channel) {
      cleanups.push(() => {
        void supabase?.removeChannel(channel);
      });
    }
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

export function getVisibleRounds(event: EventRecord): Round[] {
  const rounds = safeArray(event?.rounds);
  if (event.roundViewMode === "full") {
    return rounds;
  }

  const nextRoundNumber = rounds.find((round) => !round.completed)?.roundNumber;
  if (!nextRoundNumber) {
    return rounds;
  }

  return rounds.filter((round) => round.roundNumber <= nextRoundNumber);
}

export function getCurrentRoundNumber(event: EventRecord): number | null {
  return safeArray(event?.rounds).find((round) => !round.completed)?.roundNumber ?? null;
}

export function getCurrentRound(event: EventRecord): Round | null {
  const currentRoundNumber = getCurrentRoundNumber(event);
  return currentRoundNumber
    ? event.rounds.find((round) => round.roundNumber === currentRoundNumber) ?? null
    : null;
}

export function getJoinUrl(eventId: string): string {
  if (typeof window === "undefined") {
    return `/guest?eventId=${eventId}`;
  }

  return `${window.location.origin}/guest?eventId=${eventId}`;
}

export function getParticipantInstruction(event: EventRecord, participantId: string): string {
  const rounds = safeArray(event?.rounds);
  if (event.status === "waiting" || event.status === "draft" || event.status === "recruiting" || rounds.length === 0) {
    return "대기 중입니다. 호스트가 대진을 생성하면 자동으로 안내됩니다.";
  }

  const currentRound = getCurrentRound(event);
  if (!currentRound) {
    return "모든 라운드가 완료되었습니다.";
  }

  const match = safeArray(currentRound.matches).find((currentMatch) =>
    !currentMatch.skipped &&
    [...safeArray(currentMatch.teamA), ...safeArray(currentMatch.teamB)].some((player) => player.id === participantId),
  );

  if (!match) {
    return "이번 라운드는 휴식입니다.";
  }

  return `다음 경기: ${match.court}번 코트`;
}

export function getRoundInstructions(event: EventRecord): Array<{ participantId: string; name: string; instruction: string }> {
  return safeArray(event?.participants).map((participant) => ({
    participantId: participant.id,
    name: participant.displayName,
    instruction: getParticipantInstruction(event, participant.id),
  }));
}

export function canEditParticipants(event: EventRecord): boolean {
  return safeArray(event?.rounds).length === 0;
}

export function getParticipantBySession(event: EventRecord, sessionId: string): Participant | null {
  return safeArray(event?.participants).find((participant) => participant.sessionId === sessionId) ?? null;
}

export function getEventNotifications(event: EventRecord, participantId?: string): Notification[] {
  const participant = participantId ? safeArray(event?.participants).find((item) => item.id === participantId) : null;
  return getGuestNotifications(safeArray(event?.notifications), participantId, participant?.userId ?? null);
}

export async function markEventNotificationRead(eventId: string, notificationId: string): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    notifications: markNotificationRead(event.notifications, notificationId),
  }));
}

export async function markEventSaved(
  eventId: string,
  input: { isSaved: boolean; savedAt?: string | null; savedByUserId?: string | null },
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    isSaved: input.isSaved,
    savedAt: input.savedAt ?? null,
    savedByUserId: input.savedByUserId ?? null,
  }));
}

export function getInvitationById(event: EventRecord, invitationId: string): Invitation | null {
  return safeArray(event.invitations).find((invitation) => invitation.id === invitationId) ?? null;
}

export function canAccessEventAsHost(event: EventRecord | null, userId: string | null | undefined): boolean {
  return Boolean(event && userId && event.hostUserId === userId);
}
