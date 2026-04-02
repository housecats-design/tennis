"use client";

import { getCurrentProfile } from "@/lib/auth";
import { canCreateClubEvent, getClubById, listMyClubMemberships } from "@/lib/clubs";
import { cancelEvent, createEvent, discardEvent, findLatestHostEvent, markEventSaved } from "@/lib/events";
import { saveCompletedEventRecord } from "@/lib/history";
import { saveLastEvent, saveLastParticipant } from "@/lib/storage";
import { EventRecord, EventType, RoundViewMode, UserProfile } from "@/lib/types";
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
  const [eventType, setEventType] = useState<EventType>("personal");
  const [clubId, setClubId] = useState("");
  const [matchType, setMatchType] = useState<"singles" | "doubles">("doubles");
  const [courtCount, setCourtCount] = useState(2);
  const [roundCount, setRoundCount] = useState(4);
  const [roundViewMode, setRoundViewMode] = useState<RoundViewMode>("full");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Array<{ id: string; name: string }>>([]);
  const [blockingEvent, setBlockingEvent] = useState<EventRecord | null>(null);
  const [blockingMode, setBlockingMode] = useState<"in_progress" | "completed_unsaved" | null>(null);
  const [pendingCreatePayload, setPendingCreatePayload] = useState<{
    eventName: string;
    hostName: string;
    matchType: "singles" | "doubles";
    eventType: EventType;
    clubId: string | null;
    courtCount: number;
    roundCount: number;
    roundViewMode: RoundViewMode;
    hostUserId: string;
  } | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  useEffect(() => {
    const sync = async () => {
      const nextProfile = await getCurrentProfile();
      setProfile(nextProfile);
      setHostName(nextProfile?.displayName ?? "");
      if (nextProfile?.id) {
        const memberships = await listMyClubMemberships(nextProfile.id);
        const operatorMemberships = memberships.filter(
          (membership) => membership.membershipStatus === "approved" && canCreateClubEvent(membership.role),
        );
        const clubs = await Promise.all(
          operatorMemberships.map(async (membership) => {
            const club = await getClubById(membership.clubId);
            return club ? { id: club.id, name: club.clubName } : null;
          }),
        );
        setAvailableClubs(clubs.filter(Boolean) as Array<{ id: string; name: string }>);
      }
      setCheckingAuth(false);
    };

    void sync();
  }, [router]);

  useEffect(() => {
    if (checkingAuth || prefillApplied) {
      return;
    }

    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const requestedEventType = params?.get("eventType");
    const requestedClubId = params?.get("clubId");

    if (requestedEventType === "club") {
      setEventType("club");
      if (requestedClubId && availableClubs.some((club) => club.id === requestedClubId)) {
        setClubId(requestedClubId);
      }
    }

    setPrefillApplied(true);
  }, [availableClubs, checkingAuth, prefillApplied]);

  async function createNextEvent(input: NonNullable<typeof pendingCreatePayload>): Promise<void> {
    const { event: nextEvent, hostParticipant } = await createEvent({
      eventName: input.eventName,
      hostName: input.hostName,
      matchType: input.matchType,
      eventType: input.eventType,
      clubId: input.clubId,
      courtCount: input.courtCount,
      roundCount: input.roundCount,
      roundViewMode: input.roundViewMode,
      hostUserId: input.hostUserId,
      hostGender: profile?.gender ?? "unspecified",
    });

    saveLastEvent(nextEvent.id);
    saveLastParticipant(hostParticipant.id);
    router.push(`/host/event/${nextEvent.id}`);
  }

  function closeBlockingPrompt(): void {
    setBlockingEvent(null);
    setBlockingMode(null);
    setPendingCreatePayload(null);
    setSubmitting(false);
  }

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

    if (eventType === "club" && !clubId) {
      setError("클럽 이벤트는 클럽을 선택해야 합니다.");
      return;
    }

    setSubmitting(true);

    try {
      console.info("[host-create] creating event", {
        eventName: eventName.trim(),
        hostUserId: profile.id,
        eventType,
        clubId: eventType === "club" ? clubId : null,
        matchType,
        courtCount,
        roundCount,
        roundViewMode,
      });

      const createPayload = {
        eventName,
        hostName,
        matchType,
        eventType,
        clubId: eventType === "club" ? clubId : null,
        courtCount,
        roundCount,
        roundViewMode,
        hostUserId: profile.id,
      } as const;

      const existingEvent = await findLatestHostEvent(profile.id);
      if (existingEvent) {
        if (existingEvent.status === "draft" || existingEvent.status === "recruiting") {
          await discardEvent(existingEvent.id);
        } else if (existingEvent.status === "in_progress") {
          setBlockingEvent(existingEvent);
          setBlockingMode("in_progress");
          setPendingCreatePayload(createPayload);
          return;
        } else if (existingEvent.status === "completed_unsaved") {
          setBlockingEvent(existingEvent);
          setBlockingMode("completed_unsaved");
          setPendingCreatePayload(createPayload);
          return;
        }
      }

      await createNextEvent(createPayload);
    } catch (submitError) {
      console.error("[host-create] failed", submitError);
      setError(submitError instanceof Error ? submitError.message : "이벤트 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReturnToExistingEvent(): Promise<void> {
    if (!blockingEvent) {
      return;
    }

    saveLastEvent(blockingEvent.id);
    const hostParticipant = blockingEvent.participants.find((participant) => participant.role === "host");
    if (hostParticipant) {
      saveLastParticipant(hostParticipant.id);
    }
    router.push(`/host/event/${blockingEvent.id}`);
  }

  async function handleCancelAndCreateNext(): Promise<void> {
    if (!blockingEvent || !pendingCreatePayload) {
      return;
    }

    setSubmitting(true);
    try {
      await cancelEvent(blockingEvent.id);
      await createNextEvent(pendingCreatePayload);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "이벤트 처리에 실패했습니다.");
      setSubmitting(false);
    }
  }

  async function handleSaveCompletedAndContinue(): Promise<void> {
    if (!blockingEvent || !pendingCreatePayload || !profile) {
      return;
    }

    setSubmitting(true);
    try {
      const saved = await saveCompletedEventRecord(blockingEvent);
      await markEventSaved(blockingEvent.id, {
        isSaved: true,
        savedAt: saved.savedAt,
        savedByUserId: profile.id,
      });
      await createNextEvent(pendingCreatePayload);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "이벤트 저장에 실패했습니다.");
      setSubmitting(false);
    }
  }

  async function handleDiscardCompletedAndContinue(): Promise<void> {
    if (!blockingEvent || !pendingCreatePayload) {
      return;
    }

    setSubmitting(true);
    try {
      await discardEvent(blockingEvent.id);
      await createNextEvent(pendingCreatePayload);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "이벤트 삭제에 실패했습니다.");
      setSubmitting(false);
    }
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
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
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
            이벤트 유형
            <select
              value={eventType}
              onChange={(event) => {
                const nextType = event.target.value as EventType;
                setEventType(nextType);
                if (nextType === "personal") {
                  setClubId("");
                }
              }}
              className="poster-input"
            >
              <option value="personal">개인 이벤트</option>
              <option value="club">클럽 이벤트</option>
            </select>
          </label>

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

        {eventType === "club" ? (
          <label className="grid gap-2 text-sm font-semibold sm:max-w-md">
            클럽 선택
            <select value={clubId} onChange={(event) => setClubId(event.target.value)} className="poster-input">
              <option value="">운영할 클럽 선택</option>
              {availableClubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink/55">리더 또는 부리더 권한이 있는 클럽만 선택할 수 있습니다.</span>
          </label>
        ) : null}

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <button type="submit" disabled={submitting} className="poster-button w-fit disabled:opacity-60">
          {submitting ? "생성 중..." : "이벤트 만들기"}
        </button>
      </form>

      {blockingEvent && blockingMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4">
          <div className="w-full max-w-xl border border-line bg-white p-6">
            <div className="text-2xl font-black">
              {blockingMode === "in_progress" ? "진행중인 이벤트가 있습니다" : "저장되지 않은 종료 이벤트가 있습니다"}
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/72">
              {blockingMode === "in_progress"
                ? "기존 이벤트를 아직 마무리하지 않았습니다. 기존 이벤트로 돌아가시겠습니까, 아니면 마무리 후 새 이벤트를 생성하시겠습니까?"
                : "이전에 종료된 이벤트가 아직 저장되지 않았습니다. 저장하시겠습니까?"}
            </p>
            <div className="mt-2 text-xs text-ink/55">
              현재 이벤트: {blockingEvent.eventName}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {blockingMode === "in_progress" ? (
                <>
                  <button type="button" onClick={() => void handleReturnToExistingEvent()} className="poster-button-secondary">
                    기존 이벤트로 돌아가기
                  </button>
                  <button type="button" onClick={() => void handleCancelAndCreateNext()} disabled={submitting} className="poster-button disabled:opacity-60">
                    {submitting ? "처리 중..." : "마무리 후 새 이벤트 생성"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void handleSaveCompletedAndContinue()} disabled={submitting} className="poster-button disabled:opacity-60">
                    {submitting ? "처리 중..." : "저장"}
                  </button>
                  <button type="button" onClick={() => void handleDiscardCompletedAndContinue()} disabled={submitting} className="poster-button-secondary disabled:opacity-60">
                    저장 안 함
                  </button>
                </>
              )}
              <button type="button" onClick={closeBlockingPrompt} disabled={submitting} className="poster-button-secondary disabled:opacity-60">
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
