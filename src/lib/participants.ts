import { Participant } from "@/lib/types";

function makeId(): string {
  return `participant_${crypto.randomUUID().slice(0, 8)}`;
}

export function mapNtrpToSkillLevel(ntrp?: number | null): Participant["skillLevel"] {
  if (typeof ntrp !== "number") {
    return "medium";
  }

  if (ntrp >= 4.5) {
    return "high";
  }

  if (ntrp <= 3) {
    return "low";
  }

  return "medium";
}

export function resolveParticipantSkill(input: {
  guestNtrp?: number | null;
  hostSkillOverride?: Participant["skillLevel"] | null;
}): Participant["skillLevel"] {
  return input.hostSkillOverride ?? mapNtrpToSkillLevel(input.guestNtrp);
}

export function createParticipant(input: {
  eventId: string;
  displayName: string;
  gender: Participant["gender"];
  guestNtrp?: number | null;
  joinedAsClubId?: string | null;
  ntrpAtEvent?: number | null;
  hostSkillOverride?: Participant["skillLevel"] | null;
  role: "host" | "guest";
  sessionId?: string;
  userId?: string | null;
  source?: Participant["source"];
}): Participant {
  return {
    id: makeId(),
    eventId: input.eventId,
    displayName: input.displayName.trim(),
    gender: input.gender,
    joinedAsClubId: input.joinedAsClubId ?? null,
    guestNtrp: input.guestNtrp ?? null,
    ntrpAtEvent: typeof input.ntrpAtEvent === "number" ? input.ntrpAtEvent : input.guestNtrp ?? null,
    hostSkillOverride: input.hostSkillOverride ?? null,
    skillLevel: resolveParticipantSkill({
      guestNtrp: input.guestNtrp,
      hostSkillOverride: input.hostSkillOverride,
    }),
    role: input.role,
    source: input.source ?? (input.role === "host" ? "host" : "manual"),
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    joinedAt: new Date().toISOString(),
    isActive: true,
    availabilityState: "active",
  };
}

export function ensureUniqueDisplayNames(participants: Participant[]): boolean {
  const normalized = participants.map((participant) => participant.displayName.trim().toLowerCase());
  return new Set(normalized).size === normalized.length;
}
