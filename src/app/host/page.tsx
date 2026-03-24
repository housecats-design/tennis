"use client";

import { getCurrentProfile } from "@/lib/auth";
import { createEvent } from "@/lib/events";
import { saveLastEvent, saveLastParticipant } from "@/lib/storage";
import { RoundViewMode, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const COURT_OPTIONS = [1, 2, 3, 4, 5, 6];
const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function HostPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [eventName, setEventName] = useState("");
  const [hostName, setHostName] = useState("");
  const [matchType, setMatchType] = useState<"singles" | "doubles">("doubles");
  const [courtCount, setCourtCount] = useState(2);
  const [roundCount, setRoundCount] = useState(4);
  const [roundViewMode, setRoundViewMode] = useState<RoundViewMode>("full");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = async () => {
      const nextProfile = await getCurrentProfile();
      setProfile(nextProfile);
      setHostName(nextProfile?.displayName ?? "");
      setCheckingAuth(false);
    };

    void sync();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!profile) {
      setError("먼저 로그인해 주세요.");
      return;
    }

    if (!eventName.trim() || !hostName.trim()) {
      setError("이벤트 이름과 호스트 이름을 입력해 주세요.");
      return;
    }

    const { event: nextEvent, hostParticipant } = await createEvent({
      eventName,
      hostName,
      matchType,
      courtCount,
      roundCount,
      roundViewMode,
      hostUserId: profile.id,
    });

    saveLastEvent(nextEvent.id);
    saveLastParticipant(hostParticipant.id);
    router.push(`/host/event/${nextEvent.id}`);
  }

  if (checkingAuth) {
    return <main className="poster-page max-w-4xl text-sm text-ink/70">호스트 정보를 확인하는 중...</main>;
  }

  if (!profile) {
    return (
      <main className="poster-page max-w-4xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">호스트는 로그인 후 이용할 수 있습니다.</h1>
          <div className="mt-5 flex gap-3">
            <Link href="/" className="poster-button">
              로그인하러 가기
            </Link>
            <Link href="/history/host" className="poster-button-secondary">
              호스트 이력
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-5xl">
      <div className="border-t border-line py-8">
        <p className="poster-label">Host Flow</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">호스트 이벤트 생성</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/68">
          로그인 계정으로 이벤트를 만들고, 종료 후 저장 여부를 선택해 이력으로 남길 수 있습니다.
        </p>
        <div className="mt-4 text-sm text-ink/60">계정: {profile.displayName} · {profile.email}</div>
      </div>

      <div className="mb-8 flex flex-wrap gap-3 border-t border-line py-4">
        <Link href="/" className="poster-button-secondary">역할 선택</Link>
        <Link href="/history/host" className="poster-button-secondary">호스트 이력</Link>
        <Link href="/history/player" className="poster-button-secondary">내 기록</Link>
        {profile.isAdmin ? <Link href="/admin" className="poster-button-secondary">관리자</Link> : null}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-8 border-t border-line py-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            이벤트 이름
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              className="poster-input"
              placeholder="예: 토요일 테니스 모임"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            호스트 이름
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              className="poster-input"
              placeholder="호스트 이름"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-2 text-sm font-semibold">
            경기 유형
            <select
              value={matchType}
              onChange={(event) => setMatchType(event.target.value as "singles" | "doubles")}
              className="poster-input"
            >
              <option value="singles">단식</option>
              <option value="doubles">복식</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            코트 수
            <select value={courtCount} onChange={(event) => setCourtCount(Number(event.target.value))} className="poster-input">
              {COURT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}개</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            라운드 수
            <select value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))} className="poster-input">
              {ROUND_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}라운드</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            라운드 보기
            <select value={roundViewMode} onChange={(event) => setRoundViewMode(event.target.value as RoundViewMode)} className="poster-input">
              <option value="progressive">progressive</option>
              <option value="full">full</option>
            </select>
          </label>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <button type="submit" className="poster-button w-fit">이벤트 만들기</button>
      </form>
    </main>
  );
}
