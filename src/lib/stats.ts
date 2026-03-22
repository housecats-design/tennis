import { MatchType, Player, PlayerStats, Round } from "@/lib/types";

export function createEmptyStats(): PlayerStats {
  return {
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

export function createStatsRecord(players: Player[]): Record<string, PlayerStats> {
  return Object.fromEntries(players.map((player) => [player.id, createEmptyStats()]));
}

export function calculateStats(rounds: Round[]): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const player of [...match.teamA, ...match.teamB]) {
        stats[player.id] ??= createEmptyStats();
        stats[player.id].games += 1;
      }
    }

    for (const player of round.restPlayers) {
      stats[player.id] ??= createEmptyStats();
      stats[player.id].rests += 1;
    }
  }

  return stats;
}

function finalizeStats(stats: Record<string, PlayerStats>): Record<string, PlayerStats> {
  for (const playerId of Object.keys(stats)) {
    const current = stats[playerId];
    current.pointDiff = current.pointsScored - current.pointsAllowed;
    current.winRate = current.games > 0 ? Number(((current.wins / current.games) * 100).toFixed(1)) : 0;
  }

  return stats;
}

export function accumulateRoundStats(
  currentStats: Record<string, PlayerStats>,
  round: Round,
  matchType: MatchType,
): Record<string, PlayerStats> {
  const nextStats: Record<string, PlayerStats> = Object.fromEntries(
    Object.entries(currentStats).map(([playerId, stats]) => [
      playerId,
      {
        ...stats,
      },
    ]),
  );

  for (const player of round.restPlayers) {
    nextStats[player.id] ??= createEmptyStats();
    nextStats[player.id].rests += 1;
  }

  for (const match of round.matches) {
    const scoreA = match.scoreA;
    const scoreB = match.scoreB;
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      continue;
    }

    const resolvedScoreA = scoreA ?? 0;
    const resolvedScoreB = scoreB ?? 0;

    for (const player of match.teamA) {
      nextStats[player.id] ??= createEmptyStats();
      nextStats[player.id].games += 1;
      nextStats[player.id].pointsScored += resolvedScoreA;
      nextStats[player.id].pointsAllowed += resolvedScoreB;
    }

    for (const player of match.teamB) {
      nextStats[player.id] ??= createEmptyStats();
      nextStats[player.id].games += 1;
      nextStats[player.id].pointsScored += resolvedScoreB;
      nextStats[player.id].pointsAllowed += resolvedScoreA;
    }

    const winners = resolvedScoreA > resolvedScoreB ? match.teamA : match.teamB;
    const losers = resolvedScoreA > resolvedScoreB ? match.teamB : match.teamA;

    for (const player of winners) {
      nextStats[player.id].wins += 1;
    }

    for (const player of losers) {
      nextStats[player.id].losses += 1;
    }

    if (matchType === "singles") {
      continue;
    }
  }

  return finalizeStats(nextStats);
}
