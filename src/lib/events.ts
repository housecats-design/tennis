import { generateSchedule, rebuildRoundMatches } from "@/lib/scheduler";
import { createParticipant, resolveParticipantSkill } from "@/lib/participants";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import {
  createEventBroadcastChannel,
  getSessionId,
  loadEvents as loadCachedEvents,
  saveEvents as saveCachedEvents,
} from "@/lib/storage";
import {
  EventRecord,
  Notification,
  Participant,
  ParticipantGender,
  Player,
  Round,
  RoundViewMode,
  SkillLevel,
} from "@/lib/types";
import { accumulateRoundStats, createStatsRecord } from "@/lib/stats";
import { getGuestNotifications, markNotificationRead, notifyRoundCompletion } from "@/lib/notifications";
import { generateScheduleSchema } from "@/lib/validator";

type EventRow = {
  id: string;
  code: string | null;
  event_name: string;
  host_user_id: string;
  match_type: EventRecord["matchType"];
  court_count: number;
  round_count: number;
  round_view_mode: RoundViewMode;
  status: EventRecord["status"];
  state: EventRecord | null;
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
    guestNtrp: typeof participant?.guestNtrp === "number" ? participant.guestNtrp : null,
    hostSkillOverride: participant?.hostSkillOverride ?? null,
    skillLevel: resolveParticipantSkill({
      guestNtrp: typeof participant?.guestNtrp === "number" ? participant.guestNtrp : null,
      hostSkillOverride: participant?.hostSkillOverride ?? null,
    }),
    role: participant?.role ?? "guest",
    sessionId: participant?.sessionId ?? null,
    userId: participant?.userId ?? null,
    joinedAt: participant?.joinedAt ?? undefined,
    isActive: participant?.isActive ?? true,
  }));
}

function normalizeNotifications(notifications: Notification[] | null | undefined): Notification[] {
  return safeArray(notifications).filter(Boolean).map((notification) => ({
    ...notification,
    message: notification?.message ?? "",
    roundNumber: notification?.roundNumber ?? 0,
    targetParticipantId: notification?.targetParticipantId ?? null,
    readAt: notification?.readAt ?? null,
    createdAt: notification?.createdAt ?? null,
  }));
}

function normalizeRounds(rounds: EventRecord["rounds"] | null | undefined): EventRecord["rounds"] {
  return safeArray(rounds).filter(Boolean).map((round, roundIndex) => ({
    ...round,
    id: round?.id ?? undefined,
    roundNumber: round?.roundNumber ?? roundIndex + 1,
    completed: Boolean(round?.completed),
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
      };
    }
  }

  return nextStats;
}

