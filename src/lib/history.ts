"use client";

import { getClubById } from "@/lib/clubs";
import { loadAllEvents } from "@/lib/events";
import { sortLeaderboard } from "@/lib/leaderboard";
import { accumulateRoundStats, createStatsRecord, createEmptyStats } from "@/lib/stats";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import {
  AdminUserSummary,
  EventRecord,
  MatchHistoryRecord,
  PairHistoryRecord,
  Player,
  PlayerStats,
  RankedPlayer,
  SavedEventRecord,
  SavedEventSummary,
  UserEventHistory,
  UserProfile,
} from "@/lib/types";
import { listProfiles } from "@/lib/users";

const SAVED_EVENTS_STORAGE_KEY = "tennis-saved-events";
const USER_EVENT_HISTORY_STORAGE_KEY = "tennis-user-event-history";
const PAIR_HISTORY_STORAGE_KEY = "tennis-pair-history";
const MATCH_HISTORY_STORAGE_KEY = "tennis-match-history";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function buildPlayers(event: EventRecord): Player[] {
  return event.participants.map((participant) => ({
    id: participant.id,
    name: participant.displayName,
    gender: participant.gender,
    guestNtrp: participant.guestNtrp ?? null,
    hostSkillOverride: participant.hostSkillOverride ?? null,
    skillLevel: participant.skillLevel,
  }));
}

async function buildClubNameMap(event: EventRecord): Promise<Map<string, string>> {
  const clubIds = new Set<string>();
  if (event.clubId) {
    clubIds.add(event.clubId);
  }

  for (const participant of event.participants) {
    if (participant.joinedAsClubId) {
      clubIds.add(participant.joinedAsClubId);
    }
  }

  const map = new Map<string, string>();
  await Promise.all(
    Array.from(clubIds).map(async (clubId) => {
      const club = await getClubById(clubId);
      if (club?.clubName) {
        map.set(clubId, club.clubName);
      }
    }),
  );
  return map;
}

export async function buildFinalRanking(event: EventRecord): Promise<RankedPlayer[]> {
  const clubNameMap = await buildClubNameMap(event);
  const ranked = sortLeaderboard(buildPlayers(event), event.stats, "desc");
  return ranked.map((player, index) => {
    const participant = event.participants.find((item) => item.id === player.id);
    return {
      participantId: player.id,
      userId: participant?.userId ?? null,
      name: player.name,
      gender: participant?.gender ?? "unspecified",
      guestNtrp: participant?.guestNtrp ?? null,
      joinedAsClubId: participant?.joinedAsClubId ?? null,
      joinedAsClubName: participant?.joinedAsClubId ? clubNameMap.get(participant.joinedAsClubId) ?? null : null,
      participantRole: participant?.role ?? "guest",
      rank: index + 1,
      stats: event.stats[player.id] ?? createEmptyStats(),
    };
  });
}

function buildUserHistoryRecords(savedEvent: SavedEventRecord): UserEventHistory[] {
  return savedEvent.ranking
    .filter((player) => player.userId)
    .map((player) => ({
      id: `${savedEvent.id}_${player.participantId}`,
      savedEventId: savedEvent.id,
      eventName: savedEvent.eventName,
      matchType: savedEvent.matchType,
      eventType: savedEvent.eventType ?? "personal",
      clubId: savedEvent.clubId ?? null,
      clubName: savedEvent.clubName ?? null,
      userId: player.userId ?? "",
      participantId: player.participantId,
      participantRole: player.participantRole ?? "guest",
      joinedAsClubId: player.joinedAsClubId ?? null,
      joinedAsClubName: player.joinedAsClubName ?? null,
      rank: player.rank,
      stats: player.stats,
      createdAt: savedEvent.savedAt,
    }));
}

