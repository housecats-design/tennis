"use client";

import { getHostIdentity, signInHost, signOutHost, subscribeAuthChanges } from "@/lib/auth";
import { createEvent } from "@/lib/events";
import { isSupabaseEnabled } from "@/lib/supabase";
import { saveLastEvent, saveLastParticipant } from "@/lib/storage";
import { RoundViewMode } from "@/lib/types";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const COURT_OPTIONS = [1, 2, 3, 4, 5, 6];
const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function HostPage() {
  const router = useRouter();
  const [hostIdentity, setHostIdentity] = useState<{ id: string; email?: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [eventName, setEventName] = useState("");
  const [hostName, setHostName] = useState("");
  const [matchType, setMatchType] = useState<"singles" | "doubles">("doubles");
  const [courtCount, setCourtCount] = useState(2);
  const [roundCount, setRoundCount] = useState(4);
  const [roundViewMode, setRoundViewMode] = useState<RoundViewMode>("progressive");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      return;
    }

    const syncAuth = async () => {
      setHostIdentity(await getHostIdentity());
    };

    void syncAuth();
    const unsubscribe = subscribeAuthChanges(() => {
      void syncAuth();
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);

    try {
      await signInHost(email);
      setInfo("매직 링크를 전송했습니다. 메일에서 로그인 후 이 페이지로 돌아오세요.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인 메일 전송에 실패했습니다.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (isSupabaseEnabled() && !hostIdentity) {
      setError("호스트는 먼저 Supabase Auth로 로그인해야 합니다.");
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
      hostUserId: hostIdentity?.id,
    });

    saveLastEvent(nextEvent.id);
    saveLastParticipant(hostParticipant.id);
    router.push(`/host/event/${nextEvent.id}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-4xl font-black">호스트 이벤트 생성</h1>
        <p className="mt-3 text-sm text-ink/70">
          이벤트 이름, 경기 방식, 라운드 공개 방식을 설정한 뒤 참가자를 모아 경기표를 생성합니다.
        </p>
      </div>

      {isSupabaseEnabled() && !hostIdentity ? (
        <form onSubmit={handleLogin} className="mb-6 grid gap-4 rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
          <h2 className="text-2xl font-black">호스트 로그인</h2>
          <p className="text-sm text-ink/70">
            Supabase Auth 매직 링크로 로그인한 뒤 호스트 이벤트를 생성합니다.
          </p>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="host@example.com"
            className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {info ? <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink/75">{info}</div> : null}
          <button type="submit" className="inline-flex w-fit rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white">
            로그인 메일 보내기
          </button>
        </form>
      ) : null}

      {isSupabaseEnabled() && hostIdentity ? (
        <div className="mb-6 flex items-center justify-between rounded-3xl border border-line bg-white/90 p-4 shadow-panel">
          <div className="text-sm text-ink/70">로그인됨: {hostIdentity.email ?? hostIdentity.id}</div>
          <button type="button" onClick={() => void signOutHost()} className="rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold">
            로그아웃
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-6 rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            이벤트 이름
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              placeholder="예: 토요일 테니스 모임"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            호스트 이름
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
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
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            >
              <option value="singles">단식</option>
              <option value="doubles">복식</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            코트 수
            <select
              value={courtCount}
              onChange={(event) => setCourtCount(Number(event.target.value))}
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            >
              {COURT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}개
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            라운드 수
            <select
              value={roundCount}
              onChange={(event) => setRoundCount(Number(event.target.value))}
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            >
              {ROUND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}라운드
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            라운드 보기
            <select
              value={roundViewMode}
              onChange={(event) => setRoundViewMode(event.target.value as RoundViewMode)}
              className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            >
              <option value="progressive">progressive</option>
              <option value="full">full</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="inline-flex w-fit rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white"
        >
          이벤트 만들기
        </button>
      </form>
    </main>
  );
}