function normalizeEventRecord(event: Partial<EventRecord> & Pick<EventRecord, "id">): EventRecord {
  const participants = normalizeParticipants(event.participants);
  const rounds = normalizeRounds(event.rounds);
  const notifications = normalizeNotifications(event.notifications);

  return {
    id: event.id,
    code: event.code ?? "",
    eventName: event.eventName ?? "",
    hostUserId: event.hostUserId ?? "",
    matchType: event.matchType ?? "singles",
    courtCount: typeof event.courtCount === "number" ? event.courtCount : 1,
    roundCount: typeof event.roundCount === "number" ? event.roundCount : 1,
    roundViewMode: event.roundViewMode ?? "progressive",
    status: event.status ?? "waiting",
    participants,
    rounds,
    stats: normalizeStats(event.stats, participants),
    notifications,
    createdAt: event.createdAt ?? new Date().toISOString(),
    updatedAt: event.updatedAt ?? new Date().toISOString(),
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
        courtCount: state.courtCount ?? row.court_count,
        roundCount: state.roundCount ?? row.round_count,
        roundViewMode: state.roundViewMode ?? row.round_view_mode,
        status: state.status ?? row.status,
        createdAt: state.createdAt ?? row.created_at ?? new Date().toISOString(),
        updatedAt: state.updatedAt ?? row.updated_at ?? new Date().toISOString(),
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
      courtCount: row.court_count,
      roundCount: row.round_count,
      roundViewMode: row.round_view_mode,
      status: row.status,
      participants: [],
      rounds: [],
      stats: {},
      notifications: [],
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
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
      courtCount: row.court_count,
      roundCount: row.round_count,
      roundViewMode: row.round_view_mode,
      status: row.status,
      participants: [],
      rounds: [],
      stats: {},
      notifications: [],
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
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
      host_user_id: event.hostUserId,
      match_type: event.matchType,
      court_count: event.courtCount,
      round_count: event.roundCount,
      round_view_mode: event.roundViewMode,
      status: event.status,
      state: event,
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
      .select("id, code, event_name, host_user_id, match_type, court_count, round_count, round_view_mode, status, state, created_at, updated_at")
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

function withMatchIds(rounds: Round[]): Round[] {
  return rounds.map((round) => ({
    ...round,
    id: round.id ?? makeId(`round_${round.roundNumber}`),
    matches: round.matches.map((match) => ({
      ...match,
      id: match.id ?? makeId(`match_${round.roundNumber}_${match.court}`),
      completed: Boolean(match.completed),
    })),
  }));
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

export async function createEvent(input: {
  eventName: string;
  matchType: "singles" | "doubles";
  courtCount: number;
  roundCount: number;
  roundViewMode: RoundViewMode;
  hostName: string;
  hostUserId?: string;
}): Promise<{ event: EventRecord; hostParticipant: Participant }> {
  const sessionId = input.hostUserId ?? getSessionId("host");
  const eventId = makeId("event");
  const hostParticipant = createParticipant({
    eventId,
    displayName: input.hostName.trim(),
    role: "host",
    sessionId,
    gender: "unspecified",
    guestNtrp: null,
    hostSkillOverride: "medium",
  });

  const event: EventRecord = {
    id: eventId,
    code: makeEventCode(),
    eventName: input.eventName.trim(),
    hostUserId: sessionId,
    matchType: input.matchType,
    courtCount: input.courtCount,
    roundCount: input.roundCount,
    roundViewMode: input.roundViewMode,
    status: "waiting",
    participants: [hostParticipant],
    rounds: [],
    stats: createStatsRecord([{ id: hostParticipant.id, name: hostParticipant.displayName }]),
    notifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
      .select("id, code, event_name, host_user_id, match_type, court_count, round_count, round_view_mode, status, state, created_at, updated_at")
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
  input: { displayName: string; gender: ParticipantGender; guestNtrp?: number | null },
): Promise<Participant | null> {
  const sessionId = getSessionId("guest");
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const normalizedName = input.displayName.trim();
  const existingBySession = event.participants.find((participant) => participant.sessionId === sessionId);
  if (existingBySession) {
    return existingBySession;
  }

  const duplicateName = event.participants.some(
    (participant) => participant.displayName.trim().toLowerCase() === normalizedName.toLowerCase(),
  );
  if (duplicateName) {
    return null;
  }

  const nextParticipant = createParticipant({
    eventId,
    sessionId,
    displayName: normalizedName,
    gender: input.gender,
    guestNtrp: input.guestNtrp ?? null,
    hostSkillOverride: null,
    role: "guest",
  });

  await updateEvent(eventId, (currentEvent) => ({
    ...currentEvent,
    participants: [...currentEvent.participants, nextParticipant],
  }));

  return nextParticipant;
}

export async function saveParticipants(eventId: string, participants: Participant[]): Promise<EventRecord | null> {
  const normalizedParticipants = participants.map((participant) => ({
    ...participant,
    guestNtrp: participant.guestNtrp ?? null,
    hostSkillOverride: participant.hostSkillOverride ?? null,
    skillLevel: resolveParticipantSkill({
      guestNtrp: participant.guestNtrp ?? null,
      hostSkillOverride: participant.hostSkillOverride ?? null,
    }),
  }));

  return updateEvent(eventId, (event) => ({
    ...event,
    participants: normalizedParticipants,
    stats: createStatsRecord(buildPlayers(normalizedParticipants)),
  }));
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

  return updateEvent(eventId, (currentEvent) => ({
    ...currentEvent,
    rounds: withMatchIds(schedule.rounds),
    stats: createStatsRecord(players),
    notifications: [],
    status: "in_progress",
  }));
}

function isValidScore(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  return (
    (scoreA === 6 && typeof scoreB === "number" && scoreB >= 0 && scoreB <= 5) ||
    (scoreB === 6 && typeof scoreA === "number" && scoreA >= 0 && scoreA <= 5)
  );
}

function getMatchParticipantIds(round: Round, matchId: string): string[] {
  const match = safeArray(round.matches).find((item) => item.id === matchId);
  if (!match) {
    return [];
  }

  return [...safeArray(match.teamA), ...safeArray(match.teamB)].map((player) => player.id);
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
    if (match.skipped) {
      continue;
    }

    if (!isValidScore(match.scoreA, match.scoreB)) {
      throw new Error("현재 라운드의 모든 경기는 6:0부터 6:5 사이의 완료 점수여야 합니다.");
    }
  }

  return updateEvent(eventId, (currentEvent) => {
    const nextRounds = currentEvent.rounds.map((round) =>
      round.roundNumber === roundNumber
        ? {
            ...round,
            completed: true,
            matches: round.matches.map((match) => ({
              ...match,
              completed: true,
              isTieBreak:
                (match.scoreA === 6 && match.scoreB === 5) ||
                (match.scoreA === 5 && match.scoreB === 6),
            })),
          }
        : round,
    );

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

    return {
      ...currentEvent,
      rounds: nextRounds,
      stats,
      notifications,
      status: allCompleted ? "completed" : "in_progress",
    };
  });
}

export async function updateMatchScores(
  eventId: string,
  roundNumber: number,
  matchId: string,
  scores: { scoreA: number | null; scoreB: number | null },
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    rounds: event.rounds.map((round) =>
      round.roundNumber === roundNumber
        ? {
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
          }
        : round,
    ),
  }));
}

