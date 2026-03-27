"use client";

import { QRCodeSVG } from "qrcode.react";
import { getCurrentProfile } from "@/lib/auth";
import {
  addFutureRound,
  canEditParticipants,
  deleteFutureRound,
  finalizeRound,
  forceCloseRound,
  generateEventSchedule,
  getJoinUrl,
  getRoundInstructions,
  loadEvent,
  markEventSaved,
  reassignRound,
  reassignSingleMatch,
  respondToScoreProposal,
  saveParticipants,
  skipMatch,
  subscribeToEvent,
  updateMatchScores,
} from "@/lib/events";
import { buildFinalRanking, saveCompletedEventRecord } from "@/lib/history";
import { sortLeaderboard } from "@/lib/leaderboard";
import { ensureUniqueDisplayNames, resolveParticipantSkill } from "@/lib/participants";
import { loadLastRole } from "@/lib/storage";
import { listProfiles } from "@/lib/users";
import { Participant, PlayerStats, SkillLevel, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const SCORE_OPTIONS = ["", "0", "1", "2", "3", "4", "5", "6"];

function parseScoreValue(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isTieBreak(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  return (scoreA === 6 && scoreB === 5) || (scoreA === 5 && scoreB === 6);
}

function getRoundAccentClass(roundNumber: number): string {
  const accents = ["round-poster-1", "round-poster-2", "round-poster-3", "round-poster-4"];
  return accents[(roundNumber - 1) % accents.length];
}

export default function HostEventPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = typeof params.id === "string" ? params.id : "";
  const [event, setEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<Participant["gender"]>("male");
  const [newPlayerSkill, setNewPlayerSkill] = useState<SkillLevel>("medium");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [saveInfo, setSaveInfo] = useState<string | null>(null);
  const [roundActionInfo, setRoundActionInfo] = useState<string | null>(null);
  const [roundActionPending, setRoundActionPending] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setError("유효하지 않은 이벤트 주소입니다.");
      setLoading(false);
      return;
    }

    const loadEventOnly = async () => {
      try {
        const nextEvent = await loadEvent(eventId);
        setEvent(nextEvent);
        setError(null);
      } catch (error) {
        console.error("[host-event] event refresh failed", error);
        setError(error instanceof Error ? error.message : "이벤트를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    const bootstrap = async () => {
      try {
        const [nextProfile, nextMembers, nextEvent] = await Promise.all([
          getCurrentProfile(),
          listProfiles(),
          loadEvent(eventId),
        ]);
        const lastRole = loadLastRole();
        if (!nextProfile || lastRole === "player" || (nextEvent && nextEvent.hostUserId !== nextProfile.id)) {
          router.replace(nextEvent ? `/guest/event/${nextEvent.id}` : "/");
          return;
        }
        setProfile(nextProfile);
        setMembers(nextMembers);
        setEvent(nextEvent);
        setError(null);
      } catch (error) {
        console.error("[host-event] bootstrap failed", error);
        setError(error instanceof Error ? error.message : "이벤트를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
    const interval = window.setInterval(loadEventOnly, 3000);
    const unsubscribe = subscribeToEvent(eventId, loadEventOnly);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [eventId, router]);

  const participantsEditable = event ? canEditParticipants(event) : false;
  const joinUrl = useMemo(() => (event ? getJoinUrl(event.id) : ""), [event]);
  const instructions = useMemo(() => (event ? getRoundInstructions(event) : []), [event]);
  const disputeNotifications = useMemo(
    () => (event?.notifications ?? []).filter((notification) => notification.message.includes("이의신청")),
    [event],
  );
  const sortedParticipants = useMemo(() => {
    if (!event) {
      return [];
    }

    return sortLeaderboard(
      (Array.isArray(event.participants) ? event.participants : []).map((participant) => ({ id: participant.id, name: participant.displayName })),
      event.stats,
      "asc",
    );
  }, [event]);
  const scheduledSummary = useMemo(() => {
    if (!event) {
      return {};
    }

    return event.rounds.reduce<Record<string, { scheduledGames: number; scheduledRests: number }>>((summary, round) => {
      for (const player of round.restPlayers) {
        summary[player.id] = summary[player.id] ?? { scheduledGames: 0, scheduledRests: 0 };
        summary[player.id].scheduledRests += 1;
      }

      for (const match of round.matches) {
        for (const player of [...match.teamA, ...match.teamB]) {
          summary[player.id] = summary[player.id] ?? { scheduledGames: 0, scheduledRests: 0 };
          summary[player.id].scheduledGames += 1;
        }
      }

      return summary;
    }, {});
  }, [event]);
  const maxScheduledGames = useMemo(
    () => Math.max(0, ...Object.values(scheduledSummary).map((item) => item.scheduledGames)),
    [scheduledSummary],
  );
  const availableMembers = useMemo(() => {
    const existingUserIds = new Set((event?.participants ?? []).map((participant) => participant.userId).filter(Boolean));
    return members.filter((member) => !member.isDeleted && member.id !== profile?.id && !existingUserIds.has(member.id));
  }, [event?.participants, members, profile?.id]);
  const finalRanking = useMemo(() => (event?.status === "completed" ? buildFinalRanking(event) : []), [event]);
  const hostParticipantId = useMemo(
    () => event?.participants.find((participant) => participant.role === "host")?.id ?? null,
    [event],
  );

  async function refreshEvent(): Promise<void> {
    if (!eventId) {
      return;
    }

    setLoading(true);
    try {
      setEvent(await loadEvent(eventId));
    } finally {
      setLoading(false);
    }
  }

  async function handleParticipantChange(
    participantId: string,
    field: "displayName" | "gender" | "hostSkillOverride",
    value: string,
  ): Promise<void> {
    if (!event) {
      return;
    }

    const nextParticipants = event.participants.map((participant) =>
      participant.id === participantId
        ? {
            ...participant,
            [field]: field === "hostSkillOverride" && !value ? null : value,
            skillLevel: resolveParticipantSkill({
              guestNtrp: participant.guestNtrp ?? null,
              hostSkillOverride: field === "hostSkillOverride" ? (value ? (value as SkillLevel) : null) : participant.hostSkillOverride ?? null,
            }),
          }
        : participant,
    );
    const nextEvent = await saveParticipants(event.id, nextParticipants);
    setEvent(nextEvent);
  }

  async function handleRemoveParticipant(participantId: string): Promise<void> {
    if (!event) {
      return;
    }

    const nextParticipants = event.participants.filter((participant) => participant.id !== participantId);
    const nextEvent = await saveParticipants(event.id, nextParticipants);
    setEvent(nextEvent);
  }

  async function handleAddParticipant(): Promise<void> {
    if (!event || !newPlayerName.trim()) {
      return;
    }

    const nextParticipants: Participant[] = [
      ...event.participants,
      {
        id: `participant_${crypto.randomUUID().slice(0, 8)}`,
        eventId: event.id,
        displayName: newPlayerName.trim(),
        gender: newPlayerGender,
        guestNtrp: null,
        hostSkillOverride: newPlayerSkill,
        skillLevel: newPlayerSkill,
        role: "guest",
        source: "manual",
        sessionId: null,
        userId: null,
      },
    ];

    const nextEvent = await saveParticipants(event.id, nextParticipants);
    setEvent(nextEvent);
    setNewPlayerName("");
    setNewPlayerGender("male");
    setNewPlayerSkill("medium");
  }

  async function handleAddMemberParticipant(): Promise<void> {
    if (!event || !selectedMemberId) {
      return;
    }

    const member = availableMembers.find((item) => item.id === selectedMemberId);
    if (!member) {
      return;
    }

    const nextParticipants: Participant[] = [
      ...event.participants,
      {
        id: `participant_${crypto.randomUUID().slice(0, 8)}`,
        eventId: event.id,
        userId: member.id,
        sessionId: null,
        displayName: member.displayName,
        gender: "unspecified",
        guestNtrp: null,
        hostSkillOverride: null,
        skillLevel: resolveParticipantSkill({ guestNtrp: null, hostSkillOverride: null }),
        role: "guest",
        source: "member",
        isActive: true,
        joinedAt: new Date().toISOString(),
      },
    ];

    const nextEvent = await saveParticipants(event.id, nextParticipants);
    setEvent(nextEvent);
    setSelectedMemberId("");
  }

  async function handleGenerateSchedule(): Promise<void> {
    if (!event) {
      return;
    }

    const hasEmptyName = event.participants.some((participant) => !participant.displayName.trim());
    if (hasEmptyName) {
      setError("참가자 이름은 비어 있을 수 없습니다.");
      return;
    }

    if (!ensureUniqueDisplayNames(event.participants)) {
      setError("참가자 이름은 중복될 수 없습니다.");
      return;
    }

    try {
      const nextEvent = await generateEventSchedule(event.id);
      setError(null);
      setEvent(nextEvent);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "대진 생성에 실패했습니다.");
    }
  }

  async function handleScoreChange(roundNumber: number, matchId: string, key: "scoreA" | "scoreB", value: string): Promise<void> {
    if (!event) {
      return;
    }

    const targetRound = event.rounds.find((round) => round.roundNumber === roundNumber);
    const match = targetRound?.matches.find((currentMatch) => currentMatch.id === matchId);
    if (!match) {
      return;
    }

    const nextEvent = await updateMatchScores(event.id, roundNumber, matchId, {
      scoreA: key === "scoreA" ? parseScoreValue(value) : match.scoreA ?? null,
      scoreB: key === "scoreB" ? parseScoreValue(value) : match.scoreB ?? null,
    });
    setEvent(nextEvent);
  }

  async function handleFinalizeRound(roundNumber: number): Promise<void> {
    if (!event) {
      return;
    }

    try {
      const nextEvent = await finalizeRound(event.id, roundNumber);
      setError(null);
      setEvent(nextEvent);
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : "라운드 완료에 실패했습니다.");
    }
  }

  async function handleSkipMatch(roundNumber: number, matchId: string): Promise<void> {
    if (!event) {
      return;
    }

    const nextEvent = await skipMatch(event.id, roundNumber, matchId);
    setEvent(nextEvent);
  }

  async function handleReassignRound(roundNumber: number): Promise<void> {
    if (!event) {
      return;
    }

    const nextEvent = await reassignRound(event.id, roundNumber);
    setEvent(nextEvent);
  }

  async function handleAddRound(): Promise<void> {
    if (!event) {
      return;
    }

    setRoundActionPending("add");
    setRoundActionInfo("라운드를 추가하는 중...");
    try {
      const nextEvent = await addFutureRound(event.id);
      setEvent(nextEvent);
      setRoundActionInfo("라운드가 추가되었습니다.");
    } catch (roundError) {
      setError(roundError instanceof Error ? roundError.message : "라운드 추가에 실패했습니다.");
    } finally {
      setRoundActionPending(null);
    }
  }

  async function handleDeleteRound(roundNumber: number): Promise<void> {
    if (!event) {
      return;
    }

    setRoundActionPending(`delete-${roundNumber}`);
    setRoundActionInfo("라운드를 삭제하는 중...");
    try {
      const nextEvent = await deleteFutureRound(event.id, roundNumber);
      setEvent(nextEvent);
      setRoundActionInfo("라운드가 삭제되었습니다.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "라운드 삭제에 실패했습니다.");
    } finally {
      setRoundActionPending(null);
    }
  }

  async function handleForceCloseRound(roundNumber: number): Promise<void> {
    if (!event) {
      return;
    }

    const nextEvent = await forceCloseRound(event.id, roundNumber);
    setEvent(nextEvent);
  }

  async function handleReassignSingleMatch(roundNumber: number, matchId: string): Promise<void> {
    if (!event) {
      return;
    }

    const nextEvent = await reassignSingleMatch(event.id, roundNumber, matchId);
    setEvent(nextEvent);
  }

  async function handleApplyProposal(roundNumber: number, matchId: string, scoreA: number, scoreB: number): Promise<void> {
    if (!event) {
      return;
    }

    const nextEvent = await updateMatchScores(event.id, roundNumber, matchId, { scoreA, scoreB });
    setEvent(nextEvent);
  }

  async function handleHostProposalResponse(roundNumber: number, matchId: string, response: "accept" | "dispute"): Promise<void> {
    if (!event || !hostParticipantId) {
      return;
    }

    const nextEvent = await respondToScoreProposal(event.id, roundNumber, matchId, hostParticipantId, response);
    setEvent(nextEvent);
  }

  async function handleSaveDecision(shouldSave: boolean): Promise<void> {
    if (!event || !profile) {
      return;
    }

    if (!shouldSave) {
      const nextEvent = await markEventSaved(event.id, {
        isSaved: false,
        savedAt: null,
        savedByUserId: null,
      });
      setEvent(nextEvent);
      setSaveInfo("이벤트를 저장하지 않도록 설정했습니다.");
      return;
    }

    const saved = await saveCompletedEventRecord(event);
    const nextEvent = await markEventSaved(event.id, {
      isSaved: true,
      savedAt: saved.savedAt,
      savedByUserId: profile.id,
    });
    setEvent(nextEvent);
    setSaveInfo("이벤트를 저장했습니다. 호스트 이력과 플레이어 내 기록에서 확인할 수 있습니다.");
  }

  if (loading) {
    return (
      <main className="poster-page max-w-3xl">
        <div className="border-t border-line py-8 text-center">
          <h1 className="text-3xl font-black">이벤트를 불러오는 중입니다.</h1>
          <p className="mt-3 text-sm text-ink/70">잠시만 기다려 주세요.</p>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="poster-page max-w-3xl">
        <div className="border-t border-line py-8 text-center">
          <h1 className="text-3xl font-black">이벤트를 찾을 수 없습니다.</h1>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          <Link href="/host" className="poster-button mt-6">
            호스트 페이지로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page">
      <div className="mb-8 flex flex-col gap-5 border-t border-line py-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="poster-label">{event.code}</p>
          <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">{event.eventName}</h1>
          <p className="mt-4 text-sm text-ink/68">
            {event.matchType === "singles" ? "단식" : "복식"} / 코트 {event.courtCount}개 / 라운드 {event.roundCount}개 / 보기 모드 {event.roundViewMode}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/" className="poster-button-secondary">
            메인 페이지
          </Link>
          <Link href="/history/host" className="poster-button-secondary">
            호스트 이력
          </Link>
          <button type="button" onClick={refreshEvent} className="poster-button-secondary">
            새로고침
          </button>
          <Link href={`/host/event/${event.id}/rounds`} className="poster-button-secondary">
            라운드 전체보기
          </Link>
          <Link href={`/event/${event.id}/leaderboard`} className="poster-button">
            리더보드
          </Link>
          <Link href="/host" className="poster-button-secondary">
            새 이벤트
          </Link>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <aside className="border-t border-line py-6">
          <div className="mb-8 border-b border-line pb-6">
            <div className="mb-3 text-sm font-semibold text-ink/70">QR 참여 링크</div>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <QRCodeSVG value={joinUrl} size={120} />
              <div className="min-w-0 space-y-2 text-xs text-ink/65 break-all">
                <div>{joinUrl}</div>
                <div>
                  참여 코드: <span className="font-semibold text-ink">{event.code}</span>
                </div>
                <div>게스트는 QR 스캔 또는 코드/링크 직접 입력으로 참여할 수 있습니다.</div>
              </div>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black">참가자 관리</h2>
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink/65">
              {event.participants.length}명
            </span>
          </div>

          <div className="space-y-3">
            {event.participants.map((participant) => (
              <div key={participant.id} className="grid gap-3 border-b border-line py-3 sm:grid-cols-[1fr_110px_110px_140px_auto]">
                <input
                  value={participant.displayName}
                  onChange={(event) => handleParticipantChange(participant.id, "displayName", event.target.value)}
                  disabled={!participantsEditable}
                  className="poster-input"
                />
                <select
                  value={participant.gender}
                  onChange={(event) => handleParticipantChange(participant.id, "gender", event.target.value)}
                  disabled={!participantsEditable}
                  className="poster-input"
                >
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                  <option value="unspecified">미정</option>
                </select>
                <div className="border-b border-line py-3 text-sm text-ink/70">
                  {participant.source === "joined"
                    ? "일반 참여"
                    : participant.source === "member"
                      ? "회원 선택"
                      : participant.source === "manual"
                        ? "직접 입력"
                        : "호스트"}
                  <div className="mt-1">NTRP {typeof participant.guestNtrp === "number" ? participant.guestNtrp.toFixed(1) : "-"}</div>
                </div>
                <select
                  value={participant.hostSkillOverride ?? ""}
                  onChange={(event) => handleParticipantChange(participant.id, "hostSkillOverride", event.target.value)}
                  disabled={!participantsEditable}
                  className="poster-input"
                >
                  <option value="">자동</option>
                  <option value="high">상</option>
                  <option value="medium">중</option>
                  <option value="low">하</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleRemoveParticipant(participant.id)}
                  disabled={!participantsEditable}
                  className="border-b border-red-200 py-3 text-sm font-semibold text-red-700"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <div className="text-sm font-semibold text-ink">회원 목록에서 선택</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedMemberId}
                onChange={(event) => setSelectedMemberId(event.target.value)}
                disabled={!participantsEditable}
                className="poster-input"
              >
                <option value="">회원 선택</option>
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName} · {member.email}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddMemberParticipant}
                disabled={!participantsEditable || !selectedMemberId}
                className="poster-button"
              >
                회원 추가
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-4 text-sm font-semibold text-ink">직접 입력</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_120px_auto]">
            <input
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              placeholder="추가할 참가자 이름"
              disabled={!participantsEditable}
              className="poster-input"
            />
            <select
              value={newPlayerGender}
              onChange={(event) => setNewPlayerGender(event.target.value as Participant["gender"])}
              disabled={!participantsEditable}
              className="poster-input"
            >
              <option value="male">남성</option>
              <option value="female">여성</option>
              <option value="unspecified">미정</option>
            </select>
            <select
              value={newPlayerSkill}
              onChange={(event) => setNewPlayerSkill(event.target.value as SkillLevel)}
              disabled={!participantsEditable}
              className="poster-input"
            >
              <option value="high">상</option>
              <option value="medium">중</option>
              <option value="low">하</option>
            </select>
            <button
              type="button"
              onClick={handleAddParticipant}
              disabled={!participantsEditable}
              className="poster-button"
            >
              추가
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleGenerateSchedule}
            disabled={!participantsEditable}
            className="poster-button mt-4"
          >
            대진 생성
          </button>

          {!participantsEditable ? (
            <p className="mt-3 text-xs text-ink/55">
              대진 생성 후에는 참가자 목록이 잠깁니다.
            </p>
          ) : null}

          {event.rounds.length > 0 ? (
            <button type="button" onClick={handleAddRound} className="poster-button-secondary mt-4">
              {roundActionPending === "add" ? "처리 중..." : "라운드 추가생성"}
            </button>
          ) : null}
          {roundActionInfo ? <div className="mt-3 text-sm text-accentStrong">{roundActionInfo}</div> : null}
        </aside>

        <div className="grid gap-6">
          <section className="border-t border-line py-6">
            <h2 className="text-2xl font-black">누적 통계</h2>
            <div className="mt-4 space-y-3">
              {sortedParticipants.map((participant) => {
                const stats: PlayerStats = event.stats[participant.id];
                const plan = scheduledSummary[participant.id] ?? { scheduledGames: 0, scheduledRests: 0 };
                return (
                  <div key={participant.id} className="border-b border-line py-4">
                    <div className="font-bold">{participant.name}</div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-ink/70">
                      <span>Games {stats?.games ?? 0}</span>
                      <span>Wins {stats?.wins ?? 0}</span>
                      <span>Losses {stats?.losses ?? 0}</span>
                      <span>Rests {stats?.rests ?? 0}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink/60">
                      <span className={maxScheduledGames - plan.scheduledGames >= 1 ? "font-semibold text-red-700" : ""}>
                        예정 경기 수 {plan.scheduledGames}
                      </span>
                      <span>예정 휴식 수 {plan.scheduledRests}</span>
                    </div>
                    {maxScheduledGames - plan.scheduledGames >= 1 ? (
                      <div className="mt-2 text-xs font-semibold text-red-700">
                        예정경기수 부족 · 최대 대비 {maxScheduledGames - plan.scheduledGames}경기 적음
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="border-t border-line py-6">
            <h2 className="text-2xl font-black">현재 이동 안내</h2>
            <div className="mt-4 space-y-3">
              {instructions.map((instruction) => (
                <div key={instruction.participantId} className="border-b border-line py-3">
                  <div className="font-semibold">{instruction.name}</div>
                  <div className="mt-1 text-sm text-ink/70">{instruction.instruction}</div>
                </div>
              ))}
            </div>
          </section>

          {disputeNotifications.length > 0 ? (
            <section className="border-t border-red-200 py-6">
              <h2 className="text-2xl font-black text-red-800">점수 이의신청</h2>
              <div className="mt-4 space-y-3">
                {disputeNotifications.map((notification) => (
                  <div key={notification.id} className="border-b border-red-200 py-3 text-sm text-red-700">
                    {notification.message}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {event.status === "completed" ? (
            <section className="border-t border-line py-6">
              <div className="mb-5 flex flex-wrap gap-3">
                <Link href="/" className="poster-button-secondary">
                  메인페이지 이동
                </Link>
              </div>
              <h2 className="text-3xl font-black">최종 결과</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {finalRanking.slice(0, 3).map((player) => (
                  <div key={player.participantId} className="border-b border-line pb-4">
                    <div className="text-sm font-semibold text-accentStrong">{player.rank}등</div>
                    <div className="mt-2 text-2xl font-black">{player.name}</div>
                    <div className="mt-2 text-sm text-ink/65">승 {player.stats.wins} · 득점 {player.stats.pointsScored} · 득실 {player.stats.pointDiff}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="w-full text-sm font-semibold text-ink/75">이 이벤트를 저장할까요?</div>
                <button type="button" onClick={() => void handleSaveDecision(true)} className="poster-button">
                  저장
                </button>
                <button type="button" onClick={() => void handleSaveDecision(false)} className="poster-button-secondary">
                  저장 안 함
                </button>
                <Link href={`/event/${event.id}/leaderboard`} className="poster-button-secondary">
                  전체 랭킹 보기
                </Link>
              </div>
              <div className="mt-8 overflow-x-auto">
                <table className="poster-table min-w-full text-left">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>이름</th>
                      <th>승</th>
                      <th>패</th>
                      <th>득점</th>
                      <th>득실차</th>
                      <th>휴식</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalRanking.map((player) => (
                      <tr key={player.participantId}>
                        <td>{player.rank}등</td>
                        <td className="font-semibold">{player.name}</td>
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
              {event.isSaved ? <div className="mt-3 text-sm text-accentStrong">저장 완료 · {event.savedAt ? new Date(event.savedAt).toLocaleString("ko-KR") : ""}</div> : null}
              {saveInfo ? <div className="mt-2 text-sm text-ink/70">{saveInfo}</div> : null}
            </section>
          ) : null}

          {event.rounds.length > 0 ? event.rounds.map((round) => (
            <article key={round.id ?? round.roundNumber} className={`border-t border-line py-6 pl-4 ${getRoundAccentClass(round.roundNumber)}`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-3xl font-black tracking-[-0.03em]">ROUND {round.roundNumber}</h2>
                <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${round.completed ? "text-accentStrong" : "text-amber-700"}`}>
                  {round.forceClosed ? "강제 종료" : round.completed ? "완료" : "진행 중"}
                </span>
              </div>

              <div className="grid gap-4">
                {round.matches.map((match) => (
                  <div key={match.id ?? `${round.roundNumber}-${match.court}`} className="border-t border-line py-4">
                    <p className="poster-label">Court {match.court}</p>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div><span className="mr-3 inline-block w-4 font-bold text-accentStrong">A</span>A팀: {match.teamA.map((player) => player.name).join(" / ")}</div>
                      <div><span className="mr-3 inline-block w-4 font-bold text-ink/75">B</span>B팀: {match.teamB.map((player) => player.name).join(" / ")}</div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold">
                        A팀 점수
                        <select
                          value={match.scoreA ?? ""}
                          disabled={round.completed}
                          onChange={(event) => handleScoreChange(round.roundNumber, match.id ?? "", "scoreA", event.target.value)}
                          className="poster-input disabled:bg-slate-100"
                        >
                          {SCORE_OPTIONS.map((option) => (
                            <option key={`a-${option || "blank"}`} value={option}>
                              {option === "" ? "선택" : option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        B팀 점수
                        <select
                          value={match.scoreB ?? ""}
                          disabled={round.completed}
                          onChange={(event) => handleScoreChange(round.roundNumber, match.id ?? "", "scoreB", event.target.value)}
                          className="poster-input disabled:bg-slate-100"
                        >
                          {SCORE_OPTIONS.map((option) => (
                            <option key={`b-${option || "blank"}`} value={option}>
                              {option === "" ? "선택" : option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {match.scoreProposal ? (
                      <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                        match.scoreProposal.status === "disputed"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}>
                        제출 점수 {match.scoreProposal.scoreA}:{match.scoreProposal.scoreB} /
                        상태 {match.scoreProposal.status === "pending" ? "확인 대기" : match.scoreProposal.status === "accepted" ? "확정" : "이의신청"}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleHostProposalResponse(round.roundNumber, match.id ?? "", "accept")}
                            disabled={round.completed}
                            className="border border-accentStrong px-3 py-2 text-xs font-semibold text-accentStrong disabled:opacity-50"
                          >
                            수락
                          </button>
                          <button
                            type="button"
                            onClick={() => handleHostProposalResponse(round.roundNumber, match.id ?? "", "dispute")}
                            disabled={round.completed}
                            className="border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                          >
                            이의신청
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyProposal(round.roundNumber, match.id ?? "", match.scoreProposal?.scoreA ?? 0, match.scoreProposal?.scoreB ?? 0)}
                            disabled={round.completed}
                            className="border border-amber-300 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                          >
                            제출 점수 반영
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSkipMatch(round.roundNumber, match.id ?? "")}
                        disabled={round.completed}
                        className="border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        {match.skipped ? "건너뛰기 취소" : "경기 건너뛰기"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReassignSingleMatch(round.roundNumber, match.id ?? "")}
                        disabled={round.completed}
                        className="border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        이 경기만 재배정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReassignRound(round.roundNumber)}
                        disabled={round.completed}
                        className="border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        이후 라운드 재배정
                      </button>
                    </div>
                    {match.skipped ? (
                      <div className="mt-3">
                        <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">건너뜀</span>
                      </div>
                    ) : null}
                    {isTieBreak(match.scoreA, match.scoreB) ? (
                      <div className="mt-3">
                        <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">타이</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-dashed border-line pt-4 text-sm text-ink/75">
                <span className="font-semibold text-ink">REST</span>{" "}
                {round.restPlayers.length > 0 ? round.restPlayers.map((player) => player.name).join(", ") : "없음"}
              </div>

              {!round.completed ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleFinalizeRound(round.roundNumber)}
                    className="poster-button"
                  >
                    점수 올리기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReassignRound(round.roundNumber)}
                    className="poster-button-secondary"
                  >
                    라운드 재배정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForceCloseRound(round.roundNumber)}
                    className="border border-red-200 px-4 py-3 font-semibold text-red-700"
                  >
                    라운드 건너뜀
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRound(round.roundNumber)}
                    disabled={roundActionPending === `delete-${round.roundNumber}`}
                    className="border border-line px-4 py-3 font-semibold"
                  >
                    {roundActionPending === `delete-${round.roundNumber}` ? "처리 중..." : "해당 라운드 삭제"}
                  </button>
                </div>
              ) : null}
            </article>
          )) : (
            <section className="border-t border-line py-6">
              <h2 className="text-2xl font-black">대진 전 대기</h2>
              <p className="mt-3 text-sm text-ink/68">
                참가자 목록을 정리한 뒤 `대진 생성`을 눌러 라운드를 시작하세요.
              </p>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
