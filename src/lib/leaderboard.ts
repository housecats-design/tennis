import { MatchType, Player, PlayerStats, Round, SortDirection } from "@/lib/types";
import { accumulateRoundStats, createStatsRecord } from "@/lib/stats";

export function calculateLeaderboard(
  players: Player[],
  rounds: Round[],
  matchType: MatchType,
): Record<string, PlayerStats> {
  let stats = createStatsRecord(players);

  for (const round of rounds.filter((item) => item.completed)) {
    stats = accumulateRoundStats(stats, round, matchType);
  }

  return stats;
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
