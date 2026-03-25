"use client";

import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import { AuthIdentity, UserProfile } from "@/lib/types";
import { ensureUserProfile, getProfileByIdentifier, getProfileById } from "@/lib/users";

const DEFAULT_APP_URL = "https://tennis-match-scheduler-nu.vercel.app";

export function getAppUrl(): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const windowOrigin = typeof window !== "undefined" ? window.location.origin : "";

  return configuredAppUrl || (windowOrigin && !windowOrigin.includes("localhost") ? windowOrigin : DEFAULT_APP_URL);
}

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  }
  return supabase;
}

function formatAuthError(error: { message?: string } | null): Error {
  const message = error?.message ?? "";
  if (message.toLowerCase().includes("invalid login credentials")) {
    return new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  if (message.toLowerCase().includes("user already registered")) {
    return new Error("이미 가입된 이메일입니다.");
  }

  return new Error(message || "인증 처리에 실패했습니다.");
}

export async function getAuthIdentity(): Promise<AuthIdentity | null> {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const supabase = requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const identity = await getAuthIdentity();
  if (!identity) {
    return null;
  }

  const current = await getProfileById(identity.id);
  if (current) {
    return current;
  }

  return ensureUserProfile({
    identity,
    loginId: identity.email.split("@")[0],
    displayName: identity.email.split("@")[0],
  });
}

export async function signUpAccount(input: {
  loginId: string;
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}): Promise<UserProfile> {
  const loginId = input.loginId.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  if (!loginId || !email || !input.password || !displayName) {
    throw new Error("아이디, 이메일, 이름, 비밀번호를 모두 입력해 주세요.");
  }

  if (input.password !== input.confirmPassword) {
    throw new Error("비밀번호 확인이 일치하지 않습니다.");
  }

  const existingLoginId = await getProfileByIdentifier(loginId);
  if (existingLoginId?.loginId === loginId) {
    throw new Error("이미 사용 중인 아이디입니다.");
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
  });

  if (error || !data.user?.id) {
    throw formatAuthError(error);
  }

  const profile = await ensureUserProfile({
    identity: { id: data.user.id, email },
    loginId,
    displayName,
  });

  return profile;
}

export async function signInAccount(identifier: string, password: string): Promise<UserProfile> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier || !password) {
    throw new Error("아이디 또는 이메일과 비밀번호를 입력해 주세요.");
  }

  const profile = normalizedIdentifier.includes("@")
    ? await getProfileByIdentifier(normalizedIdentifier)
    : await getProfileByIdentifier(normalizedIdentifier);
  const email = normalizedIdentifier.includes("@")
    ? normalizedIdentifier
    : profile?.email ?? "";

  if (!email) {
    throw new Error("가입된 아이디 또는 이메일을 찾을 수 없습니다.");
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user?.email) {
    throw formatAuthError(error);
  }

  return ensureUserProfile({
    identity: { id: data.user.id, email: data.user.email },
    loginId: profile?.loginId,
    displayName: profile?.displayName,
  });
}

export async function signOutAccount(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier) {
    throw new Error("아이디 또는 이메일을 입력해 주세요.");
  }

  const profile = normalizedIdentifier.includes("@")
    ? await getProfileByIdentifier(normalizedIdentifier)
    : await getProfileByIdentifier(normalizedIdentifier);
  const email = normalizedIdentifier.includes("@")
    ? normalizedIdentifier
    : profile?.email ?? "";

  if (!email) {
    throw new Error("가입된 아이디 또는 이메일을 찾을 수 없습니다.");
  }

  const supabase = requireSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${DEFAULT_APP_URL}/reset-password`,
  });

  if (error) {
    throw formatAuthError(error);
  }
}

export async function establishRecoverySession(): Promise<void> {
  const supabase = requireSupabase();
  const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const errorDescription = hashParams.get("error_description");

  if (errorDescription) {
    throw new Error(decodeURIComponent(errorDescription));
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw formatAuthError(error);
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("유효하지 않거나 만료된 재설정 링크입니다.");
  }
}

export async function updateAccountPassword(newPassword: string, confirmPassword: string): Promise<void> {
  if (!newPassword || !confirmPassword) {
    throw new Error("새 비밀번호와 확인 비밀번호를 모두 입력해 주세요.");
  }

  if (newPassword !== confirmPassword) {
    throw new Error("비밀번호 확인이 일치하지 않습니다.");
  }

  if (newPassword.length < 6) {
    throw new Error("비밀번호는 6자 이상이어야 합니다.");
  }

  const supabase = requireSupabase();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw formatAuthError(error);
  }
}

export function subscribeAuthChanges(callback: () => void): (() => void) | null {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => callback());

  return () => subscription.unsubscribe();
}
