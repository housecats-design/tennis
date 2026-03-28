"use client";

import { getCurrentProfile } from "@/lib/auth";
import { loadHostSavedEvents } from "@/lib/history";
import { SavedEventSummary, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function HostHistoryPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<SavedEventSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const currentProfile = await getCurrentProfile();
      setProfile(currentProfile);
      if (currentProfile) {
        setEvents(await loadHostSavedEvents(currentProfile.id));
      }
      setLoading(false);
    };

    void load();
  }, []);

  if (loading) {
    return <main className="poster-page max-w-5xl text-sm text-ink/70">호스트 이력을 불러오는 중...</main>;
  }

  if (!profile) {
    return (
      <main className="poster-page max-w-5xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">호스트 이력을 보려면 로그인해 주세요.</h1>
          <Link href="/" className="poster-button mt-5">로그인</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="border-t border-line py-8">
        <p className="poster-label">Host History</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">저장된 이벤트</h1>
      </div>

      <div className="space-y-4 border-t border-line py-6">
        {events.length > 0 ? events.map((event) => (
          <article key={event.id} className="border-b border-line py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xl font-black">{event.eventName}</div>
                <div className="mt-2 text-sm text-ink/65">
                  {new Date(event.savedAt).toLocaleString("ko-KR")} · {event.matchType === "singles" ? "단식" : "복식"} · 참가 {event.participantCount}명
                </div>
                <div className="mt-2 text-sm text-ink/60">
                  {event.eventType === "club" ? `클럽 이벤트${event.clubName ? ` · ${event.clubName}` : ""}` : "개인 이벤트"}
                </div>
                <div className="mt-2 text-sm text-ink/68">
                  TOP 3: {event.topThree.map((item) => `${item.rank}등 ${item.name}`).join(" / ")}
                </div>
              </div>
              <Link href={`/history/event/${event.id}`} className="poster-button-secondary">상세 보기</Link>
            </div>
          </article>
        )) : (
          <div className="py-6 text-sm text-ink/70">저장된 이벤트가 없습니다.</div>
        )}
      </div>
    </main>
  );
}
