"use client";

import { AuthIdentity, ParticipantGender, UserProfile } from "@/lib/types";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

const USER_PROFILES_STORAGE_KEY = "tennis-user-profiles";

type UserProfileRow = {
  user_id?: string;
  id?: string;
  email: string;
  login_id: string;
  real_name?: string | null;
  nickname?: string | null;
  display_name: string;
  gender?: ParticipantGender | null;
  gender_locked_at?: string | null;
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

function isUserProfilesSchemaMismatch(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("schema cache") &&
    normalized.includes("user_profiles") &&
    (
      normalized.includes("nickname") ||
      normalized.includes("real_name") ||
      normalized.includes("display_name") ||
      normalized.includes("gender")
    )
  );
}

export function formatProfileDisplayName(realName?: string | null, nickname?: string | null, fallback?: string | null): string {
  const normalizedRealName = realName?.trim() ?? "";
  const normalizedNickname = nickname?.trim() ?? "";
  const normalizedFallback = fallback?.trim() ?? "";

  if (normalizedRealName && normalizedNickname) {
    return `${normalizedRealName}(${normalizedNickname})`;
  }

  if (normalizedRealName) {
    return normalizedRealName;
  }

  if (normalizedNickname) {
    return normalizedNickname;
  }

  return normalizedFallback;
}

function normalizeGender(value: string | null | undefined): ParticipantGender {
  return value === "male" || value === "female" || value === "other" ? value : "unspecified";
}

