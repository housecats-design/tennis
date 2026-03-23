"use client";

import { loadEvent, subscribeToEvent } from "@/lib/events";
import { sortLeaderboard } from "@/lib/leaderboard";
import { Player, SortDirection } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function EventLeaderboardPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [event, setEvent] = useState(() => (eventId ? loadEvent(eventId) : null));
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const refresh = () => setEvent(loadEvent(eventId));
    refresh();
    const interval = window.setInterval(refresh, 3000);
    const unsubscribe = subscribeToEvent(eventId, refresh);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
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
    return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink/70">이벤트가 없습니다.</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href={`/host/event/${event.id}`} className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white">
          호스트 대시보드
        </Link>
        <button type="button" onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
          승수 정렬 전환
        </button>
      </div>

      <section className="rounded-3xl border border-line bg-white/90 p-4 shadow-panel sm:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink/60">
                <th className="px-3 py-3 font-semibold">이름</th>
                <th className="px-3 py-3 font-semibold">성별</th>
                <th className="px-3 py-3 font-semibold">경기수</th>
                <th className="px-3 py-3 font-semibold">승</th>
                <th className="px-3 py-3 font-semibold">패</th>
                <th className="px-3 py-3 font-semibold">득점</th>
                <th className="px-3 py-3 font-semibold">실점</th>
                <th className="px-3 py-3 font-semibold">득실차</th>
                <th className="px-3 py-3 font-semibold">승률</th>
                <th className="px-3 py-3 font-semibold">휴식수</th>
              </tr>
            </thead>
            <tbody>
              {rankedPlayers.map((player: Player) => {
                const participant = event.participants.find((item) => item.id === player.id);
                const stats = event.stats[player.id];

                return (
                  <tr key={player.id} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-4 font-semibold">{player.name}</td>
                    <td className="px-3 py-4">
                      {participant?.gender === "male" ? "남성" : participant?.gender === "female" ? "여성" : "미정"}
                    </td>
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
