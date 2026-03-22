"use client";

import { sortLeaderboard } from "@/lib/leaderboard";
import { accumulateRoundStats, createStatsRecord } from "@/lib/stats";
import {
  applyScoresToRounds,
  buildScoreMap,
  loadCompletedRound,
  loadLeaderboardStats,
  loadRoundScores,
  loadSchedule,
  saveCompletedRound,
  saveLeaderboardStats,
  saveRoundScores,
  saveSchedule,
  updateMatchScore,
} from "@/lib/storage";
import { PlayerStats, StoredSchedule } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const EMPTY_LEADERBOARD_STATS = {
  games: 0,
  wins: 0,
  losses: 0,
  pointsScored: 0,
  pointsAllowed: 0,
  pointDiff: 0,
  winRate: 0,
  rests: 0,
};

function parseScoreValue(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function isTieBreakScore(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  return (scoreA === 6 && scoreB === 5) || (scoreA === 5 && scoreB === 6);
}

function isValidFinishedScore(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return false;
  }

  const resolvedScoreA = scoreA ?? -1;
  const resolvedScoreB = scoreB ?? -1;

  return (
    (resolvedScoreA === 6 && resolvedScoreB >= 0 && resolvedScoreB <= 5) ||
    (resolvedScoreB === 6 && resolvedScoreA >= 0 && resolvedScoreA <= 5)
  );
}

