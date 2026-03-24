"use client";

import { getCurrentProfile } from "@/lib/auth";
import { loadMatchHistory, loadPairHistory, loadUserEventHistory } from "@/lib/history";
import { softDeleteUserProfile, updateUserMemo, getProfileById } from "@/lib/users";
import { MatchHistoryRecord, PairHistoryRecord, UserEventHistory, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = typeof params.id === "string" ? params.id : "";
  const [viewer, setViewer] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memo, setMemo] = useState("");
  const [eventHistory, setEventHistory] = useState<UserEventHistory[]>([]);
  const [pairHistory, setPairHistory] = useState<PairHistoryRecord[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const currentViewer = await getCurrentProfile();
      setViewer(currentViewer);
      if (currentViewer?.isAdmin && userId) {
        const [nextProfile, events, pairs, matches] = await Promise.all([
          getProfileById(userId),
          loadUserEventHistory(userId),
          loadPairHistory(userId),
          loadMatchHistory(userId),
        ]);
        setProfile(nextProfile);
        setMemo(nextProfile?.memo ?? "");
        setEventHistory(events);
        setPairHistory(pairs);
        setMatchHistory(matches);
      }
      setLoading(false);
    };

    void load();
  }, [userId]);

  if (loading) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">회원 상세를 불러오는 중...</main>;
  }

  if (!viewer?.isAdmin || !profile) {
    return (
      <main className="poster-page max-w-6xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">회원 상세를 볼 수 없습니다.</h1>
          <Link href="/admin" className="poster-button mt-5">관리자 목록</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-7xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/admin" className="poster-button-secondary">관리자 목록</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">Member Detail</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">{profile.displayName}</h1>
        <div className="mt-4 text-sm text-ink/65">{profile.loginId} · {profile.email}</div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">관리 메모</h2>
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} className="poster-input mt-4 min-h-28 w-full" />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={async () => {
              const next = await updateUserMemo(profile.id, memo);
              if (next) {
                setProfile(next);
                setInfo("메모를 저장했습니다.");
              }
            }}
            className="poster-button"
          >
            메모 저장
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("회원을 삭제 처리하시겠습니까? 기록은 익명화된 채 유지됩니다.")) {
                return;
              }
              const next = await softDeleteUserProfile(profile.id);
              if (next) {
                setProfile(next);
                setInfo("회원 삭제 처리를 완료했습니다.");
              }
            }}
            className="poster-button-secondary"
          >
            회원 삭제 처리
          </button>
        </div>
        {info ? <div className="mt-4 text-sm text-accentStrong">{info}</div> : null}
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">이벤트 이력</h2>
        <div className="mt-4 space-y-3">
          {eventHistory.map((item) => (
            <div key={item.id} className="border-b border-line py-3 text-sm">
              {item.eventName} · {item.rank}등 · 승 {item.stats.wins} / 패 {item.stats.losses} / 경기 {item.stats.games}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">페어 이력</h2>
        <div className="mt-4 space-y-3">
          {pairHistory.map((item) => (
            <div key={item.id} className="border-b border-line py-3 text-sm">
              {item.pairedName} · {item.frequency}회
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">매치 이력</h2>
        <div className="mt-4 space-y-3">
          {matchHistory.map((item) => (
            <div key={item.id} className="border-b border-line py-3 text-sm">
              {item.eventName} · Round {item.roundNumber} · Court {item.courtNumber} · {item.result} · {item.scoreFor}:{item.scoreAgainst}
              {item.teammates.length > 0 ? ` · 팀 ${item.teammates.join(", ")}` : ""}
              {item.opponents.length > 0 ? ` · 상대 ${item.opponents.join(", ")}` : ""}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
