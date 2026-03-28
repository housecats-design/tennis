"use client";

import { getCurrentProfile } from "@/lib/auth";
import { loadMatchHistory, loadPairHistory, loadPlayerSavedEvents, loadUserEventHistory } from "@/lib/history";
import { adminUpdateUserGender, softDeleteUserProfile, updateUserMemo, getProfileById } from "@/lib/users";
import { MatchHistoryRecord, PairHistoryRecord, ParticipantGender, SavedEventSummary, UserEventHistory, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = typeof params.id === "string" ? params.id : "";
  const [viewer, setViewer] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memo, setMemo] = useState("");
  const [eventHistory, setEventHistory] = useState<UserEventHistory[]>([]);
  const [savedEvents, setSavedEvents] = useState<SavedEventSummary[]>([]);
  const [pairHistory, setPairHistory] = useState<PairHistoryRecord[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRecord[]>([]);
  const [gender, setGender] = useState<ParticipantGender | "unspecified">("unspecified");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const currentViewer = await getCurrentProfile();
      setViewer(currentViewer);
      if (!currentViewer) {
        router.replace("/");
        return;
      }

      if (!currentViewer.isAdmin) {
        router.replace("/");
        return;
      }

      if (userId) {
        const [nextProfile, events, pairs, matches, saved] = await Promise.all([
          getProfileById(userId),
          loadUserEventHistory(userId),
          loadPairHistory(userId),
          loadMatchHistory(userId),
          loadPlayerSavedEvents(userId),
        ]);
        setProfile(nextProfile);
        setMemo(nextProfile?.memo ?? "");
        setGender(nextProfile?.gender ?? "unspecified");
        setEventHistory(events);
        setPairHistory(pairs);
        setMatchHistory(matches);
        setSavedEvents(saved);
      }
      setLoading(false);
    };

    void load();
  }, [router, userId]);

  const totalStats = useMemo(() => {
    return eventHistory.reduce(
      (accumulator, item) => {
        accumulator.matches += item.stats.games;
        accumulator.wins += item.stats.wins;
        accumulator.losses += item.stats.losses;
        accumulator.pointsScored += item.stats.pointsScored;
        accumulator.pointsAllowed += item.stats.pointsAllowed;
        accumulator.rests += item.stats.rests;
        return accumulator;
      },
      {
        matches: 0,
        wins: 0,
        losses: 0,
        pointsScored: 0,
        pointsAllowed: 0,
        rests: 0,
      },
    );
  }, [eventHistory]);

  const latestRankingEntry = useMemo(() => {
    for (const event of savedEvents) {
      const found = event.ranking.find((item) => item.userId === userId);
      if (found) {
        return found;
      }
    }
    return null;
  }, [savedEvents, userId]);

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
        <div className="mt-4 grid gap-2 text-sm text-ink/68 sm:grid-cols-2">
          <div>성별: {profile.gender === "male" ? "남성" : profile.gender === "female" ? "여성" : profile.gender === "other" ? "기타" : "미정"}</div>
          <div>NTRP: {typeof latestRankingEntry?.guestNtrp === "number" ? latestRankingEntry.guestNtrp.toFixed(1) : "-"}</div>
          <div className="sm:col-span-2">
            삭제 상태: {profile.isDeleted ? `삭제됨${profile.deletedAt ? ` · ${new Date(profile.deletedAt).toLocaleString("ko-KR")}` : ""}` : "활성"}
          </div>
        </div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">관리 메모</h2>
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} className="poster-input mt-4 min-h-28 w-full" />
        <div className="mt-4 grid gap-2 text-sm font-semibold sm:max-w-xs">
          성별 수정
          <select value={gender} onChange={(event) => setGender(event.target.value as ParticipantGender)} className="poster-input">
            <option value="male">남성</option>
            <option value="female">여성</option>
            <option value="unspecified">미정</option>
          </select>
        </div>
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
              const next = await adminUpdateUserGender(viewer.id, profile.id, gender);
              if (next) {
                setProfile(next);
                setInfo("성별을 수정하고 감사 로그를 남겼습니다.");
              }
            }}
            className="poster-button-secondary"
          >
            성별 저장
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
        <h2 className="text-3xl font-black">누적 통계</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div>총 경기 {totalStats.matches}</div>
          <div>승 {totalStats.wins}</div>
          <div>패 {totalStats.losses}</div>
          <div>득점 {totalStats.pointsScored}</div>
          <div>실점 {totalStats.pointsAllowed}</div>
          <div>휴식 {totalStats.rests}</div>
          <div className="sm:col-span-3 lg:col-span-6">득실차 {totalStats.pointsScored - totalStats.pointsAllowed}</div>
        </div>
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-3xl font-black">이벤트 이력</h2>
        <div className="mt-4 space-y-3">
          {eventHistory.map((item) => {
            const savedEvent = savedEvents.find((event) => event.id === item.savedEventId);
            const role = savedEvent?.hostUserId === userId ? "호스트" : "플레이어";
            return (
              <div key={item.id} className="border-b border-line py-3 text-sm">
                {item.eventName} · {role} · {item.rank}등 · 승 {item.stats.wins} / 패 {item.stats.losses} / 경기 {item.stats.games}
              </div>
            );
          })}
          {eventHistory.length === 0 ? <div className="py-3 text-sm text-ink/70">이벤트 이력이 없습니다.</div> : null}
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
          {pairHistory.length === 0 ? <div className="py-3 text-sm text-ink/70">페어 이력이 없습니다.</div> : null}
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
          {matchHistory.length === 0 ? <div className="py-3 text-sm text-ink/70">매치 이력이 없습니다.</div> : null}
        </div>
      </section>
    </main>
  );
}
