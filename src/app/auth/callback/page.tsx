"use client";

import { getAppUrl, getHostIdentity } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = searchParams.get("next") || "/host";

    const completeAuth = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError("Supabase 설정이 없습니다.");
          return;
        }

        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has("code")) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) {
            throw error;
          }
        }

        const identity = await getHostIdentity();
        if (!identity) {
          throw new Error("로그인 세션을 확인하지 못했습니다.");
        }

        router.replace(next);
      } catch (error) {
        console.error("[auth-callback] failed", error);
        setError(error instanceof Error ? error.message : "인증 처리에 실패했습니다.");
      }
    };

    void completeAuth();
  }, [router, searchParams]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="rounded-3xl border border-line bg-white/90 p-8 text-center shadow-panel">
        <h1 className="text-3xl font-black">로그인 처리 중입니다.</h1>
        <p className="mt-3 text-sm text-ink/70">
          잠시만 기다려 주세요. 인증이 끝나면 자동으로 이동합니다.
        </p>
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <div className="mt-2 text-xs text-ink/70">{getAppUrl()}/host 로 직접 접속해 다시 시도할 수 있습니다.</div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink/70">인증 정보를 확인하는 중...</main>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
