"use client";

import { QRCodeSVG } from "qrcode.react";
import { canEditParticipants, finalizeRound, generateEventSchedule, getJoinUrl, getRoundInstructions, loadEvent, reassignRound, saveParticipants, skipMatch, subscribeToEvent, updateMatchScores } from "@/lib/events";
import { sortLeaderboard } from "@/lib/leaderboard";
import { ensureUniqueDisplayNames, resolveParticipantSkill } from "@/lib/participants";
import { Participant, PlayerStats, SkillLevel } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

export default function HostEventPage() {
  const params = useParams<{ id: string }>();
  const eventId = typeof params.id === "string" ? params.id : "";
  const [event, setEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<Participant["gender"]>("male");
  const [newPlayerSkill, setNewPlayerSkill] = useState<SkillLevel>("medium");

  useEffect(() => {
    if (!eventId) {
      setError("유효하지 않은 이벤트 주소입니다.");
      setLoading(false);
      return;
    }

    const refresh = async () => {
      try {
        const nextEvent = await loadEvent(eventId);
        setEvent(nextEvent);
        setError(null);
      } catch (error) {
        console.error("[host-event] refresh failed", error);
        setError(error instanceof Error ? error.message : "이벤트를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 3000);
    const unsubscribe = subscribeToEvent(eventId, refresh);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [eventId]);

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
        sessionId: null,
      },
    ];

    const nextEvent = await saveParticipants(event.id, nextParticipants);
    setEvent(nextEvent);
    setNewPlayerName("");
    setNewPlayerGender("male");
    setNewPlayerSkill("medium");
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

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">이벤트를 불러오는 중입니다.</h1>
          <p className="mt-3 text-sm text-ink/70">잠시만 기다려 주세요.</p>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
          <h1 className="text-3xl font-black">이벤트를 찾을 수 없습니다.</h1>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          <Link href="/host" className="mt-6 inline-flex rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white">
            호스트 페이지로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-line bg-white/90 p-6 shadow-panel lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{event.code}</p>
          <h1 className="mt-2 text-3xl font-black">{event.eventName}</h1>
          <p className="mt-2 text-sm text-ink/70">
            {event.matchType === "singles" ? "단식" : "복식"} / 코트 {event.courtCount}개 / 라운드 {event.roundCount}개 / 보기 모드 {event.roundViewMode}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={refreshEvent} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
            새로고침
          </button>
          <Link href={`/host/event/${event.id}/rounds`} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
            라운드 전체보기
          </Link>
          <Link href={`/event/${event.id}/leaderboard`} className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white">
            리더보드
          </Link>
          <Link href="/host" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
            새 이벤트
          </Link>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <aside className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
          <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 text-sm font-semibold text-ink/70">QR 참여 링크</div>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <QRCodeSVG value={joinUrl} size={120} />
              <div className="min-w-0 text-xs text-ink/65 break-all">{joinUrl}</div>
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
              <div key={participant.id} className="grid gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[1fr_110px_110px_140px_auto]">
                <input
                  value={participant.displayName}
                  onChange={(event) => handleParticipantChange(participant.id, "displayName", event.target.value)}
                  disabled={!participantsEditable}
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <select
                  value={participant.gender}
                  onChange={(event) => handleParticipantChange(participant.id, "gender", event.target.value)}
                  disabled={!participantsEditable}
                  className="rounded-2xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-accent"
                >
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                  <option value="unspecified">미정</option>
                </select>
                <div className="rounded-2xl border border-line bg-white px-3 py-3 text-sm text-ink/70">
                  NTRP {typeof participant.guestNtrp === "number" ? participant.guestNtrp.toFixed(1) : "-"}
                </div>
                <select
                  value={participant.hostSkillOverride ?? ""}
                  onChange={(event) => handleParticipantChange(participant.id, "hostSkillOverride", event.target.value)}
                  disabled={!participantsEditable}
                  className="rounded-2xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-accent"
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
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_120px_auto]">
            <input
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              placeholder="추가할 참가자 이름"
              disabled={!participantsEditable}
              className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <select
              value={newPlayerGender}
              onChange={(event) => setNewPlayerGender(event.target.value as Participant["gender"])}
              disabled={!participantsEditable}
              className="rounded-2xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
            >
              <option value="male">남성</option>
              <option value="female">여성</option>
              <option value="unspecified">미정</option>
            </select>
            <select
              value={newPlayerSkill}
              onChange={(event) => setNewPlayerSkill(event.target.value as SkillLevel)}
              disabled={!participantsEditable}
              className="rounded-2xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
            >
              <option value="high">상</option>
              <option value="medium">중</option>
              <option value="low">하</option>
            </select>
            <button
              type="button"
              onClick={handleAddParticipant}
              disabled={!participantsEditable}
              className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-bold text-white"
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
            className="mt-4 inline-flex rounded-2xl bg-accentStrong px-5 py-3 text-sm font-bold text-white"
          >
            대진 생성
          </button>

          {!participantsEditable ? (
            <p className="mt-3 text-xs text-ink/55">
              대진 생성 후에는 참가자 목록이 잠깁니다.
            </p>
          ) : null}
        </aside>

        <div className="grid gap-6">
          <section className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
            <h2 className="text-2xl font-black">누적 통계</h2>
            <div className="mt-4 space-y-3">
              {sortedParticipants.map((participant) => {
                const stats: PlayerStats = event.stats[participant.id];
                const plan = scheduledSummary[participant.id] ?? { scheduledGames: 0, scheduledRests: 0 };
                return (
                  <div key={participant.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="font-bold">{participant.name}</div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-ink/70">
                      <span>Games {stats?.games ?? 0}</span>
                      <span>Wins {stats?.wins ?? 0}</span>
                      <span>Losses {stats?.losses ?? 0}</span>
                      <span>Rests {stats?.rests ?? 0}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink/60">
                      <span>예정 경기 수 {plan.scheduledGames}</span>
                      <span>예정 휴식 수 {plan.scheduledRests}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
            <h2 className="text-2xl font-black">현재 이동 안내</h2>
            <div className="mt-4 space-y-3">
              {instructions.map((instruction) => (
                <div key={instruction.participantId} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="font-semibold">{instruction.name}</div>
                  <div className="mt-1 text-sm text-ink/70">{instruction.instruction}</div>
                </div>
              ))}
            </div>
          </section>

          {disputeNotifications.length > 0 ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-panel">
              <h2 className="text-2xl font-black text-red-800">점수 이의신청</h2>
              <div className="mt-4 space-y-3">
                {disputeNotifications.map((notification) => (
                  <div key={notification.id} className="rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-700">
                    {notification.message}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {event.rounds.length > 0 ? event.rounds.map((round) => (
            <article key={round.id ?? round.roundNumber} className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-black">Round {round.roundNumber}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${round.completed ? "bg-accentStrong text-white" : "bg-amber-100 text-amber-800"}`}>
                  {round.completed ? "완료" : "진행 중"}
                </span>
              </div>

              <div className="grid gap-4">
                {round.matches.map((match) => (
                  <div key={match.id ?? `${round.roundNumber}-${match.court}`} className="rounded-2xl border border-line bg-surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Court {match.court}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
                        {match.teamA.map((player) => player.name).join(" / ")}
                      </div>
                      <div className="text-center text-sm font-black text-ink/55">VS</div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold">
                        {match.teamB.map((player) => player.name).join(" / ")}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        type="number"
                        min={0}
                        value={match.scoreA ?? ""}
                        disabled={round.completed}
                        onChange={(event) => handleScoreChange(round.roundNumber, match.id ?? "", "scoreA", event.target.value)}
                        className="rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent disabled:bg-slate-100"
                      />
                      <input
                        type="number"
                        min={0}
                        value={match.scoreB ?? ""}
                        disabled={round.completed}
                        onChange={(event) => handleScoreChange(round.roundNumber, match.id ?? "", "scoreB", event.target.value)}
                        className="rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent disabled:bg-slate-100"
                      />
                    </div>
                    {match.scoreProposal ? (
                      <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                        match.scoreProposal.status === "disputed"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}>
                        제출 점수 {match.scoreProposal.scoreA}:{match.scoreProposal.scoreB} /
                        상태 {match.scoreProposal.status === "pending" ? "확인 대기" : match.scoreProposal.status === "accepted" ? "확정" : "이의신청"}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSkipMatch(round.roundNumber, match.id ?? "")}
                        disabled={round.completed}
                        className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        {match.skipped ? "건너뛰기 취소" : "경기 건너뛰기"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReassignRound(round.roundNumber)}
                        disabled={round.completed}
                        className="rounded-2xl border border-line bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        이후 라운드 재배정
                      </button>
                    </div>
                    {match.skipped ? (
                      <div className="mt-3">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">건너뜀</span>
                      </div>
                    ) : null}
                    {isTieBreak(match.scoreA, match.scoreB) ? (
                      <div className="mt-3">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">타이</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-sm text-ink/75">
                <span className="font-semibold text-ink">Rest Players:</span>{" "}
                {round.restPlayers.length > 0 ? round.restPlayers.map((player) => player.name).join(", ") : "없음"}
              </div>

              {!round.completed ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleFinalizeRound(round.roundNumber)}
                    className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-bold text-white"
                  >
                    점수 올리기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReassignRound(round.roundNumber)}
                    className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold"
                  >
                    라운드 재배정
                  </button>
                </div>
              ) : null}
            </article>
          )) : (
            <section className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
              <h2 className="text-2xl font-black">대진 전 대기</h2>
              <p className="mt-3 text-sm text-ink/70">
                참가자 목록을 정리한 뒤 `대진 생성`을 눌러 라운드를 시작하세요.
              </p>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
