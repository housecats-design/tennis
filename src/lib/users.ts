"use client";

import { AuthIdentity, UserProfile } from "@/lib/types";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

const USER_PROFILES_STORAGE_KEY = "tennis-user-profiles";

type UserProfileRow = {
  id: string;
  email: string;
  login_id: string;
  display_name: string;
  is_admin: boolean | null;
  memo: string | null;
  is_deleted: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

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

function normalizeProfile(row: Partial<UserProfileRow> & { id: string }): UserProfile {
  return {
    id: row.id,
    email: row.email ?? "",
    loginId: row.login_id ?? "",
    displayName: row.display_name ?? "",
    isAdmin: Boolean(row.is_admin),
    memo: row.memo ?? "",
    isDeleted: Boolean(row.is_deleted),
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

export async function getProfileById(userId: string): Promise<UserProfile | null> {
  if (!userId) {
    return null;
  }

  if (!isSupabaseEnabled()) {
    return loadCachedProfiles().find((profile) => profile.id === userId) ?? null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("user_profiles")
    .select("id, email, login_id, display_name, is_admin, memo, is_deleted, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return loadCachedProfiles().find((profile) => profile.id === userId) ?? null;
  }

  const profile = normalizeProfile(data as UserProfileRow);
  cacheProfile(profile);
  return profile;
}

export async function getProfileByIdentifier(identifier: string): Promise<UserProfile | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!isSupabaseEnabled()) {
    return (
      loadCachedProfiles().find(
        (profile) =>
          profile.email.toLowerCase() === normalized || profile.loginId.toLowerCase() === normalized,
      ) ?? null
    );
  }

  const supabase = getSupabaseClient();
  const query = supabase!
    .from("user_profiles")
    .select("id, email, login_id, display_name, is_admin, memo, is_deleted, created_at, updated_at");

  const { data, error } = normalized.includes("@")
    ? await query.eq("email", normalized).maybeSingle()
    : await query.eq("login_id", normalized).maybeSingle();

  if (error || !data) {
    return (
      loadCachedProfiles().find(
        (profile) =>
          profile.email.toLowerCase() === normalized || profile.loginId.toLowerCase() === normalized,
      ) ?? null
    );
  }

  const profile = normalizeProfile(data as UserProfileRow);
  cacheProfile(profile);
  return profile;
}

export async function ensureUserProfile(input: {
  identity: AuthIdentity;
  loginId?: string;
  displayName?: string;
}): Promise<UserProfile> {
  const current = await getProfileById(input.identity.id);
  const profile: UserProfile = {
    id: input.identity.id,
    email: input.identity.email.toLowerCase(),
    loginId: input.loginId?.trim().toLowerCase() || current?.loginId || input.identity.email.toLowerCase(),
    displayName: input.displayName?.trim() || current?.displayName || input.identity.email.split("@")[0],
    isAdmin: current?.isAdmin ?? false,
    memo: current?.memo ?? "",
    isDeleted: current?.isDeleted ?? false,
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
      id: profile.id,
      email: profile.email,
      login_id: profile.loginId,
      display_name: profile.displayName,
      is_admin: profile.isAdmin,
      memo: profile.memo,
      is_deleted: profile.isDeleted,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    },
    { onConflict: "id" },
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
    .select("id, email, login_id, display_name, is_admin, memo, is_deleted, created_at, updated_at")
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
      .eq("id", userId);
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
        updated_at: nextProfile.updatedAt,
      })
      .eq("id", userId);
  }

  return nextProfile;
}
