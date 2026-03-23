"use client";

import { findEventByCodeOrName, joinEvent } from "@/lib/events";
import { saveLastEvent, saveLastParticipant } from "@/lib/storage";
import { ParticipantGender, SkillLevel } from "@/lib/types";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function GuestPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<ParticipantGender | "">("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("medium");
  const [eventQuery, setEventQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const eventId = searchParams.get("eventId");
    if (eventId) {
      setEventQuery(eventId);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!displayName.trim() || !eventQuery.trim() || !gender) {
      setError("이름, 성별, 이벤트 코드 또는 이벤트 이름을 입력해 주세요.");
      return;
    }

    const targetEvent = await findEventByCodeOrName(eventQuery);
    if (!targetEvent) {
      setError("이벤트를 찾을 수 없습니다.");
      return;
    }

    const participant = await joinEvent(targetEvent.id, { displayName, gender, skillLevel });
    if (!participant) {
      setError("이벤트 참여에 실패했습니다. 중복 이름인지 확인해 주세요.");
      return;
    }

    saveLastEvent(targetEvent.id);
    saveLastParticipant(participant.id);
    router.push(`/guest/event/${targetEvent.id}`);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-4xl font-black">게스트 참여</h1>
        <p className="mt-3 text-sm text-ink/70">
          이벤트 코드 또는 이벤트 이름으로 참여한 뒤 현재 라운드, 코트, 알림을 확인합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
        <label className="grid gap-2 text-sm font-semibold">
          표시 이름
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            placeholder="이름 입력"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          성별
          <select
            value={gender}
            onChange={(event) => setGender(event.target.value as ParticipantGender)}
            className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          >
            <option value="">선택</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          이벤트 코드 또는 이벤트 이름
          <input
            value={eventQuery}
            onChange={(event) => setEventQuery(event.target.value)}
            className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            placeholder="예: ABC123"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          실력
          <select
            value={skillLevel}
            onChange={(event) => setSkillLevel(event.target.value as SkillLevel)}
            className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          >
            <option value="high">상</option>
            <option value="medium">중</option>
            <option value="low">하</option>
          </select>
        </label>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="inline-flex w-fit rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white"
        >
          이벤트 참여
        </button>
      </form>
    </main>
  );
}
