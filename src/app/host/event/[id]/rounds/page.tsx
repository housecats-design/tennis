"use client";

import { loadEvent, subscribeToEvent } from "@/lib/events";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function HostRoundsPage() {
  const params = useParams<{ id: string }>();
  const eventId = typeof params.id === "string" ? params.id : "";
  const [event, setEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const refresh = async () => {
      try {
        setEvent(await loadEvent(eventId));
      } finally {
        setLoading(false);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 3000);
    const unsubscribe = subscribeToEvent(eventId, refresh);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [eventId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">전체 라운드를 불러오는 중입니다.</h1>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">전체 라운드를 찾을 수 없습니다.</h1>
          <Link href="/host" className="mt-6 inline-flex rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white">
            호스트로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap gap-3">
        <Link href={`/host/event/${event.id}`} className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white">
          호스트 대시보드
        </Link>
        <Link href={`/event/${event.id}/leaderboard`} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
          리더보드
        </Link>
      </div>

      <section className="grid gap-5">
        {event.rounds.map((round) => (
          <article key={round.id ?? round.roundNumber} className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-black">Round {round.roundNumber}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${round.completed ? "bg-accentStrong text-white" : "bg-amber-100 text-amber-800"}`}>
                {round.completed ? "완료" : "미완료"}
              </span>
            </div>

            <div className="grid gap-4">
              {round.matches.map((match) => (
                <div key={match.id ?? `${round.roundNumber}-${match.court}`} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Court {match.court}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
                      {match.teamA.map((player) => player.name).join(" / ")}
                    </div>
                    <div className="text-center text-sm font-black text-ink/55">
                      {match.scoreA ?? "-"} : {match.scoreB ?? "-"}
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
                      {match.teamB.map((player) => player.name).join(" / ")}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.skipped ? (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">건너뜀</span>
                    ) : null}
                    {match.isTieBreak ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">타이</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-sm text-ink/75">
              <span className="font-semibold text-ink">Rest Players:</span>{" "}
              {round.restPlayers.length > 0 ? round.restPlayers.map((player) => player.name).join(", ") : "없음"}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
