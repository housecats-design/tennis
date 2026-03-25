"use client";

import { loadEvent, subscribeToEvent } from "@/lib/events";
import { buildMatchHistory, sortLeaderboard } from "@/lib/leaderboard";
import { Player, SortDirection } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function EventLeaderboardPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [event, setEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const refresh = async () => {
      setEvent(await loadEvent(eventId));
    };

    void refresh();
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
  const matchHistory = useMemo(() => (event ? buildMatchHistory(event.rounds) : []), [event]);

  if (!event) {
    return <main className="poster-page max-w-3xl text-sm text-ink/70">이벤트가 없습니다.</main>;
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href={`/host/event/${event.id}`} className="poster-button">
          호스트 대시보드
        </Link>
        <button type="button" onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))} className="poster-button-secondary">
          승수 정렬 전환
        </button>
      </div>

      <section className="border-t border-line py-6">
        <div className="mb-4">
          <p className="poster-label">Leaderboard</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">누적 리더보드</h1>
        </div>
        <div className="overflow-x-auto">
          <table className="poster-table min-w-full text-left text-sm">
            <thead>
              <tr>
                <th>이름</th>
                <th>성별</th>
                <th>NTRP</th>
                <th>경기수</th>
                <th>예정경기수</th>
                <th>승</th>
                <th>패</th>
                <th>득점</th>
                <th>실점</th>
                <th>휴식수</th>
              </tr>
            </thead>
            <tbody>
              {rankedPlayers.map((player: Player) => {
                const participant = event.participants.find((item) => item.id === player.id);
                const stats = event.stats[player.id];

                return (
                  <tr key={player.id}>
                    <td className="font-semibold">{player.name}</td>
                    <td>
                      {participant?.gender === "male" ? "남성" : participant?.gender === "female" ? "여성" : "미정"}
                    </td>
                    <td>{typeof participant?.guestNtrp === "number" ? participant.guestNtrp.toFixed(1) : "-"}</td>
                    <td>{stats.games}</td>
                    <td>
                      <div className={stats.expectedShortage && stats.expectedShortage >= 1 ? "font-semibold text-red-700" : ""}>
                        {stats.expectedGames ?? 0}
                      </div>
                      {stats.expectedShortage && stats.expectedShortage >= 1 ? (
                        <div className="mt-1 text-[11px] font-bold tracking-[0.12em] text-red-700">
                          예정경기수 부족
                        </div>
                      ) : null}
                    </td>
                    <td>{stats.wins}</td>
                    <td>{stats.losses}</td>
                    <td>{stats.pointsScored}</td>
                    <td>{stats.pointsAllowed}</td>
                    <td>
                      <div>{stats.rests}</div>
                      {stats.fairPlayWarning ? (
                        <div className="mt-1 inline-flex text-[11px] font-bold uppercase tracking-[0.18em] text-amber-800">
                          경기수 부족
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 border-t border-line py-6">
        <h2 className="text-3xl font-black tracking-[-0.03em]">라운드별 경기 이력</h2>
        <div className="mt-4 space-y-4">
          {matchHistory.map((round) => (
            <article key={round.roundNumber} className="border-b border-line pb-4">
              <div className="font-semibold">Round {round.roundNumber}</div>
              <div className="mt-3 space-y-2 text-sm text-ink/75">
                {round.matches.map((match, index) => (
                  <div key={`${round.roundNumber}-${index}`} className="border-b border-line/60 py-3 last:border-b-0">
                    Court {match.court} / {match.teamA.join(" / ")} vs {match.teamB.join(" / ")} / {match.scoreA ?? "-"}:{match.scoreB ?? "-"}
                    {match.skipped ? " / 건너뜀" : ""}
                    {match.disputed ? " / 이의신청" : ""}
                  </div>
                ))}
                <div className="text-xs text-ink/60">휴식: {round.restPlayers.length > 0 ? round.restPlayers.join(", ") : "없음"}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
