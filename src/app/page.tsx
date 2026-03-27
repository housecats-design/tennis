"use client";

import {
  checkEmailAvailability,
  checkLoginIdAvailability,
  getCurrentProfile,
  isValidLoginId,
  requestPasswordReset,
  signInAccount,
  signOutAccount,
  signUpAccount,
  subscribeAuthChanges,
} from "@/lib/auth";
import { loadLastRole, saveLastRole } from "@/lib/storage";
import { AuthMode, AppRole, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type FieldStatus = "idle" | "checking" | "available" | "taken";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [realName, setRealName] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginIdValidation, setLoginIdValidation] = useState<string | null>(null);
  const [loginIdStatus, setLoginIdStatus] = useState<FieldStatus>("idle");
  const [emailValidation, setEmailValidation] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<FieldStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const sync = async () => {
      setProfile(await getCurrentProfile());
      setAuthLoading(false);
    };

    void sync();
    const unsubscribe = subscribeAuthChanges(() => {
      void sync();
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const nextProfile = await signInAccount(identifier, password);
        setProfile(nextProfile);
        setInfo("로그인되었습니다. 역할을 선택해 이동하세요.");
      } else {
        const normalizedLoginId = loginId.trim().toLowerCase();
        const normalizedEmail = email.trim().toLowerCase();
        const loginIdAvailable = await runLoginIdDuplicateCheck(normalizedLoginId);
        if (!loginIdAvailable) {
          throw new Error(loginIdValidation ?? "이미 사용 중인 아이디입니다.");
        }

        const emailAvailable = await runEmailDuplicateCheck(normalizedEmail);
        if (!emailAvailable) {
          throw new Error(emailValidation ?? "이미 가입된 이메일입니다.");
        }

        const nextProfile = await signUpAccount({
          loginId: normalizedLoginId,
          email: normalizedEmail,
          realName,
          nickname,
          password,
          confirmPassword,
        });
        setProfile(nextProfile);
        window.alert("회원가입이 완료되었습니다.");
        router.replace("/");
        setInfo("회원가입이 완료되었습니다. 역할을 선택해 이동하세요.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "인증 처리에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset(): Promise<void> {
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      await requestPasswordReset(identifier);
      setInfo("비밀번호 재설정 메일을 보냈습니다. 메일의 링크에서 새 비밀번호를 설정해 주세요.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "비밀번호 재설정 메일 전송에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRoleSelect(role: AppRole): void {
    saveLastRole(role);
    router.push(role === "host" ? "/host" : "/guest");
  }

  const lastRole = loadLastRole();

  function handleLoginIdChange(value: string): void {
    const sanitized = value.replace(/[^A-Za-z0-9]/g, "");
    setLoginId(sanitized);
    setLoginIdStatus("idle");

    if (!value.trim()) {
      setLoginIdValidation(null);
      return;
    }

    if (sanitized !== value || !isValidLoginId(sanitized)) {
      setLoginIdValidation("아이디는 영문과 숫자만 사용할 수 있습니다.");
      return;
    }

    setLoginIdValidation(null);
  }

  async function runLoginIdDuplicateCheck(value: string): Promise<boolean> {
    const normalizedLoginId = value.trim().toLowerCase();
    if (!normalizedLoginId) {
      setLoginIdValidation(null);
      setLoginIdStatus("idle");
      return false;
    }

    if (!isValidLoginId(normalizedLoginId)) {
      setLoginIdValidation("아이디는 영문과 숫자만 사용할 수 있습니다.");
      setLoginIdStatus("taken");
      return false;
    }

    setLoginIdStatus("checking");
    const available = await checkLoginIdAvailability(normalizedLoginId);
    if (available) {
      setLoginIdValidation("사용 가능한 아이디입니다.");
      setLoginIdStatus("available");
      return true;
    }

    setLoginIdValidation("이미 사용 중인 아이디입니다.");
    setLoginIdStatus("taken");
    return false;
  }

  async function runEmailDuplicateCheck(value: string): Promise<boolean> {
    const normalizedEmail = value.trim().toLowerCase();
    setEmail(normalizedEmail);

    if (!normalizedEmail) {
      setEmailValidation(null);
      setEmailStatus("idle");
      return false;
    }

    setEmailStatus("checking");
    const available = await checkEmailAvailability(normalizedEmail);
    if (available) {
      setEmailValidation("사용 가능한 이메일입니다.");
      setEmailStatus("available");
      return true;
    }

    setEmailValidation("이미 가입된 이메일입니다.");
    setEmailStatus("taken");
    return false;
  }

  return (
    <main className="poster-page flex min-h-screen items-start py-12">
      <section className="grid w-full gap-10 border-t border-line py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="poster-label">Tennis Match Scheduler</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-black tracking-[-0.04em] text-ink sm:text-6xl">
            Club Operation,
            <br />
            Match History,
            <br />
            Final Ranking
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-ink/68">
            계정 로그인 후 호스트와 플레이어 역할을 선택해 이벤트 생성, 참가, 저장 이력,
            최종 랭킹, 관리자 통계를 하나의 흐름으로 운영합니다.
          </p>

          {profile ? (
            <div className="mt-8 border-t border-line pt-6">
              <div className="text-sm text-ink/70">
                로그인됨: <span className="font-semibold text-ink">{profile.displayName}</span> · {profile.email}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => handleRoleSelect("host")} className="poster-button">
                  호스트
                </button>
                <button type="button" onClick={() => handleRoleSelect("player")} className="poster-button-secondary">
                  플레이어
                </button>
                <Link href="/history/host" className="poster-button-secondary">
                  호스트 이력
                </Link>
                <Link href="/history/player" className="poster-button-secondary">
                  내 기록
                </Link>
                {profile.isAdmin ? (
                  <Link href="/admin" className="poster-button-secondary">
                    관리자
                  </Link>
                ) : null}
                <button type="button" onClick={() => void signOutAccount()} className="poster-button-secondary">
                  로그아웃
                </button>
              </div>
              {lastRole ? (
                <div className="mt-4 text-xs text-ink/55">최근 선택 역할: {lastRole === "host" ? "호스트" : "플레이어"}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!profile && !authLoading ? (
          <form onSubmit={handleSubmit} className="grid gap-5 border-y border-line py-8">
            <div className="flex gap-3 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={mode === "login" ? "border-b border-accentStrong pb-1 text-accentStrong" : "pb-1 text-ink/55"}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={mode === "signup" ? "border-b border-accentStrong pb-1 text-accentStrong" : "pb-1 text-ink/55"}
              >
                회원가입
              </button>
            </div>

            {mode === "login" ? (
              <>
                <label className="grid gap-2 text-sm font-semibold">
                  이메일
                  <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="poster-input" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  비밀번호
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="poster-input" />
                </label>
                <button
                  type="button"
                  onClick={() => void handlePasswordReset()}
                  disabled={submitting}
                  className="w-fit text-sm font-semibold text-accentStrong disabled:opacity-60"
                >
                  비밀번호 재설정 메일 보내기
                </button>
              </>
            ) : (
              <>
                <label className="grid gap-2 text-sm font-semibold">
                  이름
                  <input value={realName} onChange={(event) => setRealName(event.target.value)} className="poster-input" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  별명
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="poster-input" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  아이디
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={loginId}
                      onChange={(event) => handleLoginIdChange(event.target.value)}
                      className="poster-input"
                    />
                    <button
                      type="button"
                      onClick={() => void runLoginIdDuplicateCheck(loginId)}
                      disabled={!loginId.trim() || loginIdStatus === "checking"}
                      className="poster-button-secondary whitespace-nowrap disabled:opacity-60"
                    >
                      {loginIdStatus === "checking" ? "확인 중..." : "중복 확인"}
                    </button>
                  </div>
                  {loginIdStatus === "checking" ? <span className="text-xs font-medium text-ink/60">아이디를 확인하는 중...</span> : null}
                  {loginIdValidation ? (
                    <span className={`text-xs font-medium ${loginIdStatus === "available" ? "text-accentStrong" : "text-red-700"}`}>
                      {loginIdValidation}
                    </span>
                  ) : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  이메일
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailStatus("idle");
                        setEmailValidation(null);
                      }}
                      className="poster-input"
                    />
                    <button
                      type="button"
                      onClick={() => void runEmailDuplicateCheck(email)}
                      disabled={!email.trim() || emailStatus === "checking"}
                      className="poster-button-secondary whitespace-nowrap disabled:opacity-60"
                    >
                      {emailStatus === "checking" ? "확인 중..." : "중복 확인"}
                    </button>
                  </div>
                  {emailStatus === "checking" ? <span className="text-xs font-medium text-ink/60">이메일을 확인하는 중...</span> : null}
                  {emailValidation ? (
                    <span className={`text-xs font-medium ${emailStatus === "available" ? "text-accentStrong" : "text-red-700"}`}>
                      {emailValidation}
                    </span>
                  ) : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  비밀번호
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="poster-input" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  비밀번호 확인
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="poster-input" />
                </label>
              </>
            )}

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {info ? <div className="border-l-2 border-accentStrong pl-4 text-sm text-ink/72">{info}</div> : null}

            <button type="submit" disabled={submitting} className="poster-button w-fit disabled:opacity-60">
              {submitting ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
            </button>
          </form>
        ) : null}
        {!profile && authLoading ? <div className="border-y border-line py-8 text-sm text-ink/70">세션을 확인하는 중...</div> : null}
      </section>
    </main>
  );
}
