"use client";

import { getCurrentProfile } from "@/lib/auth";
import { findEventByCodeOrName, joinEvent } from "@/lib/events";
import { saveLastEvent, saveLastParticipant } from "@/lib/storage";
import { ParticipantGender, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const NTRP_OPTIONS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export default function GuestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<ParticipantGender | "">("");
  const [guestNtrp, setGuestNtrp] = useState(3.5);
  const [eventQuery, setEventQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const sync = async () => {
      const currentProfile = await getCurrentProfile();
      setProfile(currentProfile);
      setDisplayName(currentProfile?.displayName ?? "");
      setCheckingAuth(false);
    };

    void sync();

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const eventId = searchParams.get("eventId");
      if (eventId) {
        setEventQuery(eventId);
      }
    } catch (error) {
      console.error("[guest-join] failed to read search params", error);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!profile) {
        setError("먼저 로그인해 주세요.");
        return;
      }

      if (!displayName.trim() || !eventQuery.trim() || !gender) {
        setError("이름, 성별, 이벤트 코드 또는 이벤트 이름을 입력해 주세요.");
        return;
      }

      const targetEvent = await findEventByCodeOrName(eventQuery);
      if (!targetEvent?.id) {
        setError("이벤트를 찾을 수 없습니다.");
        return;
      }

      const participant = await joinEvent(targetEvent.id, {
        displayName,
        gender,
        guestNtrp,
        userId: profile.id,
      });
      if (!participant?.id) {
        setError("이벤트 참여에 실패했습니다. 중복 이름인지 확인해 주세요.");
        return;
      }

      saveLastEvent(targetEvent.id);
      saveLastParticipant(participant.id);
      router.push(`/guest/event/${targetEvent.id}`);
    } catch (submitError) {
      console.error("[guest-join] submit failed", submitError);
      setError(submitError instanceof Error ? submitError.message : "게스트 참여 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAuth) {
    return <main className="poster-page max-w-4xl text-sm text-ink/70">플레이어 계정을 확인하는 중...</main>;
  }

  if (!profile) {
    return (
      <main className="poster-page max-w-4xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">플레이어는 로그인 후 참여할 수 있습니다.</h1>
          <div className="mt-5 flex gap-3">
            <Link href="/" className="poster-button">로그인하러 가기</Link>
            <Link href="/history/player" className="poster-button-secondary">내 기록</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-4xl">
      <div className="border-t border-line py-8">
        <p className="poster-label">Player Entry</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">플레이어 참여</h1>
        <p className="mt-4 text-sm leading-6 text-ink/68">
          로그인 계정으로 이벤트에 참여하고 현재 라운드, 코트, 알림, 종료 후 내 기록을 확인합니다.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 border-t border-line py-4">
        <Link href="/" className="poster-button-secondary">역할 선택</Link>
        <Link href="/history/player" className="poster-button-secondary">내 기록</Link>
        <Link href="/history/host" className="poster-button-secondary">호스트 이력</Link>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 border-t border-line py-8">
        <label className="grid gap-2 text-sm font-semibold">
          표시 이름
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="poster-input" placeholder="이름 입력" />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          성별
          <select value={gender} onChange={(event) => setGender(event.target.value as ParticipantGender)} className="poster-input">
            <option value="">선택</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          이벤트 코드 또는 이벤트 이름
          <input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} className="poster-input" placeholder="예: ABC123" />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          NTRP
          <select value={guestNtrp} onChange={(event) => setGuestNtrp(Number(event.target.value))} className="poster-input">
            {NTRP_OPTIONS.map((option) => (
              <option key={option} value={option}>{option.toFixed(1)}</option>
            ))}
          </select>
        </label>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <button type="submit" disabled={submitting} className="poster-button w-fit disabled:opacity-60">
          {submitting ? "참여 중..." : "이벤트 참여"}
        </button>
      </form>
    </main>
  );
}
