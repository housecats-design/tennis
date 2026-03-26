"use client";

import { AuthIdentity, UserProfile } from "@/lib/types";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

const USER_PROFILES_STORAGE_KEY = "tennis-user-profiles";

type UserProfileRow = {
  user_id?: string;
  id?: string;
  email: string;
  login_id: string;
  display_name: string;
  is_admin: boolean | null;
  memo: string | null;
  is_deleted: boolean | null;
  deleted_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
} & Record<string, unknown>;

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function loadCachedProfiles(): UserProfile[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(USER_PROFILES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as UserProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCachedProfiles(profiles: UserProfile[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(USER_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function normalizeProfile(row: Partial<UserProfileRow> & { user_id?: string; id?: string }): UserProfile {
  const resolvedUserId = row.user_id ?? row.id;
  if (!resolvedUserId) {
    throw new Error("user_profiles row is missing user_id");
  }

  return {
    id: resolvedUserId,
    email: row.email ?? "",
    loginId: row.login_id ?? "",
    displayName: row.display_name ?? "",
    isAdmin: Boolean(row.is_admin),
    memo: row.memo ?? "",
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function cacheProfile(profile: UserProfile): void {
  const current = loadCachedProfiles();
  const next = [...current];
  const index = next.findIndex((item) => item.id === profile.id);
  if (index >= 0) {
    next[index] = profile;
  } else {
    next.push(profile);
  }
  saveCachedProfiles(next);
}

async function loadProfileByField(
  field: "user_id" | "email" | "login_id",
  value: string,
): Promise<UserProfile | null> {
  if (!value) {
    return null;
  }

  if (!isSupabaseEnabled()) {
    const cached = loadCachedProfiles();
    if (field === "user_id") {
      return cached.find((profile) => profile.id === value) ?? null;
    }

    if (field === "email") {
      return cached.find((profile) => profile.email.toLowerCase() === value.toLowerCase()) ?? null;
    }

    return cached.find((profile) => profile.loginId.toLowerCase() === value.toLowerCase()) ?? null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("user_profiles")
    .select("user_id, email, login_id, display_name, is_admin, memo, is_deleted, deleted_at, created_at, updated_at")
    .eq(field, value)
    .maybeSingle();

  if (error || !data) {
    return loadCachedProfiles().find((profile) => {
      if (field === "user_id") {
        return profile.id === value;
      }

      if (field === "email") {
        return profile.email.toLowerCase() === value.toLowerCase();
      }

      return profile.loginId.toLowerCase() === value.toLowerCase();
    }) ?? null;
  }

  const profile = normalizeProfile(data as UserProfileRow);
  cacheProfile(profile);
  return profile;
}

async function assertLoginIdAvailable(loginId: string, userId?: string): Promise<void> {
  const normalizedLoginId = loginId.trim().toLowerCase();
  if (!normalizedLoginId) {
    return;
  }

  const existing = await loadProfileByField("login_id", normalizedLoginId);
  if (existing && existing.id !== userId) {
    throw new Error("이미 사용 중인 아이디입니다.");
  }
}

export async function getProfileById(userId: string): Promise<UserProfile | null> {
  if (!userId) {
    return null;
  }

  return loadProfileByField("user_id", userId);
}

export async function getProfileByIdentifier(identifier: string): Promise<UserProfile | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.includes("@")
    ? loadProfileByField("email", normalized)
    : loadProfileByField("login_id", normalized);
}

export async function ensureUserProfile(input: {
  identity: AuthIdentity;
  loginId?: string;
  displayName?: string;
}): Promise<UserProfile> {
  const identityEmail = input.identity.email.toLowerCase();
  const current =
    (await getProfileById(input.identity.id)) ??
    (await loadProfileByField("email", identityEmail));
  const nextLoginId =
    input.loginId?.trim().toLowerCase() ||
    current?.loginId ||
    identityEmail.split("@")[0];

  await assertLoginIdAvailable(nextLoginId, input.identity.id);

  const profile: UserProfile = {
    id: input.identity.id,
    email: identityEmail,
    loginId: nextLoginId,
    displayName: input.displayName?.trim() || current?.displayName || identityEmail.split("@")[0],
    isAdmin: current?.isAdmin ?? false,
    memo: current?.memo ?? "",
    isDeleted: current?.isDeleted ?? false,
    deletedAt: current?.deletedAt ?? null,
    createdAt: current?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  cacheProfile(profile);

  if (!isSupabaseEnabled()) {
    return profile;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase!.from("user_profiles").upsert(
    {
      user_id: profile.id,
      email: profile.email,
      login_id: profile.loginId,
      display_name: profile.displayName,
      is_admin: profile.isAdmin,
      memo: profile.memo,
      is_deleted: profile.isDeleted,
      deleted_at: profile.deletedAt ?? null,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return profile;
}

export async function listProfiles(): Promise<UserProfile[]> {
  if (!isSupabaseEnabled()) {
    return loadCachedProfiles();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("user_profiles")
    .select("user_id, email, login_id, display_name, is_admin, memo, is_deleted, deleted_at, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    return loadCachedProfiles();
  }

  const profiles = data.map((row) => normalizeProfile(row as UserProfileRow));
  saveCachedProfiles(profiles);
  return profiles;
}

export async function updateUserMemo(userId: string, memo: string): Promise<UserProfile | null> {
  const current = await getProfileById(userId);
  if (!current) {
    return null;
  }

  const nextProfile = {
    ...current,
    memo,
    updatedAt: new Date().toISOString(),
  };
  cacheProfile(nextProfile);

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    await supabase!
      .from("user_profiles")
      .update({ memo, updated_at: nextProfile.updatedAt })
      .eq("user_id", userId);
  }

  return nextProfile;
}

export async function softDeleteUserProfile(userId: string): Promise<UserProfile | null> {
  const current = await getProfileById(userId);
  if (!current) {
    return null;
  }

  const nextProfile = {
    ...current,
    displayName: current.displayName ? `${current.displayName} (삭제)` : "Deleted User",
    email: current.email,
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  cacheProfile(nextProfile);

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    await supabase!
      .from("user_profiles")
      .update({
        display_name: nextProfile.displayName,
        is_deleted: true,
        deleted_at: nextProfile.deletedAt,
        updated_at: nextProfile.updatedAt,
      })
      .eq("user_id", userId);
  }

  return nextProfile;
}
