import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

const DEFAULT_APP_URL = "https://tennis-match-scheduler-nu.vercel.app";

export type HostIdentity = {
  id: string;
  email?: string | null;
};

export function getAppUrl(): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const windowOrigin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    configuredAppUrl ||
    (windowOrigin && !windowOrigin.includes("localhost") ? windowOrigin : DEFAULT_APP_URL)
  );
}

function formatAuthError(error: { message?: string; status?: number } | null): Error {
  const message = error?.message ?? "";

  if (message.toLowerCase().includes("email rate limit")) {
    return new Error("로그인 메일 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (message.toLowerCase().includes("smtp") || message.toLowerCase().includes("email")) {
    return new Error("로그인 메일을 보내지 못했습니다. Supabase SMTP 또는 발신 도메인 설정을 확인해 주세요.");
  }

  return new Error(message || "로그인 메일 전송에 실패했습니다.");
}

export async function getHostIdentity(): Promise<HostIdentity | null> {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user
    ? {
        id: user.id,
        email: user.email,
      }
    : null;
}

export async function signInHost(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("올바른 이메일 주소를 입력해 주세요.");
  }

  const appUrl = getAppUrl();
  const redirectUrl = `${appUrl}/auth/callback?next=/host`;

  console.debug("[auth] signInHost redirect", { appUrl, redirectUrl });

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirectUrl,
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw formatAuthError(error);
  }
}

export async function signOutHost(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
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
