"use client";

import { getCurrentProfile } from "@/lib/auth";
import { loadPlayerSavedEvents, loadUserEventHistory } from "@/lib/history";
import { SavedEventSummary, UserEventHistory, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function PlayerHistoryPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<SavedEventSummary[]>([]);
  const [histories, setHistories] = useState<UserEventHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const currentProfile = await getCurrentProfile();
      setProfile(currentProfile);
      if (currentProfile) {
        const [savedEvents, userHistory] = await Promise.all([
          loadPlayerSavedEvents(currentProfile.id),
          loadUserEventHistory(currentProfile.id),
        ]);
        setEvents(savedEvents);
        setHistories(userHistory);
      }
      setLoading(false);
    };

    void load();
  }, []);

  if (loading) {
    return <main className="poster-page max-w-5xl text-sm text-ink/70">내 기록을 불러오는 중...</main>;
  }

  if (!profile) {
    return (
      <main className="poster-page max-w-5xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">내 기록을 보려면 로그인해 주세요.</h1>
          <Link href="/" className="poster-button mt-5">로그인</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="border-t border-line py-8">
        <p className="poster-label">Player History</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">내 기록</h1>
      </div>

      <div className="space-y-4 border-t border-line py-6">
        {events.length > 0 ? events.map((event) => {
          const current = histories.find((item) => item.savedEventId === event.id);
          return (
            <article key={event.id} className="border-b border-line py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-black">{event.eventName}</div>
                  <div className="mt-2 text-sm text-ink/65">{new Date(event.savedAt).toLocaleString("ko-KR")}</div>
                  <div className="mt-2 text-sm text-ink/60">
                    {current?.joinedAsClubName
                      ? `참가 클럽 · ${current.joinedAsClubName}`
                      : event.eventType === "club"
                        ? `클럽 이벤트${event.clubName ? ` · ${event.clubName}` : ""}`
                        : "개인 이벤트"}
                  </div>
                  <div className="mt-2 text-sm text-ink/68">
                    {current ? `승 ${current.stats.wins} / 패 ${current.stats.losses} / 득점 ${current.stats.pointsScored} / 휴식 ${current.stats.rests} / 순위 ${current.rank}등` : "개인 기록 없음"}
                  </div>
                </div>
                <Link href={`/history/event/${event.id}`} className="poster-button-secondary">상세 보기</Link>
              </div>
            </article>
          );
        }) : (
          <div className="py-6 text-sm text-ink/70">저장된 개인 기록이 없습니다.</div>
        )}
      </div>
    </main>
  );
}