export default function ResultPage() {
  const [storedResult, setStoredResult] = useState<StoredSchedule | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [completedRound, setCompletedRound] = useState(0);
  const [leaderboardStats, setLeaderboardStats] = useState<Record<string, PlayerStats>>({});

  useEffect(() => {
    const schedule = loadSchedule();
    if (!schedule) {
      return;
    }

    const scores = loadRoundScores();
    const persistedCompletedRound = loadCompletedRound();
    setStoredResult({
      ...schedule,
      output: {
        ...schedule.output,
        rounds: applyScoresToRounds(schedule.output.rounds, scores),
      },
    });
    setCompletedRound(persistedCompletedRound);
    setLeaderboardStats(loadLeaderboardStats());
  }, []);

  const activeRoundNumber = completedRound + 1;

  const visibleRounds = useMemo(() => {
    if (!storedResult) {
      return [];
    }

    return storedResult.output.rounds.filter((round) => round.roundNumber <= activeRoundNumber);
  }, [activeRoundNumber, storedResult]);

  const effectiveLeaderboardStats = useMemo(() => {
    if (!storedResult) {
      return {};
    }

    return Object.keys(leaderboardStats).length > 0
      ? leaderboardStats
      : createStatsRecord(storedResult.input.players);
  }, [leaderboardStats, storedResult]);

  const sortedPlayers = useMemo(() => {
    if (!storedResult) {
      return [];
    }

    return sortLeaderboard(storedResult.input.players, effectiveLeaderboardStats, "asc");
  }, [effectiveLeaderboardStats, storedResult]);

  function persistSchedule(nextSchedule: StoredSchedule): void {
    setStoredResult(nextSchedule);
    saveSchedule(nextSchedule);
    saveRoundScores(buildScoreMap(nextSchedule.output.rounds));
  }

  function handleScoreChange(
    roundNumber: number,
    court: number,
    team: "scoreA" | "scoreB",
    value: string,
  ): void {
    if (!storedResult) {
      return;
    }

    if (value.trim() !== "") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setScoreError("점수는 0 이상의 정수만 입력할 수 있습니다.");
        return;
      }
    }

    setScoreError(null);

    const parsedScore = parseScoreValue(value);
    const nextRounds = updateMatchScore(storedResult.output.rounds, roundNumber, court, {
      [team]: parsedScore,
    });

    persistSchedule({
      ...storedResult,
      output: {
        ...storedResult.output,
        rounds: nextRounds,
      },
    });
  }

  function handleFinalizeRound(roundNumber: number): void {
    if (!storedResult) {
      return;
    }

    const targetRound = storedResult.output.rounds.find((round) => round.roundNumber === roundNumber);
    if (!targetRound) {
      return;
    }

    for (const match of targetRound.matches) {
      if (!isValidFinishedScore(match.scoreA, match.scoreB)) {
        setScoreError("현재 라운드의 모든 경기는 6:0부터 6:5 사이의 완료 점수여야 합니다.");
        return;
      }
    }

    const nextRounds = storedResult.output.rounds.map((round) => {
      if (round.roundNumber !== roundNumber) {
        return round;
      }

      return {
        ...round,
        completed: true,
        matches: round.matches.map((match) => ({
          ...match,
          isTieBreak: isTieBreakScore(match.scoreA, match.scoreB),
        })),
      };
    });

    const finalizedRound = nextRounds.find((round) => round.roundNumber === roundNumber);
    if (!finalizedRound) {
      return;
    }

    const nextStats = accumulateRoundStats(
      Object.keys(leaderboardStats).length > 0
        ? leaderboardStats
        : createStatsRecord(storedResult.input.players),
      finalizedRound,
      storedResult.input.matchType,
    );

    const nextSchedule = {
      ...storedResult,
      output: {
        ...storedResult.output,
        rounds: nextRounds,
        stats: nextStats,
      },
    };

    setScoreError(null);
    setCompletedRound(roundNumber);
    setLeaderboardStats(nextStats);
    persistSchedule(nextSchedule);
    saveCompletedRound(roundNumber);
    saveLeaderboardStats(nextStats);
  }

  if (!storedResult) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">결과가 없습니다.</h1>
          <p className="mt-3 text-sm text-ink/70">
            먼저 입력 페이지에서 경기표를 생성해 주세요.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white"
          >
            입력 페이지로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-line bg-white/90 p-6 shadow-panel md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Schedule Result
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">생성된 경기표</h1>
          <p className="mt-3 text-sm text-ink/70">
            {storedResult.input.matchType === "singles" ? "단식" : "복식"} / 코트 {storedResult.input.courtCount}개 / 라운드{" "}
            {storedResult.input.roundCount}개 / 선수 {storedResult.input.players.length}명
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/leaderboard"
            className="inline-flex h-fit rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white"
          >
            View Leaderboard
          </Link>
          <Link
            href="/"
            className="inline-flex h-fit rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink"
          >
            Back to Settings
          </Link>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="grid gap-5">
          {scoreError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {scoreError}
            </div>
          ) : null}

          {visibleRounds.map((round) => (
            <article
              key={round.roundNumber}
              className={`rounded-3xl border p-6 shadow-panel ${
                round.completed ? "border-accent bg-white/90" : "border-line bg-white/90"
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-black">Round {round.roundNumber}</h2>
                <div className="flex gap-2">
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink/65">
                    Match {round.matches.length}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      round.completed
                        ? "bg-accentStrong text-white"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {round.completed ? "완료" : "진행 중"}
                  </span>
                </div>
              </div>

              <div className="grid gap-4">
                {round.matches.map((match) => (
                  <div
                    key={`${round.roundNumber}-${match.court}`}
                    className="rounded-2xl border border-line bg-surface p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                      Court {match.court}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
                        {match.teamA.map((player) => player.name).join(" / ")}
                      </div>
                      <div className="text-center text-sm font-black text-ink/55">VS</div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
                        {match.teamB.map((player) => player.name).join(" / ")}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold text-ink/75">
                        Team A Score
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={match.scoreA ?? ""}
                          disabled={round.completed || round.roundNumber !== activeRoundNumber}
                          onChange={(event) =>
                            handleScoreChange(
                              round.roundNumber,
                              match.court,
                              "scoreA",
                              event.target.value,
                            )
                          }
                          className="rounded-2xl border border-line bg-white px-4 py-3 outline-none transition focus:border-accent disabled:bg-slate-100"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-ink/75">
                        Team B Score
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={match.scoreB ?? ""}
                          disabled={round.completed || round.roundNumber !== activeRoundNumber}
                          onChange={(event) =>
                            handleScoreChange(
                              round.roundNumber,
                              match.court,
                              "scoreB",
                              event.target.value,
                            )
                          }
                          className="rounded-2xl border border-line bg-white px-4 py-3 outline-none transition focus:border-accent disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                    {isTieBreakScore(match.scoreA, match.scoreB) ? (
                      <div className="mt-3">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                          타이
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-sm text-ink/75">
                <span className="font-semibold text-ink">Rest Players:</span>{" "}
                {round.restPlayers.length > 0
                  ? round.restPlayers.map((player) => player.name).join(", ")
                  : "없음"}
              </div>
              {!round.completed && round.roundNumber === activeRoundNumber ? (
                <button
                  type="button"
                  onClick={() => handleFinalizeRound(round.roundNumber)}
                  className="mt-5 inline-flex rounded-2xl bg-accentStrong px-4 py-3 text-sm font-bold text-white"
                >
                  점수 올리기
                </button>
              ) : null}
            </article>
          ))}
        </div>

        <aside className="rounded-3xl border border-line bg-accentStrong p-6 text-white shadow-panel">
          <h2 className="text-2xl font-black">누적 통계</h2>
          <p className="mt-2 text-sm text-white/75">
            완료된 라운드 기준으로만 업데이트됩니다.
          </p>
          <div className="mt-5 space-y-3">
            {sortedPlayers.map((player) => {
              const stats = effectiveLeaderboardStats[player.id] ?? EMPTY_LEADERBOARD_STATS;

              return (
                <div
                  key={player.id}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4"
                >
                  <div className="text-sm font-bold">{player.name}</div>
                  <div className="mt-2 flex justify-between text-sm text-white/80">
                    <span>Games</span>
                    <span>{stats.games}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm text-white/80">
                    <span>Rests</span>
                    <span>{stats.rests}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm text-white/80">
                    <span>Wins</span>
                    <span>{stats.wins}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm text-white/80">
                    <span>Win Rate</span>
                    <span>{stats.winRate}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>
    </main>
  );
}
