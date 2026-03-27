"use client";

import { getCurrentProfile } from "@/lib/auth";
import { loadEvent, subscribeToEvent } from "@/lib/events";
import { loadLastRole } from "@/lib/storage";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HostRoundsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
        const [profile, nextEvent] = await Promise.all([getCurrentProfile(), loadEvent(eventId)]);
        const lastRole = loadLastRole();
        if (!profile || lastRole === "player" || (nextEvent && nextEvent.hostUserId !== profile.id)) {
          router.replace(nextEvent ? `/guest/event/${nextEvent.id}` : "/");
          return;
        }
        setEvent(nextEvent);
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
  }, [eventId, router]);

  if (loading) {
    return (
      <main className="poster-page max-w-3xl">
        <div className="border-t border-line py-8 text-center">
          <h1 className="text-3xl font-black">전체 라운드를 불러오는 중입니다.</h1>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="poster-page max-w-3xl">
        <div className="border-t border-line py-8 text-center">
          <h1 className="text-3xl font-black">전체 라운드를 찾을 수 없습니다.</h1>
          <Link href="/host" className="poster-button mt-6">
            호스트로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="mb-8 flex flex-wrap gap-3">
        <Link href={`/host/event/${event.id}`} className="poster-button">
          호스트 대시보드
        </Link>
        <Link href={`/event/${event.id}/leaderboard`} className="poster-button-secondary">
          리더보드
        </Link>
      </div>

      <section className="grid gap-5">
        {event.rounds.map((round) => (
          <article key={round.id ?? round.roundNumber} className={`border-t border-line py-6 pl-4 round-poster-${((round.roundNumber - 1) % 4) + 1}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-3xl font-black tracking-[-0.03em]">ROUND {round.roundNumber}</h2>
              <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${round.completed ? "text-accentStrong" : "text-amber-800"}`}>
                {round.completed ? "완료" : "미완료"}
              </span>
            </div>

            <div className="grid gap-4">
              {round.matches.map((match) => (
                <div key={match.id ?? `${round.roundNumber}-${match.court}`} className="border-t border-line py-4">
                  <p className="poster-label">Court {match.court}</p>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div><span className="mr-3 inline-block w-4 font-bold text-accentStrong">A</span>{match.teamA.map((player) => player.name).join(" / ")}</div>
                    <div><span className="mr-3 inline-block w-4 font-bold text-ink/70">B</span>{match.teamB.map((player) => player.name).join(" / ")}</div>
                    <div className="pt-1 text-sm font-semibold text-ink/70">{match.scoreA ?? "-"} : {match.scoreB ?? "-"}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.skipped ? (
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">건너뜀</span>
                    ) : null}
                    {match.isTieBreak ? (
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">타이</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-dashed border-line pt-4 text-sm text-ink/75">
              <span className="font-semibold text-ink">REST</span>{" "}
              {round.restPlayers.length > 0 ? round.restPlayers.map((player) => player.name).join(", ") : "없음"}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
