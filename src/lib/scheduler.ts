import { calculateStats } from "@/lib/stats";
import { Match, MatchType, Player, PlayerStats, Round, ScheduleRequest, ScheduleResponse, SkillLevel } from "@/lib/types";

type MutableState = Record<string, PlayerStats>;
type PairHistory = Record<string, number>;

function makePairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function randomBias(): number {
  return Math.random() * 0.35;
}

function skillScore(level?: SkillLevel): number {
  if (level === "high") {
    return 3;
  }
  if (level === "low") {
    return 1;
  }
  return 2;
}

function mixedTeamPenalty(team: Player[]): number {
  const genders = new Set(team.map((player) => player.gender).filter(Boolean));
  return genders.has("male") && genders.has("female") ? 0 : 6;
}

function cloneStats(players: Player[]): MutableState {
  return Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        games: 0,
        wins: 0,
        losses: 0,
        pointsScored: 0,
        pointsAllowed: 0,
        pointDiff: 0,
        winRate: 0,
        rests: 0,
      },
    ]),
  );
}

function sortByPriority(players: Player[], stats: MutableState): Player[] {
  return [...players].sort((left, right) => {
    const gameDiff = stats[left.id].games - stats[right.id].games;
    if (gameDiff !== 0) {
      return gameDiff;
    }

    const restDiff = stats[right.id].rests - stats[left.id].rests;
    if (restDiff !== 0) {
      return restDiff;
    }

    return randomBias() - randomBias();
  });
}

function scoreSinglesPair(
  playerA: Player,
  playerB: Player,
  stats: MutableState,
  opponentHistory: PairHistory,
): number {
  const repeatedOpponents = opponentHistory[makePairKey(playerA.id, playerB.id)] ?? 0;
  const balancePenalty = Math.abs(stats[playerA.id].games - stats[playerB.id].games);

  return repeatedOpponents * 10 + balancePenalty + randomBias();
}

function buildSinglesMatches(
  activePlayers: Player[],
  stats: MutableState,
  opponentHistory: PairHistory,
): Match[] {
  const remaining = [...activePlayers];
  const matches: Match[] = [];
  let court = 1;

  while (remaining.length >= 2) {
    const playerA = remaining.shift();
    if (!playerA) {
      break;
    }

    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const score = scoreSinglesPair(playerA, remaining[index], stats, opponentHistory);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const playerB = remaining.splice(bestIndex, 1)[0];
    if (!playerB) {
      break;
    }

    matches.push({
      court,
      teamA: [playerA],
      teamB: [playerB],
      scoreA: null,
      scoreB: null,
      isTieBreak: false,
      skipped: false,
    });
    court += 1;
  }

  return matches;
}

function scoreDoublesTeams(
  players: [Player, Player, Player, Player],
  teammateHistory: PairHistory,
  opponentHistory: PairHistory,
): { teamA: Player[]; teamB: Player[]; score: number } {
  const [a, b, c, d] = players;

  const options = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];

  const bestOption = options
    .map((option) => {
      const teammateRepeats =
        (teammateHistory[makePairKey(option.teamA[0].id, option.teamA[1].id)] ?? 0) +
        (teammateHistory[makePairKey(option.teamB[0].id, option.teamB[1].id)] ?? 0);

      const opponentRepeats =
        (opponentHistory[makePairKey(option.teamA[0].id, option.teamB[0].id)] ?? 0) +
        (opponentHistory[makePairKey(option.teamA[0].id, option.teamB[1].id)] ?? 0) +
        (opponentHistory[makePairKey(option.teamA[1].id, option.teamB[0].id)] ?? 0) +
        (opponentHistory[makePairKey(option.teamA[1].id, option.teamB[1].id)] ?? 0);

      const teamASkill = option.teamA.reduce((sum, player) => sum + skillScore(player.skillLevel), 0);
      const teamBSkill = option.teamB.reduce((sum, player) => sum + skillScore(player.skillLevel), 0);
      const skillPenalty = Math.abs(teamASkill - teamBSkill) * 2;
      const genderPenalty = mixedTeamPenalty(option.teamA) + mixedTeamPenalty(option.teamB);

      return {
        ...option,
        score: teammateRepeats * 12 + opponentRepeats * 4 + skillPenalty + genderPenalty + randomBias(),
      };
    })
    .sort((left, right) => left.score - right.score)[0];

  if (!bestOption) {
    throw new Error("Unable to build doubles teams.");
  }

  return bestOption;
}