function normalizeProfile(row: Partial<UserProfileRow> & { user_id?: string; id?: string }): UserProfile {
  const resolvedUserId = row.user_id ?? row.id;
  if (!resolvedUserId) {
    throw new Error("user_profiles row is missing user_id");
  }

  const realName = row.real_name ?? "";
  const nickname = row.nickname ?? "";
  const displayName = formatProfileDisplayName(realName, nickname, row.display_name ?? row.login_id ?? row.email ?? "");

  return {
    id: resolvedUserId,
    email: row.email ?? "",
    loginId: row.login_id ?? "",
    realName,
    nickname,
    displayName,
    gender: normalizeGender(row.gender as string | null | undefined),
    genderLockedAt: row.gender_locked_at ?? null,
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
    .select("user_id, email, login_id, real_name, nickname, display_name, gender, gender_locked_at, is_admin, memo, is_deleted, deleted_at, created_at, updated_at")
    .eq(field, value)
    .maybeSingle();

  if (error && isUserProfilesSchemaMismatch(error.message)) {
    throw new Error("Supabase user_profiles 스키마가 최신 앱 구조와 다릅니다. real_name, nickname, display_name 컬럼 마이그레이션이 필요합니다.");
  }

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

export async function isLoginIdTaken(loginId: string, userId?: string): Promise<boolean> {
  const normalizedLoginId = loginId.trim().toLowerCase();
  if (!normalizedLoginId) {
    return false;
  }

  const existing = await loadProfileByField("login_id", normalizedLoginId);
  return Boolean(existing && existing.id !== userId);
}

export async function isEmailTaken(email: string, userId?: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const existing = await loadProfileByField("email", normalizedEmail);
  return Boolean(existing && existing.id !== userId);
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
  realName?: string;
  nickname?: string;
  gender?: ParticipantGender;
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

  const nextRealName = input.realName?.trim() || current?.realName || identityEmail.split("@")[0];
  const nextNickname = input.nickname?.trim() || current?.nickname || "";
  const nextDisplayName = formatProfileDisplayName(
    nextRealName,
    nextNickname,
    input.displayName?.trim() || current?.displayName || identityEmail.split("@")[0],
  );

  const profile: UserProfile = {
    id: input.identity.id,
    email: identityEmail,
    loginId: nextLoginId,
    realName: nextRealName,
    nickname: nextNickname,
    displayName: nextDisplayName,
    gender: current?.gender ?? normalizeGender(input.gender),
    genderLockedAt: current?.genderLockedAt ?? (input.gender && input.gender !== "unspecified" ? new Date().toISOString() : null),
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
  const profileRow = {
    id: profile.id,
    user_id: profile.id,
    email: profile.email,
    login_id: profile.loginId,
    real_name: profile.realName,
    nickname: profile.nickname,
    display_name: profile.displayName,
    gender: profile.gender,
    gender_locked_at: profile.genderLockedAt ?? null,
    is_admin: profile.isAdmin,
    memo: profile.memo,
    is_deleted: profile.isDeleted,
    deleted_at: profile.deletedAt ?? null,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };

  let error: { message?: string } | null = null;

  const primaryAttempt = await supabase!.from("user_profiles").upsert(profileRow, {
    onConflict: "user_id",
  });
  error = primaryAttempt.error;

  if (error?.message?.toLowerCase().includes("column") && error.message.includes("id")) {
    const fallbackWithoutLegacyId = await supabase!.from("user_profiles").upsert(
      {
        user_id: profile.id,
        email: profile.email,
        login_id: profile.loginId,
        real_name: profile.realName,
        nickname: profile.nickname,
        display_name: profile.displayName,
        gender: profile.gender,
        gender_locked_at: profile.genderLockedAt ?? null,
        is_admin: profile.isAdmin,
        memo: profile.memo,
        is_deleted: profile.isDeleted,
        deleted_at: profile.deletedAt ?? null,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt,
      },
      { onConflict: "user_id" },
    );
    error = fallbackWithoutLegacyId.error;
  }

  if (
    error?.message?.toLowerCase().includes("there is no unique or exclusion constraint matching the on conflict specification")
  ) {
    const fallbackLegacyId = await supabase!.from("user_profiles").upsert(profileRow, {
      onConflict: "id",
    });
    error = fallbackLegacyId.error;
  }

  if (error) {
    if (isUserProfilesSchemaMismatch(error.message ?? "")) {
      throw new Error("Supabase user_profiles 스키마가 최신 앱 구조와 다릅니다. real_name, nickname, display_name 컬럼을 먼저 추가해 주세요.");
    }
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
    .select("user_id, email, login_id, real_name, nickname, display_name, gender, gender_locked_at, is_admin, memo, is_deleted, deleted_at, created_at, updated_at")
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

export async function updateProfileSettings(
  userId: string,
  input: { nickname?: string; gender?: ParticipantGender },
): Promise<UserProfile | null> {
  const current = await getProfileById(userId);
  if (!current) {
    return null;
  }

  if (input.gender && input.gender !== "unspecified" && current.gender !== "unspecified" && current.genderLockedAt) {
    throw new Error("성별은 한 번만 설정할 수 있습니다. 변경이 필요하면 관리자에게 문의해 주세요.");
  }

  const nextNickname = input.nickname?.trim() ?? current.nickname;
  const nextGender = input.gender && input.gender !== "unspecified" ? input.gender : current.gender;
  const nextProfile = {
    ...current,
    nickname: nextNickname,
    displayName: formatProfileDisplayName(current.realName, nextNickname, current.displayName),
    gender: nextGender,
    genderLockedAt:
      nextGender !== "unspecified"
        ? current.genderLockedAt ?? new Date().toISOString()
        : current.genderLockedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
  cacheProfile(nextProfile);

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    await supabase!
      .from("user_profiles")
      .update({
        nickname: nextProfile.nickname,
        display_name: nextProfile.displayName,
        gender: nextProfile.gender,
        gender_locked_at: nextProfile.genderLockedAt ?? null,
        updated_at: nextProfile.updatedAt,
      })
      .eq("user_id", userId);
  }

  return nextProfile;
}

export async function adminUpdateUserGender(
  adminUserId: string,
  targetUserId: string,
  gender: ParticipantGender,
): Promise<UserProfile | null> {
  const current = await getProfileById(targetUserId);
  if (!current) {
    return null;
  }

  const nextProfile = {
    ...current,
    gender,
    genderLockedAt: current.genderLockedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  cacheProfile(nextProfile);

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    await supabase!
      .from("user_profiles")
      .update({
        gender,
        gender_locked_at: nextProfile.genderLockedAt ?? null,
        updated_at: nextProfile.updatedAt,
      })
      .eq("user_id", targetUserId);

    await supabase!.from("admin_audit_logs").insert({
      id: `audit_${crypto.randomUUID().slice(0, 8)}`,
      admin_user_id: adminUserId,
      target_user_id: targetUserId,
      action: "update_gender",
      previous_value: current.gender,
      next_value: gender,
      created_at: new Date().toISOString(),
    });
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
