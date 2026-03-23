import { generateSchedule, rebuildRoundMatches } from "@/lib/scheduler";
import { createParticipant } from "@/lib/participants";
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
  const state = row.state;
  if (state) {
    const hydrated: EventRecord = {
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
      participants: state.participants ?? [],
      rounds: state.rounds ?? [],
      stats: state.stats ?? {},
      notifications: state.notifications ?? [],
      createdAt: state.createdAt ?? row.created_at ?? new Date().toISOString(),
      updatedAt: state.updatedAt ?? row.updated_at ?? new Date().toISOString(),
    };
    cacheEvent(hydrated);
    return hydrated;
  }

  const fallback: EventRecord = {
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
  };
  cacheEvent(fallback);
  return fallback;
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
    throw error;
  }
}

async function loadEventsFromSource(): Promise<EventRecord[]> {
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
    return loadCachedEvents();
  }

  const events = (data as EventRow[]).map(hydrateEvent);
  saveCachedEvents(events);
  return events;
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
    skillLevel: "medium",
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
    return loadCachedEvents().find((event) => event.id === eventId) ?? null;
  }

  return hydrateEvent(data as EventRow);
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
  input: { displayName: string; gender: ParticipantGender; skillLevel?: SkillLevel },
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
    skillLevel: input.skillLevel ?? "medium",
    role: "guest",
  });

  await updateEvent(eventId, (currentEvent) => ({
    ...currentEvent,
    participants: [...currentEvent.participants, nextParticipant],
  }));

  return nextParticipant;
}

export async function saveParticipants(eventId: string, participants: Participant[]): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    participants,
    stats: createStatsRecord(buildPlayers(participants)),
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
    broadcastChannel.onmessage = () => callback();
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
      .on("broadcast", { event: "event_updated" }, () => callback())
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
  if (event.roundViewMode === "full") {
    return event.rounds;
  }

  const nextRoundNumber = event.rounds.find((round) => !round.completed)?.roundNumber;
  if (!nextRoundNumber) {
    return event.rounds;
  }

  return event.rounds.filter((round) => round.roundNumber <= nextRoundNumber);
}

export function getCurrentRoundNumber(event: EventRecord): number | null {
  return event.rounds.find((round) => !round.completed)?.roundNumber ?? null;
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
  if (event.status === "waiting" || event.rounds.length === 0) {
    return "대기 중입니다. 호스트가 대진을 생성하면 자동으로 안내됩니다.";
  }

  const currentRound = getCurrentRound(event);
  if (!currentRound) {
    return "모든 라운드가 완료되었습니다.";
  }

  const match = currentRound.matches.find((currentMatch) =>
    !currentMatch.skipped &&
    [...currentMatch.teamA, ...currentMatch.teamB].some((player) => player.id === participantId),
  );

  if (!match) {
    return "이번 라운드는 휴식입니다.";
  }

  return `다음 경기: ${match.court}번 코트`;
}

export function getRoundInstructions(event: EventRecord): Array<{ participantId: string; name: string; instruction: string }> {
  return event.participants.map((participant) => ({
    participantId: participant.id,
    name: participant.displayName,
    instruction: getParticipantInstruction(event, participant.id),
  }));
}

export function canEditParticipants(event: EventRecord): boolean {
  return event.rounds.length === 0;
}

export function getParticipantBySession(event: EventRecord, sessionId: string): Participant | null {
  return event.participants.find((participant) => participant.sessionId === sessionId) ?? null;
}

export function getEventNotifications(event: EventRecord, participantId?: string): Notification[] {
  return getGuestNotifications(event.notifications, participantId);
}

export async function markEventNotificationRead(eventId: string, notificationId: string): Promise<EventRecord | null> {
  return updateEvent(eventId, (event) => ({
    ...event,
    notifications: markNotificationRead(event.notifications, notificationId),
  }));
}