function buildDoublesMatches(
  activePlayers: Player[],
  teammateHistory: PairHistory,
  opponentHistory: PairHistory,
): Match[] {
  const remaining = [...activePlayers];
  const matches: Match[] = [];
  let court = 1;

  while (remaining.length >= 4) {
    const group = remaining.splice(0, 4) as [Player, Player, Player, Player];
    const best = scoreDoublesTeams(group, teammateHistory, opponentHistory);
    matches.push({
      court,
      teamA: best.teamA,
      teamB: best.teamB,
      scoreA: null,
      scoreB: null,
      isTieBreak: false,
      skipped: false,
    });
    court += 1;
  }

  return matches;
}

function markRoundUsage(round: Round, stats: MutableState): void {
  for (const match of round.matches) {
    if (match.skipped) {
      continue;
    }

    for (const player of [...match.teamA, ...match.teamB]) {
      stats[player.id].games += 1;
    }
  }

  for (const player of round.restPlayers) {
    stats[player.id].rests += 1;
  }
}

function updateHistories(
  round: Round,
  matchType: MatchType,
  teammateHistory: PairHistory,
  opponentHistory: PairHistory,
): void {
  for (const match of round.matches) {
    if (match.skipped) {
      continue;
    }

    if (matchType === "singles") {
      const key = makePairKey(match.teamA[0].id, match.teamB[0].id);
      opponentHistory[key] = (opponentHistory[key] ?? 0) + 1;
      continue;
    }

    teammateHistory[makePairKey(match.teamA[0].id, match.teamA[1].id)] =
      (teammateHistory[makePairKey(match.teamA[0].id, match.teamA[1].id)] ?? 0) + 1;
    teammateHistory[makePairKey(match.teamB[0].id, match.teamB[1].id)] =
      (teammateHistory[makePairKey(match.teamB[0].id, match.teamB[1].id)] ?? 0) + 1;

    for (const playerA of match.teamA) {
      for (const playerB of match.teamB) {
        const opponentKey = makePairKey(playerA.id, playerB.id);
        opponentHistory[opponentKey] = (opponentHistory[opponentKey] ?? 0) + 1;
      }
    }
  }
}

function buildRound(
  roundNumber: number,
  players: Player[],
  matchType: MatchType,
  courtCount: number,
  stats: MutableState,
  teammateHistory: PairHistory,
  opponentHistory: PairHistory,
): Round {
  const playersPerMatch = matchType === "singles" ? 2 : 4;
  const maxMatchesByPlayers = Math.floor(players.length / playersPerMatch);
  const matchCount = Math.min(courtCount, maxMatchesByPlayers);
  const activeCount = matchCount * playersPerMatch;

  const prioritized = sortByPriority(players, stats);
  const activePlayers = prioritized.slice(0, activeCount);
  const restPlayers = prioritized.slice(activeCount);

  const matches =
    matchType === "singles"
      ? buildSinglesMatches(activePlayers, stats, opponentHistory)
      : buildDoublesMatches(activePlayers, teammateHistory, opponentHistory);

  return {
    roundNumber,
    matches,
    restPlayers,
    completed: false,
  };
}

export function generateSchedule(input: ScheduleRequest): ScheduleResponse {
  const runtimeStats = cloneStats(input.players);
  const teammateHistory: PairHistory = {};
  const opponentHistory: PairHistory = {};
  const rounds: Round[] = [];

  for (let roundNumber = 1; roundNumber <= input.roundCount; roundNumber += 1) {
    const round = buildRound(
      roundNumber,
      input.players,
      input.matchType,
      input.courtCount,
      runtimeStats,
      teammateHistory,
      opponentHistory,
    );

    markRoundUsage(round, runtimeStats);
    updateHistories(round, input.matchType, teammateHistory, opponentHistory);
    rounds.push(round);
  }

  return {
    rounds,
    stats: calculateStats(rounds),
  };
}

export function rebuildRoundMatches(matchType: MatchType, players: Player[], courtCount: number): Match[] {
  const stats = cloneStats(players);
  if (matchType === "singles") {
    return buildSinglesMatches(players.slice(0, courtCount * 2), stats, {});
  }

  return buildDoublesMatches(players.slice(0, courtCount * 4), {}, {});
}