export async function submitMatchScoreProposal(
  eventId: string,
  roundNumber: number,
  matchId: string,
  participantId: string,
  scores: { scoreA: number; scoreB: number },
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    rounds: event.rounds.map((round) =>
      round.roundNumber === roundNumber
        ? {
            ...round,
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
  }));
}

export async function respondToScoreProposal(
  eventId: string,
  roundNumber: number,
  matchId: string,
  participantId: string,
  response: "accept" | "dispute",
): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => {
    const hostParticipant = safeArray(event.participants).find((participant) => participant.role === "host");

    return {
      ...event,
      notifications:
        response === "dispute" && hostParticipant
          ? [
              ...event.notifications,
              {
                id: makeId("notification_dispute"),
                eventId,
                roundNumber,
                targetParticipantId: hostParticipant.id,
                message: `점수 이의신청 발생: Round ${roundNumber}, Match ${matchId}`,
                readAt: null,
                createdAt: new Date().toISOString(),
              },
            ]
          : event.notifications,
      rounds: event.rounds.map((round) => {
        if (round.roundNumber !== roundNumber) {
          return round;
        }

        const participantIds = getMatchParticipantIds(round, matchId);
        return {
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

            const requiredAcceptCount = Math.max(
              participantIds.filter((id) => id !== match.scoreProposal?.submittedByParticipantId).length,
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
                status: disputedByParticipantIds.length > 0 ? "disputed" : accepted ? "accepted" : "pending",
              },
            };
          }),
        };
      }),
    };
  });
}

export async function skipMatch(eventId: string, roundNumber: number, matchId: string): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
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
  }));
}

export async function reassignRound(eventId: string, roundNumber: number): Promise<EventRecord | null> {
  const event = await loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = event.rounds.find((round) => round.roundNumber === roundNumber);
  if (!targetRound) {
    return null;
  }

  const activePlayers = targetRound.matches
    .filter((match) => !match.skipped)
    .flatMap((match) => [...match.teamA, ...match.teamB]);
  const reassignedMatches = rebuildRoundMatches(event.matchType, activePlayers, targetRound.matches.length);

  return updateEvent(eventId, (currentEvent) => ({
    ...currentEvent,
    rounds: currentEvent.rounds.map((round) =>
      round.roundNumber === roundNumber
        ? {
            ...round,
            matches: reassignedMatches.map((match, index) => ({
              ...match,
              id: round.matches[index]?.id ?? match.id,
              skipped: false,
              completed: false,
            })),
          }
        : round,
    ),
  }));
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
  if (event.status === "waiting" || rounds.length === 0) {
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
  return getGuestNotifications(safeArray(event?.notifications), participantId);
}

export async function markEventNotificationRead(eventId: string, notificationId: string): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    notifications: markNotificationRead(event.notifications, notificationId),
  }));
}
