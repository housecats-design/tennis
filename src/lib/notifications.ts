import { EventRecord, Invitation, Notification, Round } from "@/lib/types";

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
        targetUserId: participant.userId ?? null,
        message: "모든 라운드가 종료되었습니다.",
        readAt: null,
        createdAt: new Date().toISOString(),
        type: "success" as const,
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
        targetUserId: participant.userId ?? null,
        message: "이번 라운드는 휴식입니다.",
        readAt: null,
        createdAt: new Date().toISOString(),
        type: "info" as const,
      };
    }

    return {
      id: makeNotificationId(),
      eventId: input.event.id,
      roundNumber: round.roundNumber,
      targetParticipantId: participant.id,
      targetUserId: participant.userId ?? null,
      message: `경기가 끝났습니다. ${match.court}번 코트로 이동하세요.`,
      readAt: null,
      createdAt: new Date().toISOString(),
      type: "success" as const,
    };
  });

  return [...input.event.notifications, ...notifications];
}

export function createEventNotification(input: {
  eventId: string;
  roundNumber?: number;
  message: string;
  type?: Notification["type"];
  targetParticipantId?: string | null;
  targetUserId?: string | null;
  actionUrl?: string | null;
  metadata?: Notification["metadata"];
}): Notification {
  return {
    id: makeNotificationId(),
    eventId: input.eventId,
    roundNumber: input.roundNumber ?? 0,
    message: input.message,
    targetParticipantId: input.targetParticipantId ?? null,
    targetUserId: input.targetUserId ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
    type: input.type ?? "info",
    actionUrl: input.actionUrl ?? null,
    metadata: input.metadata ?? null,
  };
}

export function createInvitationNotification(invitation: Invitation): Notification {
  return createEventNotification({
    eventId: invitation.eventId,
    message: `호스트 ${invitation.invitedByName}님이 ${invitation.eventName} 이벤트에 초대했습니다.`,
    type: "invitation",
    targetUserId: invitation.invitedUserId,
    actionUrl: invitation.actionUrl,
    metadata: {
      invitationId: invitation.id,
      status: invitation.status,
      eventCode: invitation.code,
    },
  });
}

export function getGuestNotifications(
  notifications: Notification[],
  participantId?: string,
  userId?: string | null,
): Notification[] {
  return notifications
    .filter(
      (notification) =>
        (!participantId && !userId) ||
        !notification.targetParticipantId ||
        notification.targetParticipantId === participantId ||
        (Boolean(userId) && notification.targetUserId === userId),
    )
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.createdAt ?? 0).getTime();
      return rightTime - leftTime || right.roundNumber - left.roundNumber;
    });
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
