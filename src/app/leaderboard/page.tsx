"use client";

import { loadEvent } from "@/lib/events";
import { sortLeaderboard } from "@/lib/leaderboard";
import { Player, SortDirection } from "@/lib/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [event, setEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const refresh = async () => {
      setEvent(await loadEvent(eventId));
    };

    void refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => window.clearInterval(interval);
  }, [eventId]);

  const rankedPlayers = useMemo(() => {
    if (!event) {
      return [];
    }

    return sortLeaderboard(
      event.participants.map((participant) => ({ id: participant.id, name: participant.displayName })),
      event.stats,
      sortDirection,
    );
  }, [event, sortDirection]);

  if (!event) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">리더보드가 없습니다.</h1>
          <p className="mt-3 text-sm text-ink/70">이벤트를 먼저 생성하거나 참여해 주세요.</p>
          <Link href="/" className="mt-6 inline-flex rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white">
            첫 화면으로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-line bg-white/90 p-6 shadow-panel md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Leaderboard</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{event.eventName}</h1>
          <p className="mt-3 text-sm text-ink/70">
            완료된 라운드만 통계에 반영됩니다. 현재 정렬: wins {sortDirection === "asc" ? "오름차순" : "내림차순"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
            className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold"
          >
            정렬 전환
          </button>
          <Link href={`/host/event/${event.id}`} className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white">
            Back to Results
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
                <th className="px-3 py-3 font-semibold">Games</th>
                <th className="px-3 py-3 font-semibold">Wins</th>
                <th className="px-3 py-3 font-semibold">Losses</th>
                <th className="px-3 py-3 font-semibold">Points Scored</th>
                <th className="px-3 py-3 font-semibold">Points Allowed</th>
                <th className="px-3 py-3 font-semibold">Diff</th>
                <th className="px-3 py-3 font-semibold">Win Rate</th>
                <th className="px-3 py-3 font-semibold">Rests</th>
              </tr>
            </thead>
            <tbody>
              {rankedPlayers.map((player: Player, index) => {
                const stats = event.stats[player.id];
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

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10 text-sm text-ink/70">리더보드를 불러오는 중...</main>}>
      <LeaderboardContent />
    </Suspense>
  );
}
