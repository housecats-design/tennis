"use client";

import { getCurrentRound, getEventNotifications, getParticipantBySession, getParticipantInstruction, loadEvent, markEventNotificationRead, respondToScoreProposal, submitMatchScoreProposal, subscribeToEvent } from "@/lib/events";
import { getSessionId, loadLastParticipant } from "@/lib/storage";
import { Notification } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const SCORE_OPTIONS = ["", "0", "1", "2", "3", "4", "5", "6"];

function formatNotificationTime(value: string | null | undefined): string {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildAssignmentMessage(event: Awaited<ReturnType<typeof loadEvent>> | null, participantId: string) {
  if (!event) {
    return { title: "이벤트 없음", body: "이벤트를 찾을 수 없습니다." };
  }

  const rounds = Array.isArray(event.rounds) ? event.rounds : [];
  if (event.status === "waiting" || rounds.length === 0) {
    return { title: "대기 중", body: "호스트가 아직 대진을 생성하지 않았습니다." };
  }

  const currentRound = getCurrentRound(event);
  if (!currentRound) {
    return { title: "이벤트 종료", body: "모든 라운드가 종료되었습니다." };
  }

  const matches = Array.isArray(currentRound.matches) ? currentRound.matches : [];
  const match = matches.find((currentMatch) =>
    [...(Array.isArray(currentMatch.teamA) ? currentMatch.teamA : []), ...(Array.isArray(currentMatch.teamB) ? currentMatch.teamB : [])].some((player) => player.id === participantId),
  );

  if (!match) {
    return {
      title: `Round ${currentRound.roundNumber}`,
      body: "이번 라운드는 휴식입니다.",
    };
  }

  const isTeamA = match.teamA.some((player) => player.id === participantId);
  const teammates = (isTeamA ? match.teamA : match.teamB)
    .filter((player) => player.id !== participantId)
    .map((player) => player.name);
  const opponents = (isTeamA ? match.teamB : match.teamA).map((player) => player.name);

  return {
    title: `Round ${currentRound.roundNumber} / Court ${match.court}`,
    body: `팀 ${teammates.length > 0 ? teammates.join(", ") : "단식"} / 상대 ${opponents.join(", ")}`,
  };
}

export default function GuestEventPage() {
  const params = useParams<{ id: string }>();
  const eventId = typeof params.id === "string" ? params.id : "";
  const [currentEvent, setCurrentEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantMeta, setParticipantMeta] = useState<{ name: string; gender: string; ntrp: string } | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState({ scoreA: "", scoreB: "" });
  const lastSignalRef = useRef("");

  useEffect(() => {
    if (!eventId) {
      setError("유효하지 않은 이벤트 주소입니다.");
      setLoading(false);
      return;
    }

    const sessionId = getSessionId("guest");
    const syncEvent = async () => {
      try {
        console.debug("[guest-event] sync start", { eventId });
        const event = await loadEvent(eventId);
        const participants = Array.isArray(event?.participants) ? event.participants : [];
        const lastParticipantId = loadLastParticipant();
        const participant =
          (event ? getParticipantBySession(event, sessionId) : null) ??
          (lastParticipantId ? participants.find((item) => item.id === lastParticipantId) ?? null : null);

        setCurrentEvent(event);
        setParticipantId(participant?.id ?? null);
        setParticipantMeta(
          participant
            ? {
                name: participant.displayName,
                gender: participant.gender === "male" ? "남성" : participant.gender === "female" ? "여성" : "미정",
                ntrp: typeof participant.guestNtrp === "number" ? participant.guestNtrp.toFixed(1) : "-",
              }
            : null,
        );
        setNotifications(event ? getEventNotifications(event, participant?.id) : []);
        setError(null);
      } catch (error) {
        console.error("[guest-event] sync failed", error);
        setCurrentEvent(null);
        setParticipantId(null);
        setParticipantMeta(null);
        setNotifications([]);
        setError(error instanceof Error ? error.message : "이벤트 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void syncEvent();

    const interval = window.setInterval(syncEvent, 3000);
    const unsubscribe = subscribeToEvent(eventId, () => {
      void syncEvent();
    });

    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [eventId]);

  const assignment = useMemo(() => {
    if (!participantId) {
      return { title: "참여 정보 없음", body: "먼저 이벤트에 참여해 주세요." };
    }

    return buildAssignmentMessage(currentEvent, participantId);
  }, [currentEvent, participantId]);

  const currentRound = useMemo(() => (currentEvent ? getCurrentRound(currentEvent) : null), [currentEvent]);
  const currentMatch = useMemo(() => {
    if (!currentRound || !participantId) {
      return null;
    }

    return (Array.isArray(currentRound.matches) ? currentRound.matches : []).find((match) =>
      [...(Array.isArray(match.teamA) ? match.teamA : []), ...(Array.isArray(match.teamB) ? match.teamB : [])].some((player) => player.id === participantId),
    ) ?? null;
  }, [currentRound, participantId]);
  const isParticipantInTeamA = Boolean(
    currentMatch && participantId && currentMatch.teamA.some((player) => player.id === participantId),
  );
  const isWaitingPlayer = Boolean(currentRound && !currentMatch);
  const ownTeam = currentMatch ? (isParticipantInTeamA ? currentMatch.teamA : currentMatch.teamB) : [];
  const opponentTeam = currentMatch ? (isParticipantInTeamA ? currentMatch.teamB : currentMatch.teamA) : [];
  const teamALabel = currentMatch ? (isParticipantInTeamA ? "A팀 (내 팀)" : "A팀 (상대 팀)") : "A팀";
  const teamBLabel = currentMatch ? (isParticipantInTeamA ? "B팀 (상대 팀)" : "B팀 (내 팀)") : "B팀";
  const currentRoundMatches = Array.isArray(currentRound?.matches) ? currentRound.matches : [];

  useEffect(() => {
    const unreadCount = notifications.filter((notification) => !notification.readAt).length;
    const signal = `${assignment.title}|${assignment.body}|${unreadCount}`;
    if (!participantId || signal === lastSignalRef.current) {
      return;
    }

    lastSignalRef.current = signal;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.([120, 80, 120]);
      } catch (vibrationError) {
        console.debug("[guest-event] vibrate unsupported", vibrationError);
      }
    }
  }, [assignment.body, assignment.title, notifications, participantId]);

  async function handleSubmitProposal(): Promise<void> {
    if (!eventId || !currentRound || !currentMatch || !participantId) {
      return;
    }

    if (scoreDraft.scoreA === "" || scoreDraft.scoreB === "") {
      setError("A팀과 B팀 점수를 모두 선택해 주세요.");
      return;
    }

    const scoreA = Number(scoreDraft.scoreA);
    const scoreB = Number(scoreDraft.scoreB);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      setError("점수는 정수여야 합니다.");
      return;
    }

    await submitMatchScoreProposal(eventId, currentRound.roundNumber, currentMatch.id ?? "", participantId, {
      scoreA,
      scoreB,
    });
    setScoreDraft({ scoreA: "", scoreB: "" });
  }

  async function handleProposalResponse(response: "accept" | "dispute"): Promise<void> {
    if (!eventId || !currentRound || !currentMatch || !participantId) {
      return;
    }

    await respondToScoreProposal(eventId, currentRound.roundNumber, currentMatch.id ?? "", participantId, response);
  }

  async function handleRead(notificationId: string): Promise<void> {
    if (!eventId) {
      return;
    }

    try {
      const nextEvent = await markEventNotificationRead(eventId, notificationId);
      setCurrentEvent(nextEvent);
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );
    } catch (error) {
      console.error("[guest-event] mark read failed", error);
    }
  }

  if (loading) {
    return <main className="poster-page max-w-4xl text-sm text-ink/70">게스트 이벤트를 불러오는 중...</main>;
  }

  if (error) {
    return (
      <main className="poster-page max-w-4xl">
        <div className="border-t border-red-200 py-6 text-sm text-red-700">
          <div className="font-bold">게스트 화면을 불러오지 못했습니다.</div>
          <div className="mt-2">{error}</div>
          <Link href="/guest" className="poster-button-secondary mt-4">
            게스트 페이지로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-4xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/guest" className="poster-button-secondary">
          다른 이벤트 참여
        </Link>
        {eventId ? (
          <Link href={`/event/${eventId}/leaderboard`} className="poster-button">
            리더보드
          </Link>
        ) : null}
      </div>

      <section className="border-t border-line py-6">
        <p className="poster-label">Player Status</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">{assignment.title}</h1>
        <p className="mt-4 text-sm leading-6 text-ink/72">{assignment.body}</p>
        {participantMeta && currentEvent && participantId ? (
          <div className="mt-5 grid gap-2 border-t border-line pt-4 text-sm text-ink/75 sm:grid-cols-3">
            <div>이름: {participantMeta.name}</div>
            <div>성별: {participantMeta.gender}</div>
            <div>NTRP: {participantMeta.ntrp}</div>
            <div className="sm:col-span-3 mt-2 font-semibold text-ink">{getParticipantInstruction(currentEvent, participantId)}</div>
          </div>
        ) : null}
        {participantId && eventId ? (
          <p className="mt-2 text-xs text-ink/55">
            참가자 정보는 실시간으로 갱신됩니다. 일부 모바일 브라우저에서는 진동 알림이 제한될 수 있습니다.
          </p>
        ) : null}
      </section>

      {currentMatch && participantId ? (
        <section className="mt-6 border-t border-line py-6">
          <h2 className="text-3xl font-black tracking-[-0.03em]">현재 경기</h2>
          <div className="mt-5 grid gap-4">
            {currentEvent?.matchType === "singles" ? (
              <>
                <div className="text-sm font-semibold">내 선수: {ownTeam.map((player) => player.name).join(" / ")}</div>
                <div className="text-sm font-semibold">상대 선수: {opponentTeam.map((player) => player.name).join(" / ")}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold">내 팀: {ownTeam.map((player) => player.name).join(" / ")}</div>
                <div className="text-sm font-semibold">상대 팀: {opponentTeam.map((player) => player.name).join(" / ")}</div>
              </>
            )}
            <div className="text-sm text-ink/70">코트 {currentMatch.court}</div>
            <div className="grid gap-3 border-y border-line py-4 text-sm">
              <div><span className="font-semibold">{teamALabel}:</span> {currentMatch.teamA.map((player) => player.name).join(" / ")}</div>
              <div><span className="font-semibold">{teamBLabel}:</span> {currentMatch.teamB.map((player) => player.name).join(" / ")}</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                {teamALabel}
                <select
                  value={scoreDraft.scoreA}
                  onChange={(event) => setScoreDraft((current) => ({ ...current, scoreA: event.target.value }))}
                  className="poster-input"
                >
                  {SCORE_OPTIONS.map((option) => (
                    <option key={`guest-a-${option || "blank"}`} value={option}>
                      {option === "" ? "점수 선택" : option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                {teamBLabel}
                <select
                  value={scoreDraft.scoreB}
                  onChange={(event) => setScoreDraft((current) => ({ ...current, scoreB: event.target.value }))}
                  className="poster-input"
                >
                  {SCORE_OPTIONS.map((option) => (
                    <option key={`guest-b-${option || "blank"}`} value={option}>
                      {option === "" ? "점수 선택" : option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => void handleSubmitProposal()}
              className="poster-button w-fit"
            >
              점수 제출
            </button>

            {currentMatch.scoreProposal ? (
              <div className="border-l-2 border-amber-300 pl-4 text-sm text-amber-900">
                <div className="font-semibold">이 점수가 맞습니까?</div>
                <div className="mt-2">{teamALabel} {currentMatch.scoreProposal.scoreA} : {teamBLabel} {currentMatch.scoreProposal.scoreB}</div>
                {currentMatch.scoreProposal.submittedByParticipantId !== participantId ? (
                  <div className="mt-3 flex gap-3">
                    <button type="button" onClick={() => void handleProposalResponse("accept")} className="poster-button-secondary">
                      수락
                    </button>
                    <button type="button" onClick={() => void handleProposalResponse("dispute")} className="border border-red-200 px-4 py-3 font-semibold text-red-700">
                      이의신청
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-ink/70">다른 선수들의 확인을 기다리는 중입니다.</div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {isWaitingPlayer ? (
        <section className="mt-6 border-t border-line py-6">
          <h2 className="text-3xl font-black tracking-[-0.03em]">대기 화면</h2>
          <div className="mt-4 text-sm text-ink/75">
            <div>현재 라운드 현황을 실시간으로 보고 있습니다.</div>
            <div className="mt-2 font-semibold">{currentEvent ? getParticipantInstruction(currentEvent, participantId ?? "") : "다음 매치를 기다리는 중입니다."}</div>
            <div className="mt-5 border-t border-line pt-4">
              <div className="poster-label">Current Round Scoreboard</div>
              <div className="mt-3 space-y-3">
                {currentRoundMatches.map((match) => (
                  <div key={match.id ?? `${match.court}`} className="border-b border-line pb-3 text-sm">
                    <div className="font-semibold">Court {match.court}</div>
                    <div className="mt-1">A {match.teamA.map((player) => player.name).join(" / ")}</div>
                    <div>B {match.teamB.map((player) => player.name).join(" / ")}</div>
                    <div className="mt-1 text-ink/65">{match.scoreA ?? "-"} : {match.scoreB ?? "-"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 border-t border-line py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-3xl font-black tracking-[-0.03em]">알림</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/55">
            {notifications.length}개
          </span>
        </div>

        <div className="space-y-3">
          {notifications.length > 0 ? notifications.map((notification) => (
            <div key={notification.id} className="border-b border-line py-3">
              <div className="text-sm font-semibold">[{formatNotificationTime(notification.createdAt)}] {notification.message}</div>
              <div className="mt-2 text-xs text-ink/55">Round {notification.roundNumber}</div>
              {!notification.readAt ? (
                <button
                  type="button"
                  onClick={() => handleRead(notification.id)}
                  className="mt-3 border-b border-line pb-1 text-xs font-semibold"
                >
                  읽음 처리
                </button>
              ) : null}
            </div>
          )) : (
            <div className="border-b border-dashed border-line py-4 text-sm text-ink/70">
              아직 도착한 알림이 없습니다.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
