"use client";

import { calculateLeaderboard, sortLeaderboard } from "@/lib/leaderboard";
import {
  applyScoresToRounds,
  loadCompletedRound,
  loadLeaderboardStats,
  loadRoundScores,
  loadSchedule,
} from "@/lib/storage";
import { Player, PlayerStats, SortDirection, StoredSchedule } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function LeaderboardPage() {
  const [storedSchedule, setStoredSchedule] = useState<StoredSchedule | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [completedRound, setCompletedRound] = useState(0);
  const [persistedStats, setPersistedStats] = useState<Record<string, PlayerStats>>({});

  function refreshLeaderboard(): void {
    const schedule = loadSchedule();
    if (!schedule) {
      return;
    }

    const scores = loadRoundScores();
    setStoredSchedule({
      ...schedule,
      output: {
        ...schedule.output,
        rounds: applyScoresToRounds(schedule.output.rounds, scores),
      },
    });
    setCompletedRound(loadCompletedRound());
    setPersistedStats(loadLeaderboardStats());
  }

  useEffect(() => {
    refreshLeaderboard();
  }, []);

  const leaderboardStats = useMemo(() => {
    if (!storedSchedule) {
      return {};
    }

    if (Object.keys(persistedStats).length > 0) {
      return persistedStats;
    }

    return calculateLeaderboard(
      storedSchedule.input.players,
      storedSchedule.output.rounds,
      storedSchedule.input.matchType,
    );
  }, [persistedStats, storedSchedule]);

  const effectiveLeaderboardStats = useMemo(() => {
    if (!storedSchedule) {
      return {};
    }

    return Object.keys(leaderboardStats).length > 0
      ? leaderboardStats
      : calculateLeaderboard(
          storedSchedule.input.players,
          storedSchedule.output.rounds,
          storedSchedule.input.matchType,
        );
  }, [leaderboardStats, storedSchedule]);

  const rankedPlayers = useMemo(() => {
    if (!storedSchedule) {
      return [];
    }

    return sortLeaderboard(storedSchedule.input.players, effectiveLeaderboardStats, sortDirection);
  }, [effectiveLeaderboardStats, sortDirection, storedSchedule]);

  if (!storedSchedule) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">리더보드가 없습니다.</h1>
          <p className="mt-3 text-sm text-ink/70">먼저 경기표를 생성하고 점수를 입력해 주세요.</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white"
          >
            설정 페이지로 이동
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
            Leaderboard
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">선수 랭킹</h1>
          <p className="mt-3 text-sm text-ink/70">
            완료된 라운드 {completedRound}개 기준으로 누적 통계를 보여줍니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refreshLeaderboard}
            className="inline-flex rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink"
          >
            Refresh Leaderboard
          </button>
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
            className="inline-flex rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink"
          >
            Wins {sortDirection === "asc" ? "Ascending" : "Descending"}
          </button>
          <Link
            href="/result"
            className="inline-flex rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white"
          >
            점수 입력으로 돌아가기
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink"
          >
            Back to Settings
          </Link>
        </div>
      </div>

      <section className="rounded-3xl border border-line bg-white/90 p-4 shadow-panel sm:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink/60">
                <th className="px-3 py-3 font-semibold">#</th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Matches</th>
                <th className="px-3 py-3 font-semibold">Wins</th>
                <th className="px-3 py-3 font-semibold">Losses</th>
                <th className="px-3 py-3 font-semibold">Points Scored</th>
                <th className="px-3 py-3 font-semibold">Points Conceded</th>
                <th className="px-3 py-3 font-semibold">Diff</th>
                <th className="px-3 py-3 font-semibold">Win Rate</th>
                <th className="px-3 py-3 font-semibold">Rests</th>
              </tr>
            </thead>
            <tbody>
              {rankedPlayers.map((player: Player, index) => {
                const stats = effectiveLeaderboardStats[player.id];

                return (
                  <tr key={player.id} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-4 font-black text-accentStrong">{index + 1}</td>
                    <td className="px-3 py-4 font-semibold">{player.name}</td>
                    <td className="px-3 py-4">{stats.games}</td>
                    <td className="px-3 py-4">{stats.wins}</td>
                    <td className="px-3 py-4">{stats.losses}</td>
                    <td className="px-3 py-4">{stats.pointsScored}</td>
                    <td className="px-3 py-4">{stats.pointsAllowed}</td>
                    <td className="px-3 py-4">{stats.pointDiff}</td>
                    <td className="px-3 py-4">{stats.winRate}%</td>
                    <td className="px-3 py-4">{stats.rests}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
