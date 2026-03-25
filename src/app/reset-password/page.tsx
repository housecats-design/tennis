"use client";

import { establishRecoverySession, updateAccountPassword } from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prepare = async () => {
      try {
        console.info("[reset-password] establishing recovery session");
        await establishRecoverySession();
        setSessionReady(true);
      } catch (sessionError) {
        console.error("[reset-password] failed", sessionError);
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "재설정 링크가 유효하지 않거나 만료되었습니다.",
        );
      } finally {
        setLoading(false);
      }
    };

    void prepare();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      await updateAccountPassword(password, confirmPassword);
      setSuccess("비밀번호가 변경되었습니다. 로그인 화면으로 이동합니다.");
      window.setTimeout(() => {
        router.replace("/");
      }, 1600);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="poster-page flex min-h-screen items-start py-12">
      <section className="w-full max-w-2xl border-t border-line py-10">
        <p className="poster-label">Password Recovery</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] text-ink sm:text-5xl">
          새 비밀번호 설정
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-ink/68">
          복구 링크가 유효하면 새 비밀번호를 입력하고 저장할 수 있습니다.
        </p>

        {loading ? (
          <div className="mt-8 border-t border-line pt-6 text-sm text-ink/70">복구 세션을 확인하는 중...</div>
        ) : null}

        {!loading && error ? (
          <div className="mt-8 border-l-2 border-red-300 pl-4 text-sm text-red-700">
            {error}
            <div className="mt-3">
              <Link href="/" className="font-semibold text-accentStrong">
                로그인 화면으로 돌아가기
              </Link>
            </div>
          </div>
        ) : null}

        {!loading && sessionReady ? (
          <form onSubmit={handleSubmit} className="mt-8 grid gap-5 border-y border-line py-8">
            <label className="grid gap-2 text-sm font-semibold">
              새 비밀번호
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="poster-input"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              비밀번호 확인
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="poster-input"
              />
            </label>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {success ? <div className="border-l-2 border-accentStrong pl-4 text-sm text-ink/72">{success}</div> : null}

            <button type="submit" disabled={submitting} className="poster-button w-fit disabled:opacity-60">
              {submitting ? "저장 중..." : "새 비밀번호 저장"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
