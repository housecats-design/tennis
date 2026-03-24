import { EventRecord } from "@/lib/types";

const EVENTS_STORAGE_KEY = "tennis-events";
const HOST_SESSION_STORAGE_KEY = "tennis-host-session";
const GUEST_SESSION_STORAGE_KEY = "tennis-guest-session";
const LAST_EVENT_STORAGE_KEY = "tennis-last-event";
const LAST_PARTICIPANT_STORAGE_KEY = "tennis-last-participant";
const EVENT_BROADCAST_PREFIX = "tennis-event-channel";
const LAST_ROLE_STORAGE_KEY = "tennis-last-role";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(storageKey: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function writeJson<T>(storageKey: string, value: T): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

export function loadEvents(): EventRecord[] {
  return readJson<EventRecord[]>(EVENTS_STORAGE_KEY) ?? [];
}

export function saveEvents(events: EventRecord[]): void {
  writeJson(EVENTS_STORAGE_KEY, events);
}

export function getSessionId(role: "host" | "guest"): string {
  if (!canUseStorage()) {
    return `${role}_server`;
  }

  const key = role === "host" ? HOST_SESSION_STORAGE_KEY : GUEST_SESSION_STORAGE_KEY;
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const sessionId = `${role}_${crypto.randomUUID().slice(0, 12)}`;
  window.localStorage.setItem(key, sessionId);
  return sessionId;
}

export function saveLastEvent(eventId: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LAST_EVENT_STORAGE_KEY, eventId);
}

export function loadLastEvent(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(LAST_EVENT_STORAGE_KEY);
}

export function saveLastParticipant(participantId: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LAST_PARTICIPANT_STORAGE_KEY, participantId);
}

export function loadLastParticipant(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(LAST_PARTICIPANT_STORAGE_KEY);
}

export function createEventBroadcastChannel(eventId: string): BroadcastChannel | null {
  if (!canUseStorage() || typeof BroadcastChannel === "undefined") {
    return null;
  }

  return new BroadcastChannel(`${EVENT_BROADCAST_PREFIX}-${eventId}`);
}

export function saveLastRole(role: "host" | "player"): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LAST_ROLE_STORAGE_KEY, role);
}

export function loadLastRole(): "host" | "player" | null {
  if (!canUseStorage()) {
    return null;
  }

  const role = window.localStorage.getItem(LAST_ROLE_STORAGE_KEY);
  return role === "host" || role === "player" ? role : null;
}
