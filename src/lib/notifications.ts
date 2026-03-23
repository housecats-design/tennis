import { EventRecord, Notification, Round } from "@/lib/types";

function makeNotificationId(): string {
  return `notification_${crypto.randomUUID().slice(0, 8)}`;
}

function getCurrentOpenRound(rounds: Round[]): Round | null {
  return rounds.find((round) => !round.completed) ?? null;
}

export function notifyRoundCompletion(input: {
  event: EventRecord;
  rounds: Round[];
  completedRoundNumber: number;
}): Notification[] {
  const nextRound = getCurrentOpenRound(input.rounds);
  const notifications = input.event.participants.map((participant) => {
    const round = nextRound;

    if (!round) {
      return {
        id: makeNotificationId(),
        eventId: input.event.id,
        roundNumber: input.completedRoundNumber,
        targetParticipantId: participant.id,
        message: "모든 라운드가 종료되었습니다.",
        readAt: null,
        createdAt: new Date().toISOString(),
      };
    }

    const match = round.matches.find((currentMatch) =>
      [...currentMatch.teamA, ...currentMatch.teamB].some((player) => player.id === participant.id),
    );

    if (!match) {
      return {
        id: makeNotificationId(),
        eventId: input.event.id,
        roundNumber: round.roundNumber,
        targetParticipantId: participant.id,
        message: "이번 라운드는 휴식입니다.",
        readAt: null,
        createdAt: new Date().toISOString(),
      };
    }

    return {
      id: makeNotificationId(),
      eventId: input.event.id,
      roundNumber: round.roundNumber,
      targetParticipantId: participant.id,
      message: `경기가 끝났습니다. ${match.court}번 코트로 이동하세요.`,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
  });

  return [...input.event.notifications, ...notifications];
}

export function getGuestNotifications(
  notifications: Notification[],
  participantId?: string,
): Notification[] {
  return notifications
    .filter(
      (notification) =>
        !participantId ||
        !notification.targetParticipantId ||
        notification.targetParticipantId === participantId,
    )
    .sort((left, right) => right.roundNumber - left.roundNumber);
}

export function markNotificationRead(
  notifications: Notification[],
  notificationId: string,
): Notification[] {
  return notifications.map((notification) =>
    notification.id === notificationId
      ? {
          ...notification,
          readAt: new Date().toISOString(),
        }
      : notification,
  );
}
