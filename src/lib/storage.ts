import { Match, PlayerStats, Round, ScoreMap, StoredSchedule } from "@/lib/types";

const SCHEDULE_STORAGE_KEY = "tennis-scheduler-schedule";
const SCORE_STORAGE_KEY = "tennis-scheduler-scores";
const COMPLETED_ROUND_STORAGE_KEY = "tennis-scheduler-completed-round";
const LEADERBOARD_STATS_STORAGE_KEY = "tennis-scheduler-leaderboard-stats";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function getMatchKey(roundNumber: number, court: number): string {
  return `${roundNumber}-${court}`;
}

function readJson<T>(storageKey: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function saveSchedule(schedule: StoredSchedule): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
}

export function loadSchedule(): StoredSchedule | null {
  return readJson<StoredSchedule>(SCHEDULE_STORAGE_KEY);
}

export function saveScores(scores: ScoreMap): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scores));
}

export function loadScores(): ScoreMap {
  return readJson<ScoreMap>(SCORE_STORAGE_KEY) ?? {};
}

export function saveRoundScores(scores: ScoreMap): void {
  saveScores(scores);
}

export function loadRoundScores(): ScoreMap {
  return loadScores();
}

export function saveCompletedRound(roundNumber: number): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(COMPLETED_ROUND_STORAGE_KEY, String(roundNumber));
}

export function loadCompletedRound(): number {
  if (!canUseStorage()) {
    return 0;
  }

  const raw = window.localStorage.getItem(COMPLETED_ROUND_STORAGE_KEY);
  return raw ? Number(raw) || 0 : 0;
}

export function saveLeaderboardStats(stats: Record<string, PlayerStats>): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LEADERBOARD_STATS_STORAGE_KEY, JSON.stringify(stats));
}

export function loadLeaderboardStats(): Record<string, PlayerStats> {
  return readJson<Record<string, PlayerStats>>(LEADERBOARD_STATS_STORAGE_KEY) ?? {};
}

export function applyScoresToRounds(rounds: Round[], scores: ScoreMap): Round[] {
  return rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      const score = scores[getMatchKey(round.roundNumber, match.court)];
      return {
        ...match,
        scoreA: score?.scoreA ?? match.scoreA ?? null,
        scoreB: score?.scoreB ?? match.scoreB ?? null,
        isTieBreak:
          (score?.scoreA === 6 && score?.scoreB === 5) ||
          (score?.scoreA === 5 && score?.scoreB === 6) ||
          match.isTieBreak ||
          false,
      };
    }),
  }));
}

export function buildScoreMap(rounds: Round[]): ScoreMap {
  return rounds.reduce<ScoreMap>((scoreMap, round) => {
    for (const match of round.matches) {
      scoreMap[getMatchKey(round.roundNumber, match.court)] = {
        scoreA: match.scoreA ?? null,
        scoreB: match.scoreB ?? null,
      };
    }
    return scoreMap;
  }, {});
}

export function updateMatchScore(
  rounds: Round[],
  roundNumber: number,
  court: number,
  nextScore: Partial<Match>,
): Round[] {
  return rounds.map((round) => {
    if (round.roundNumber !== roundNumber) {
      return round;
    }

    return {
      ...round,
      matches: round.matches.map((match) =>
        match.court === court
          ? (() => {
              const scoreA = nextScore.scoreA ?? match.scoreA ?? null;
              const scoreB = nextScore.scoreB ?? match.scoreB ?? null;

              return {
                ...match,
                scoreA,
                scoreB,
                isTieBreak:
                  (scoreA === 6 && scoreB === 5) ||
                  (scoreA === 5 && scoreB === 6),
              };
            })()
          : match,
      ),
    };
  });
}

export function getStoredMatchKey(roundNumber: number, court: number): string {
  return getMatchKey(roundNumber, court);
}

export function resetProgress(): void {
  saveRoundScores({});
  saveCompletedRound(0);
  saveLeaderboardStats({});
}
