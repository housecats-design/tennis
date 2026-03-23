import { generateSchedule, rebuildRoundMatches } from "@/lib/scheduler";
import { createParticipant } from "@/lib/participants";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import { createEventBroadcastChannel, getSessionId, loadEvents, saveEvents } from "@/lib/storage";
import {
  EventRecord,
  Match,
  Notification,
  Participant,
  ParticipantGender,
  Player,
  PlayerStats,
  Round,
  RoundViewMode,
  SkillLevel,
} from "@/lib/types";
import { accumulateRoundStats, createStatsRecord } from "@/lib/stats";
import { getGuestNotifications, markNotificationRead, notifyRoundCompletion } from "@/lib/notifications";
import { generateScheduleSchema } from "@/lib/validator";

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
      window.setTimeout(() => {
        void supabase?.removeChannel(realtimeChannel);
      }, 1000);
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

export function createEvent(input: {
  eventName: string;
  matchType: "singles" | "doubles";
  courtCount: number;
  roundCount: number;
  roundViewMode: RoundViewMode;
  hostName: string;
  hostUserId?: string;
}): { event: EventRecord; hostParticipant: Participant } {
  const events = loadEvents();
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

  saveEvents([...events, event]);
  emitEventUpdate(event);
  return { event, hostParticipant };
}

export function loadEvent(eventId: string): EventRecord | null {
  return loadEvents().find((event) => event.id === eventId) ?? null;
}

export function findEventByCodeOrName(query: string): EventRecord | null {
  const normalized = query.trim().toLowerCase();
  return (
    loadEvents().find(
      (event) =>
        event.code.toLowerCase() === normalized ||
        event.eventName.toLowerCase() === normalized,
    ) ?? null
  );
}

export function updateEvent(eventId: string, updater: (event: EventRecord) => EventRecord): EventRecord | null {
  const events = loadEvents();
  const index = events.findIndex((event) => event.id === eventId);
  if (index < 0) {
    return null;
  }

  const nextEvent = stampEvent(updater(events[index]));
  events[index] = nextEvent;
  saveEvents(events);
  emitEventUpdate(nextEvent);
  return nextEvent;
}

export function joinEvent(eventId: string, input: { displayName: string; gender: ParticipantGender; skillLevel?: SkillLevel }): Participant | null {
  const sessionId = getSessionId("guest");
  const event = loadEvent(eventId);
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

  updateEvent(eventId, (currentEvent) => ({
    ...currentEvent,
    participants: [...currentEvent.participants, nextParticipant],
  }));

  return nextParticipant;
}

export function saveParticipants(eventId: string, participants: Participant[]): EventRecord | null {
  return updateEvent(eventId, (event) => ({
    ...event,
    participants,
    stats: createStatsRecord(buildPlayers(participants)),
  }));
}

export function generateEventSchedule(eventId: string): EventRecord | null {
  const event = loadEvent(eventId);
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

export function finalizeRound(eventId: string, roundNumber: number): EventRecord | null {
  const event = loadEvent(eventId);
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

export function updateMatchScores(
  eventId: string,
  roundNumber: number,
  matchId: string,
  scores: { scoreA: number | null; scoreB: number | null },
): EventRecord | null {
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

export function skipMatch(eventId: string, roundNumber: number, matchId: string): EventRecord | null {
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

export function reassignRound(eventId: string, roundNumber: number): EventRecord | null {
  const event = loadEvent(eventId);
  if (!event) {
    return null;
  }

  const targetRound = event.rounds.find((round) => round.roundNumber === roundNumber);
  if (!targetRound) {
    return null;
  }

  const activePlayers = targetRound.matches.flatMap((match) => [...match.teamA, ...match.teamB]);
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

export function getEventNotifications(eventId: string, participantId?: string): Notification[] {
  const event = loadEvent(eventId);
  if (!event) {
    return [];
  }

  return getGuestNotifications(event.notifications, participantId);
}

export function markEventNotificationRead(eventId: string, notificationId: string): EventRecord | null {
  return updateEvent(eventId, (event) => ({
    ...event,
    notifications: markNotificationRead(event.notifications, notificationId),
  }));
}