function buildPairHistoryRecords(savedEvent: SavedEventRecord): PairHistoryRecord[] {
  const map = new Map<string, PairHistoryRecord>();

  for (const round of savedEvent.snapshot.rounds.filter((item) => item.completed)) {
    for (const match of round.matches) {
      if (match.skipped) {
        continue;
      }

      const teams = [match.teamA, match.teamB];
      for (const team of teams) {
        if (team.length < 2) {
          continue;
        }

        for (let i = 0; i < team.length; i += 1) {
          for (let j = i + 1; j < team.length; j += 1) {
            const left = savedEvent.snapshot.participants.find((item) => item.id === team[i].id);
            const right = savedEvent.snapshot.participants.find((item) => item.id === team[j].id);
            if (!left?.userId || !right?.userId) {
              continue;
            }

            const pairKey = [left.userId, right.userId].sort().join(":");
            const existing = map.get(pairKey);
            if (existing) {
              existing.frequency += 1;
              existing.lastPlayedAt = savedEvent.savedAt;
            } else {
              map.set(pairKey, {
                id: pairKey,
                userId: left.userId,
                pairedUserId: right.userId,
                pairKey,
                pairedName: right.displayName,
                frequency: 1,
                lastPlayedAt: savedEvent.savedAt,
              });
            }
          }
        }
      }
    }
  }

  return Array.from(map.values());
}

function buildMatchHistoryRecords(savedEvent: SavedEventRecord): MatchHistoryRecord[] {
  const records: MatchHistoryRecord[] = [];
  const participantMap = new Map(savedEvent.snapshot.participants.map((participant) => [participant.id, participant]));

  for (const round of savedEvent.snapshot.rounds.filter((item) => item.completed)) {
    for (const match of round.matches) {
      const scoreA = match.scoreA ?? 0;
      const scoreB = match.scoreB ?? 0;

      for (const player of [...match.teamA, ...match.teamB]) {
        const participant = participantMap.get(player.id);
        if (!participant?.userId) {
          continue;
        }

        const isTeamA = match.teamA.some((item) => item.id === player.id);
        const ownTeam = isTeamA ? match.teamA : match.teamB;
        const opponents = isTeamA ? match.teamB : match.teamA;
        const scoreFor = isTeamA ? scoreA : scoreB;
        const scoreAgainst = isTeamA ? scoreB : scoreA;
        const result: MatchHistoryRecord["result"] = match.skipped
          ? "skipped"
          : scoreFor > scoreAgainst
            ? "win"
            : "loss";

        records.push({
          id: `${savedEvent.id}_${round.roundNumber}_${match.court}_${player.id}`,
          savedEventId: savedEvent.id,
          eventName: savedEvent.eventName,
          userId: participant.userId,
          participantId: participant.id,
          clubId: participant.joinedAsClubId ?? null,
          clubName:
            savedEvent.ranking.find((rankedPlayer) => rankedPlayer.participantId === participant.id)?.joinedAsClubName ?? null,
          roundNumber: round.roundNumber,
          courtNumber: match.court,
          result,
          scoreFor,
          scoreAgainst,
          teammates: ownTeam.filter((item) => item.id !== player.id).map((item) => item.name),
          opponents: opponents.map((item) => item.name),
          createdAt: savedEvent.savedAt,
        });
      }
    }
  }

  return records;
}

