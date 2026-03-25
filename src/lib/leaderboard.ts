import { MatchType, Player, PlayerStats, Round, SortDirection } from "@/lib/types";
import { accumulateRoundStats, createStatsRecord } from "@/lib/stats";

export function calculateExpectedParticipation(rounds: Round[]): Record<string, { expectedGames: number; expectedRests: number }> {
  return rounds.reduce<Record<string, { expectedGames: number; expectedRests: number }>>((summary, round) => {
    for (const player of round.restPlayers) {
      summary[player.id] = summary[player.id] ?? { expectedGames: 0, expectedRests: 0 };
      summary[player.id].expectedRests += 1;
    }

    for (const match of round.matches) {
      if (match.skipped || round.forceClosed) {
        continue;
      }

      for (const player of [...match.teamA, ...match.teamB]) {
        summary[player.id] = summary[player.id] ?? { expectedGames: 0, expectedRests: 0 };
        summary[player.id].expectedGames += 1;
      }
    }

    return summary;
  }, {});
}

export function calculateLeaderboard(
  players: Player[],
  rounds: Round[],
  matchType: MatchType,
): Record<string, PlayerStats> {
  let stats = createStatsRecord(players);

  for (const round of rounds.filter((item) => item.completed)) {
    stats = accumulateRoundStats(stats, round, matchType);
  }

  const gameCounts = Object.values(stats).map((item) => item.games);
  const maxGames = gameCounts.length > 0 ? Math.max(...gameCounts) : 0;
  const expected = calculateExpectedParticipation(rounds);
  const maxExpectedGames = Math.max(0, ...Object.values(expected).map((item) => item.expectedGames));
  for (const playerId of Object.keys(stats)) {
    stats[playerId].fairPlayWarning = maxGames - stats[playerId].games >= 1;
    stats[playerId].expectedGames = expected[playerId]?.expectedGames ?? 0;
    stats[playerId].expectedRests = expected[playerId]?.expectedRests ?? 0;
    stats[playerId].expectedShortage = Math.max(0, maxExpectedGames - (expected[playerId]?.expectedGames ?? 0));
  }

  return stats;
}

export function buildMatchHistory(rounds: Round[]) {
  return rounds.map((round) => ({
    roundNumber: round.roundNumber,
    completed: Boolean(round.completed),
    matches: round.matches.map((match) => ({
      court: match.court,
      teamA: match.teamA.map((player) => player.name),
      teamB: match.teamB.map((player) => player.name),
      scoreA: match.scoreA ?? null,
      scoreB: match.scoreB ?? null,
      skipped: Boolean(match.skipped),
      disputed: match.scoreProposal?.status === "disputed",
    })),
    restPlayers: round.restPlayers.map((player) => player.name),
  }));
}

export function sortLeaderboard(
  players: Player[],
  stats: Record<string, PlayerStats>,
  direction: SortDirection = "asc",
): Player[] {
  return [...players].sort((left, right) => {
    const leftStats = stats[left.id];
    const rightStats = stats[right.id];

    const winDiff = leftStats.wins - rightStats.wins;
    if (winDiff !== 0) {
      return direction === "asc" ? winDiff : -winDiff;
    }

    if (leftStats.losses !== rightStats.losses) {
      return direction === "asc"
        ? leftStats.losses - rightStats.losses
        : rightStats.losses - leftStats.losses;
    }

    if (leftStats.pointDiff !== rightStats.pointDiff) {
      return direction === "asc"
        ? leftStats.pointDiff - rightStats.pointDiff
        : rightStats.pointDiff - leftStats.pointDiff;
    }

    if (leftStats.pointsScored !== rightStats.pointsScored) {
      return direction === "asc"
        ? leftStats.pointsScored - rightStats.pointsScored
        : rightStats.pointsScored - leftStats.pointsScored;
    }

    return left.name.localeCompare(right.name);
  });
}
