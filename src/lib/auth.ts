import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

export type HostIdentity = {
  id: string;
  email?: string | null;
};

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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/host`,
    },
  });

  if (error) {
    throw error;
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