async function rebuildDerivedStats(savedEvents: SavedEventRecord[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const totalMap = new Map<string, { userId: string; matchesPlayed: number; wins: number; losses: number; points: number }>();
  const byClubMap = new Map<string, { userId: string; clubId: string; matchesPlayed: number; wins: number; losses: number; points: number }>();
  const clubTotalsMap = new Map<string, { clubId: string; matchesPlayed: number; wins: number; losses: number; points: number }>();

  for (const savedEvent of savedEvents) {
    for (const player of savedEvent.ranking) {
      if (!player.userId) {
        continue;
      }

      const totalEntry = totalMap.get(player.userId) ?? {
        userId: player.userId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        points: 0,
      };
      totalEntry.matchesPlayed += player.stats.games;
      totalEntry.wins += player.stats.wins;
      totalEntry.losses += player.stats.losses;
      totalEntry.points += player.stats.pointsScored;
      totalMap.set(player.userId, totalEntry);

      if (player.joinedAsClubId) {
        const byClubKey = `${player.userId}:${player.joinedAsClubId}`;
        const byClubEntry = byClubMap.get(byClubKey) ?? {
          userId: player.userId,
          clubId: player.joinedAsClubId,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          points: 0,
        };
        byClubEntry.matchesPlayed += player.stats.games;
        byClubEntry.wins += player.stats.wins;
        byClubEntry.losses += player.stats.losses;
        byClubEntry.points += player.stats.pointsScored;
        byClubMap.set(byClubKey, byClubEntry);

        const clubEntry = clubTotalsMap.get(player.joinedAsClubId) ?? {
          clubId: player.joinedAsClubId,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          points: 0,
        };
        clubEntry.matchesPlayed += player.stats.games;
        clubEntry.wins += player.stats.wins;
        clubEntry.losses += player.stats.losses;
        clubEntry.points += player.stats.pointsScored;
        clubTotalsMap.set(player.joinedAsClubId, clubEntry);
      }
    }
  }

  if (totalMap.size > 0) {
    await supabase.from("player_stats_total").upsert(
      Array.from(totalMap.values()).map((row) => ({
        user_id: row.userId,
        matches_played: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id" },
    );
  }

  if (byClubMap.size > 0) {
    await supabase.from("player_stats_by_club").upsert(
      Array.from(byClubMap.values()).map((row) => ({
        user_id: row.userId,
        club_id: row.clubId,
        matches_played: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,club_id" },
    );
  }

  if (clubTotalsMap.size > 0) {
    await supabase.from("club_stats").upsert(
      Array.from(clubTotalsMap.values()).map((row) => ({
        club_id: row.clubId,
        matches_played: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "club_id" },
    );
  }
}

async function persistSavedEvent(savedEvent: SavedEventRecord): Promise<void> {
  const cachedSavedEvents = readJson<SavedEventRecord>(SAVED_EVENTS_STORAGE_KEY);
  writeJson(
    SAVED_EVENTS_STORAGE_KEY,
    [...cachedSavedEvents.filter((item) => item.id !== savedEvent.id), savedEvent],
  );

  const userHistory = buildUserHistoryRecords(savedEvent);
  const pairHistory = buildPairHistoryRecords(savedEvent);
  const matchHistory = buildMatchHistoryRecords(savedEvent);

  writeJson(
    USER_EVENT_HISTORY_STORAGE_KEY,
    [
      ...readJson<UserEventHistory>(USER_EVENT_HISTORY_STORAGE_KEY).filter(
        (item) => item.savedEventId !== savedEvent.id,
      ),
      ...userHistory,
    ],
  );

  const currentPairHistory = readJson<PairHistoryRecord>(PAIR_HISTORY_STORAGE_KEY);
  const mergedPairs = [...currentPairHistory];
  for (const pair of pairHistory) {
    const index = mergedPairs.findIndex((item) => item.pairKey === pair.pairKey);
    if (index >= 0) {
      mergedPairs[index] = {
        ...mergedPairs[index],
        frequency: mergedPairs[index].frequency + pair.frequency,
        lastPlayedAt: pair.lastPlayedAt,
        pairedName: pair.pairedName,
      };
    } else {
      mergedPairs.push(pair);
    }
  }
  writeJson(PAIR_HISTORY_STORAGE_KEY, mergedPairs);

  writeJson(
    MATCH_HISTORY_STORAGE_KEY,
    [
      ...readJson<MatchHistoryRecord>(MATCH_HISTORY_STORAGE_KEY).filter(
        (item) => item.savedEventId !== savedEvent.id,
      ),
      ...matchHistory,
    ],
  );

  if (!isSupabaseEnabled()) {
    return;
  }

  const supabase = getSupabaseClient();
  await supabase!.from("saved_events").upsert(
    {
      id: savedEvent.id,
      source_event_id: savedEvent.sourceEventId,
      event_name: savedEvent.eventName,
      host_user_id: savedEvent.hostUserId,
      match_type: savedEvent.matchType,
      event_type: savedEvent.eventType ?? "personal",
      club_id: savedEvent.clubId ?? null,
      club_name: savedEvent.clubName ?? null,
      participant_count: savedEvent.participantCount,
      played_at: savedEvent.playedAt,
      saved_at: savedEvent.savedAt,
      snapshot: savedEvent.snapshot,
      ranking: savedEvent.ranking,
      top_three: savedEvent.topThree,
    },
    { onConflict: "id" },
  );

  await supabase!.from("event_results").upsert(
    savedEvent.ranking.map((player) => ({
      id: `${savedEvent.id}_${player.participantId}`,
      saved_event_id: savedEvent.id,
      participant_id: player.participantId,
      user_id: player.userId,
      display_name: player.name,
      rank: player.rank,
      gender: player.gender,
      guest_ntrp: player.guestNtrp ?? null,
      joined_as_club_id: player.joinedAsClubId ?? null,
      joined_as_club_name: player.joinedAsClubName ?? null,
      participant_role: player.participantRole ?? "guest",
      stats: player.stats,
    })),
    { onConflict: "id" },
  );

  await supabase!.from("user_event_history").upsert(
    userHistory.map((item) => ({
      id: item.id,
      saved_event_id: item.savedEventId,
      event_name: item.eventName,
      match_type: item.matchType,
      event_type: item.eventType ?? "personal",
      club_id: item.clubId ?? null,
      club_name: item.clubName ?? null,
      user_id: item.userId,
      participant_id: item.participantId,
      participant_role: item.participantRole ?? "guest",
      joined_as_club_id: item.joinedAsClubId ?? null,
      joined_as_club_name: item.joinedAsClubName ?? null,
      rank: item.rank,
      stats: item.stats,
      created_at: item.createdAt,
    })),
    { onConflict: "id" },
  );

  if (pairHistory.length > 0) {
    await supabase!.from("pair_history").upsert(
      pairHistory.map((item) => ({
        id: item.id,
        user_id: item.userId,
        paired_user_id: item.pairedUserId,
        pair_key: item.pairKey,
        paired_name: item.pairedName,
        frequency: item.frequency,
        last_played_at: item.lastPlayedAt,
      })),
      { onConflict: "id" },
    );
  }

  if (matchHistory.length > 0) {
    await supabase!.from("match_history").upsert(
      matchHistory.map((item) => ({
        id: item.id,
        saved_event_id: item.savedEventId,
        event_name: item.eventName,
        user_id: item.userId,
        participant_id: item.participantId,
        club_id: item.clubId ?? null,
        club_name: item.clubName ?? null,
        round_number: item.roundNumber,
        court_number: item.courtNumber,
        result: item.result,
        score_for: item.scoreFor,
        score_against: item.scoreAgainst,
        teammates: item.teammates,
        opponents: item.opponents,
        created_at: item.createdAt,
      })),
      { onConflict: "id" },
    );
  }

  const allSavedEvents = await loadSavedEvents();
  await rebuildDerivedStats(allSavedEvents);
}

export async function saveCompletedEventRecord(event: EventRecord): Promise<SavedEventRecord> {
  const ranking = await buildFinalRanking(event);
  const clubNameMap = await buildClubNameMap(event);
  const savedAt = new Date().toISOString();
  const savedEvent: SavedEventRecord = {
    id: `saved_${event.id}`,
    sourceEventId: event.id,
    eventName: event.eventName,
    hostUserId: event.hostUserId,
    matchType: event.matchType,
    eventType: event.eventType ?? "personal",
    clubId: event.clubId ?? null,
    clubName: event.clubId ? clubNameMap.get(event.clubId) ?? null : null,
    participantCount: event.participants.length,
    playedAt: event.updatedAt,
    savedAt,
    ranking,
    topThree: ranking.slice(0, 3),
    snapshot: {
      ...event,
      isSaved: true,
      savedAt,
      savedByUserId: event.hostUserId,
    },
  };

  await persistSavedEvent(savedEvent);
  return savedEvent;
}

export async function loadSavedEvents(): Promise<SavedEventRecord[]> {
  const cached = readJson<SavedEventRecord>(SAVED_EVENTS_STORAGE_KEY);
  if (!isSupabaseEnabled()) {
    return cached;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("saved_events")
    .select("id, source_event_id, event_name, host_user_id, match_type, event_type, club_id, club_name, participant_count, played_at, saved_at, snapshot, ranking, top_three")
    .order("saved_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return cached;
  }

  const savedEvents = data.map((row) => ({
    id: row.id,
    sourceEventId: row.source_event_id,
    eventName: row.event_name,
    hostUserId: row.host_user_id,
    matchType: row.match_type,
    eventType: row.event_type ?? "personal",
    clubId: row.club_id ?? null,
    clubName: row.club_name ?? null,
    participantCount: row.participant_count,
    playedAt: row.played_at,
    savedAt: row.saved_at,
    snapshot: row.snapshot,
    ranking: Array.isArray(row.ranking) ? row.ranking : [],
    topThree: Array.isArray(row.top_three) ? row.top_three : [],
  })) as SavedEventRecord[];

  writeJson(SAVED_EVENTS_STORAGE_KEY, savedEvents);
  return savedEvents;
}

export async function loadHostSavedEvents(userId: string): Promise<SavedEventSummary[]> {
  const items = await loadSavedEvents();
  return items.filter((item) => item.hostUserId === userId);
}

export async function loadRecommendedPlayersForHost(userId: string): Promise<Array<{ userId: string; displayName: string; email?: string | null }>> {
  const [events, liveEvents, profiles] = await Promise.all([loadHostSavedEvents(userId), loadAllEvents(), listProfiles()]);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const map = new Map<string, { userId: string; displayName: string; email?: string | null }>();

  for (const event of events) {
    for (const player of event.ranking) {
      if (!player.userId || player.userId === userId) {
        continue;
      }

      const profile = profileMap.get(player.userId);
      map.set(player.userId, {
        userId: player.userId,
        displayName: profile?.displayName ?? player.name,
        email: profile?.email ?? null,
      });
    }
  }

  const recentLiveEvents = liveEvents
    .filter((event) => event.hostUserId === userId)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  for (const event of recentLiveEvents) {
    for (const participant of event.participants) {
      if (!participant.userId || participant.userId === userId) {
        continue;
      }

      const profile = profileMap.get(participant.userId);
      map.set(participant.userId, {
        userId: participant.userId,
        displayName: profile?.displayName ?? participant.displayName,
        email: profile?.email ?? null,
      });
    }
  }

  return Array.from(map.values());
}

export async function loadPlayerSavedEvents(userId: string): Promise<SavedEventSummary[]> {
  const items = await loadSavedEvents();
  return items.filter((item) => item.ranking.some((player) => player.userId === userId));
}

export async function loadSavedEventById(savedEventId: string): Promise<SavedEventRecord | null> {
  const items = await loadSavedEvents();
  return items.find((item) => item.id === savedEventId) ?? null;
}

export async function loadUserEventHistory(userId: string): Promise<UserEventHistory[]> {
  const cached = readJson<UserEventHistory>(USER_EVENT_HISTORY_STORAGE_KEY);
  if (!isSupabaseEnabled()) {
    return cached.filter((item) => item.userId === userId);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("user_event_history")
    .select("id, saved_event_id, event_name, match_type, event_type, club_id, club_name, user_id, participant_id, participant_role, joined_as_club_id, joined_as_club_name, rank, stats, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return cached.filter((item) => item.userId === userId);
  }

  return data.map((row) => ({
    id: row.id,
    savedEventId: row.saved_event_id,
    eventName: row.event_name,
    matchType: row.match_type,
    eventType: row.event_type ?? "personal",
    clubId: row.club_id ?? null,
    clubName: row.club_name ?? null,
    userId: row.user_id,
    participantId: row.participant_id,
    participantRole: row.participant_role ?? "guest",
    joinedAsClubId: row.joined_as_club_id ?? null,
    joinedAsClubName: row.joined_as_club_name ?? null,
    rank: row.rank,
    stats: row.stats as PlayerStats,
    createdAt: row.created_at,
  }));
}

export async function loadPairHistory(userId: string): Promise<PairHistoryRecord[]> {
  const cached = readJson<PairHistoryRecord>(PAIR_HISTORY_STORAGE_KEY);
  if (!isSupabaseEnabled()) {
    return cached.filter((item) => item.userId === userId || item.pairedUserId === userId);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("pair_history")
    .select("id, user_id, paired_user_id, pair_key, paired_name, frequency, last_played_at")
    .or(`user_id.eq.${userId},paired_user_id.eq.${userId}`)
    .order("last_played_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return cached.filter((item) => item.userId === userId || item.pairedUserId === userId);
  }

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    pairedUserId: row.paired_user_id,
    pairKey: row.pair_key,
    pairedName: row.paired_name,
    frequency: row.frequency,
    lastPlayedAt: row.last_played_at,
  }));
}

export async function loadMatchHistory(userId: string): Promise<MatchHistoryRecord[]> {
  const cached = readJson<MatchHistoryRecord>(MATCH_HISTORY_STORAGE_KEY);
  if (!isSupabaseEnabled()) {
    return cached.filter((item) => item.userId === userId);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("match_history")
    .select("id, saved_event_id, event_name, user_id, participant_id, club_id, club_name, round_number, court_number, result, score_for, score_against, teammates, opponents, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return cached.filter((item) => item.userId === userId);
  }

  return data.map((row) => ({
    id: row.id,
    savedEventId: row.saved_event_id,
    eventName: row.event_name,
    userId: row.user_id,
    participantId: row.participant_id,
    clubId: row.club_id ?? null,
    clubName: row.club_name ?? null,
    roundNumber: row.round_number,
    courtNumber: row.court_number,
    result: row.result,
    scoreFor: row.score_for,
    scoreAgainst: row.score_against,
    teammates: Array.isArray(row.teammates) ? row.teammates : [],
    opponents: Array.isArray(row.opponents) ? row.opponents : [],
    createdAt: row.created_at,
  }));
}

export async function buildAdminUserSummaries(): Promise<AdminUserSummary[]> {
  const [profiles, userHistories] = await Promise.all([
    listProfiles(),
    isSupabaseEnabled()
      ? (async () => {
          const supabase = getSupabaseClient();
          const { data } = await supabase!
            .from("user_event_history")
            .select("id, saved_event_id, event_name, match_type, event_type, club_id, club_name, user_id, participant_id, participant_role, joined_as_club_id, joined_as_club_name, rank, stats, created_at");
          return Array.isArray(data)
            ? (data.map((row) => ({
                id: row.id,
                savedEventId: row.saved_event_id,
                eventName: row.event_name,
                matchType: row.match_type,
                eventType: row.event_type ?? "personal",
                clubId: row.club_id ?? null,
                clubName: row.club_name ?? null,
                userId: row.user_id,
                participantId: row.participant_id,
                participantRole: row.participant_role ?? "guest",
                joinedAsClubId: row.joined_as_club_id ?? null,
                joinedAsClubName: row.joined_as_club_name ?? null,
                rank: row.rank,
                stats: row.stats as PlayerStats,
                createdAt: row.created_at,
              })) as UserEventHistory[])
            : readJson<UserEventHistory>(USER_EVENT_HISTORY_STORAGE_KEY);
        })()
      : Promise.resolve(readJson<UserEventHistory>(USER_EVENT_HISTORY_STORAGE_KEY)),
  ]);

  return profiles.map((profile) => {
    const rows = userHistories.filter((item) => item.userId === profile.id);
    const stats = rows.reduce(
      (accumulator, item) => {
        accumulator.totalSavedEvents += 1;
        accumulator.totalMatches += item.stats.games;
        accumulator.wins += item.stats.wins;
        accumulator.losses += item.stats.losses;
        accumulator.pointsScored += item.stats.pointsScored;
        accumulator.pointsAllowed += item.stats.pointsAllowed;
        return accumulator;
      },
      {
        totalSavedEvents: 0,
        totalMatches: 0,
        wins: 0,
        losses: 0,
        pointsScored: 0,
        pointsAllowed: 0,
      },
    );

    return {
      profile,
      ...stats,
      pointDiff: stats.pointsScored - stats.pointsAllowed,
    };
  });
}

export function buildGlobalAdminSummary(rows: AdminUserSummary[]) {
  return rows.reduce(
    (summary, row) => {
      summary.totalUsers += 1;
      summary.totalEvents += row.totalSavedEvents;
      summary.totalMatches += row.totalMatches;
      summary.totalWins += row.wins;
      summary.totalLosses += row.losses;
      summary.totalPoints += row.pointsScored;
      return summary;
    },
    {
      totalUsers: 0,
      totalEvents: 0,
      totalMatches: 0,
      totalWins: 0,
      totalLosses: 0,
      totalPoints: 0,
    },
  );
}
