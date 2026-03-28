"use client";

import { loadSavedEventById } from "@/lib/history";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SavedEventDetailPage() {
  const params = useParams<{ id: string }>();
  const savedEventId = typeof params.id === "string" ? params.id : "";
  const [savedEvent, setSavedEvent] = useState<Awaited<ReturnType<typeof loadSavedEventById>>>(null);

  useEffect(() => {
    if (!savedEventId) {
      return;
    }

    void loadSavedEventById(savedEventId).then(setSavedEvent);
  }, [savedEventId]);

  if (!savedEvent) {
    return <main className="poster-page max-w-5xl text-sm text-ink/70">저장된 이벤트를 찾을 수 없습니다.</main>;
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/history/host" className="poster-button-secondary">호스트 이력</Link>
        <Link href="/history/player" className="poster-button-secondary">내 기록</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">Saved Event</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">{savedEvent.eventName}</h1>
        <div className="mt-4 text-sm text-ink/65">{new Date(savedEvent.savedAt).toLocaleString("ko-KR")}</div>
        <div className="mt-3 text-sm text-ink/60">
          {savedEvent.eventType === "club" ? `클럽 이벤트${savedEvent.clubName ? ` · ${savedEvent.clubName}` : ""}` : "개인 이벤트"}
        </div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">TOP 3</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {savedEvent.topThree.map((player) => (
            <div key={player.participantId} className="border-b border-line pb-4">
              <div className="text-sm text-accentStrong">{player.rank}등</div>
              <div className="mt-2 text-2xl font-black">{player.name}</div>
              <div className="mt-2 text-sm text-ink/68">승 {player.stats.wins} · 득점 {player.stats.pointsScored} · 득실 {player.stats.pointDiff}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">전체 랭킹</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="poster-table min-w-full text-left">
            <thead>
              <tr>
                <th>순위</th>
                <th>이름</th>
                <th>성별</th>
                <th>NTRP</th>
                <th>참가 클럽</th>
                <th>승</th>
                <th>패</th>
                <th>득점</th>
                <th>득실차</th>
                <th>휴식</th>
              </tr>
            </thead>
            <tbody>
              {savedEvent.ranking.map((player) => (
                <tr key={player.participantId}>
                  <td>{player.rank}등</td>
                  <td className="font-semibold">{player.name}</td>
                  <td>{player.gender === "male" ? "남성" : player.gender === "female" ? "여성" : "미정"}</td>
                  <td>{typeof player.guestNtrp === "number" ? player.guestNtrp.toFixed(1) : "-"}</td>
                  <td>{player.joinedAsClubName ?? "-"}</td>
                  <td>{player.stats.wins}</td>
                  <td>{player.stats.losses}</td>
                  <td>{player.stats.pointsScored}</td>
                  <td>{player.stats.pointDiff}</td>
                  <td>{player.stats.rests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
