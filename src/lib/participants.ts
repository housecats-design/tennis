import { Participant } from "@/lib/types";

function makeId(): string {
  return `participant_${crypto.randomUUID().slice(0, 8)}`;
}

export function createParticipant(input: {
  eventId: string;
  displayName: string;
  gender: Participant["gender"];
  skillLevel: Participant["skillLevel"];
  role: "host" | "guest";
  sessionId?: string;
}): Participant {
  return {
    id: makeId(),
    eventId: input.eventId,
    displayName: input.displayName.trim(),
    gender: input.gender,
    skillLevel: input.skillLevel,
    role: input.role,
    sessionId: input.sessionId ?? null,
    joinedAt: new Date().toISOString(),
    isActive: true,
  };
}

export function ensureUniqueDisplayNames(participants: Participant[]): boolean {
  const normalized = participants.map((participant) => participant.displayName.trim().toLowerCase());
  return new Set(normalized).size === normalized.length;
}
