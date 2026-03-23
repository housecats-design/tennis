"use client";

import { getCurrentRound, getEventNotifications, getParticipantBySession, getParticipantInstruction, loadEvent, markEventNotificationRead, subscribeToEvent } from "@/lib/events";
import { getSessionId, loadLastParticipant } from "@/lib/storage";
import { Notification } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function buildAssignmentMessage(event: Awaited<ReturnType<typeof loadEvent>> | null, participantId: string) {
  if (!event) {
    return { title: "이벤트 없음", body: "이벤트를 찾을 수 없습니다." };
  }

  if (event.status === "waiting" || event.rounds.length === 0) {
    return { title: "대기 중", body: "호스트가 아직 대진을 생성하지 않았습니다." };
  }

  const currentRound = getCurrentRound(event);
  if (!currentRound) {
    return { title: "이벤트 종료", body: "모든 라운드가 종료되었습니다." };
  }

  const match = currentRound.matches.find((currentMatch) =>
    [...currentMatch.teamA, ...currentMatch.teamB].some((player) => player.id === participantId),
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
  const eventId = params.id;
  const [currentEvent, setCurrentEvent] = useState<Awaited<ReturnType<typeof loadEvent>>>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantMeta, setParticipantMeta] = useState<{ name: string; gender: string; skill: string } | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const sessionId = getSessionId("guest");
    const syncEvent = async () => {
      const event = await loadEvent(eventId);
      const lastParticipantId = loadLastParticipant();
      const participant =
        (event ? getParticipantBySession(event, sessionId) : null) ??
        (lastParticipantId ? event?.participants.find((item) => item.id === lastParticipantId) ?? null : null);

      setCurrentEvent(event);
      setParticipantId(participant?.id ?? null);
      setParticipantMeta(
        participant
          ? {
              name: participant.displayName,
              gender: participant.gender === "male" ? "남성" : participant.gender === "female" ? "여성" : "미정",
              skill: participant.skillLevel === "high" ? "상" : participant.skillLevel === "low" ? "하" : "중",
            }
          : null,
      );
      setNotifications(event ? getEventNotifications(event, participant?.id) : []);
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

  async function handleRead(notificationId: string): Promise<void> {
    if (!eventId) {
      return;
    }

    const nextEvent = await markEventNotificationRead(eventId, notificationId);
    setCurrentEvent(nextEvent);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, readAt: new Date().toISOString() }
          : notification,
      ),
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/guest" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
          다른 이벤트 참여
        </Link>
        {eventId ? (
          <Link href={`/event/${eventId}/leaderboard`} className="rounded-2xl bg-accentStrong px-4 py-3 text-sm font-semibold text-white">
            리더보드
          </Link>
        ) : null}
      </div>

      <section className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
        <h1 className="text-3xl font-black">{assignment.title}</h1>
        <p className="mt-3 text-sm text-ink/75">{assignment.body}</p>
        {participantMeta && currentEvent && participantId ? (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm text-ink/75">
            <div>이름: {participantMeta.name}</div>
            <div>성별: {participantMeta.gender}</div>
            <div>실력: {participantMeta.skill}</div>
            <div className="mt-2 font-semibold text-ink">{getParticipantInstruction(currentEvent, participantId)}</div>
          </div>
        ) : null}
        {participantId && eventId ? (
          <p className="mt-2 text-xs text-ink/55">
            참가자 정보는 실시간으로 갱신됩니다.
          </p>
        ) : null}
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-black">알림</h2>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink/60">
            {notifications.length}개
          </span>
        </div>

        <div className="space-y-3">
          {notifications.length > 0 ? notifications.map((notification) => (
            <div key={notification.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="text-sm font-semibold">{notification.message}</div>
              <div className="mt-2 text-xs text-ink/55">Round {notification.roundNumber}</div>
              {!notification.readAt ? (
                <button
                  type="button"
                  onClick={() => handleRead(notification.id)}
                  className="mt-3 rounded-2xl border border-line bg-white px-3 py-2 text-xs font-semibold"
                >
                  읽음 처리
                </button>
              ) : null}
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-4 text-sm text-ink/70">
              아직 도착한 알림이 없습니다.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
