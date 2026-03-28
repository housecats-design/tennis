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
import { getReturnableParticipant, joinEvent, loadEvent, loadReturnableParticipationSession, loadUserInvitations, updateInvitationStatus } from "@/lib/events";
import {
  clearLastParticipation,
  clearPostLoginRedirect,
  loadLastEvent,
  loadLastParticipant,
  loadLastRole,
  loadPostLoginRedirect,
  saveLastEvent,
  saveLastParticipant,
  saveLastRole,
} from "@/lib/storage";
import { AuthMode, AppRole, Invitation, ParticipantGender, UserProfile } from "@/lib/types";
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
  const [gender, setGender] = useState<ParticipantGender | "">("");
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
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [resumeRoute, setResumeRoute] = useState<string | null>(null);
  const pendingInvitation = invitations.find((invitation) => invitation.status === "pending") ?? null;

  function formatNotificationTime(value: string): string {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 60) {
      return `${Math.max(diffMinutes, 0)}분 전`;
    }

    const sameDate = now.toDateString() === date.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.toDateString() === date.toDateString();

    if (sameDate) {
      return `오늘 ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    }

    if (isYesterday) {
      return `어제 ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    }

    return date.toLocaleString("ko-KR");
  }

  useEffect(() => {
    const sync = async () => {
      const nextProfile = await getCurrentProfile();
      setProfile(nextProfile);
      if (nextProfile?.id) {
        setInvitations(await loadUserInvitations(nextProfile.id));
        const activeSession = await loadReturnableParticipationSession(nextProfile.id);
        if (activeSession) {
          saveLastEvent(activeSession.event.id);
          saveLastParticipant(activeSession.participant.id);
          setResumeRoute(
            activeSession.participant.role === "host"
              ? `/host/event/${activeSession.event.id}`
              : `/guest/event/${activeSession.event.id}`,
          );
        } else {
          const lastEventId = loadLastEvent();
          const lastParticipantId = loadLastParticipant();
          const lastEvent = lastEventId ? await loadEvent(lastEventId) : null;
          const returnableParticipant = getReturnableParticipant(lastEvent, {
            userId: nextProfile.id,
            participantId: lastParticipantId,
          });
          const canResume = Boolean(returnableParticipant && lastEvent);
          if (!canResume) {
            clearLastParticipation();
          }
          setResumeRoute(
            canResume && lastEvent
              ? returnableParticipant?.role === "host"
                ? `/host/event/${lastEvent.id}`
                : `/guest/event/${lastEvent.id}`
              : null,
          );
        }
      } else {
        setInvitations([]);
        setResumeRoute(null);
      }
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

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadUserInvitations(profile.id).then(setInvitations);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [profile?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const nextProfile = await signInAccount(identifier, password);
        setProfile(nextProfile);
        setInvitations(await loadUserInvitations(nextProfile.id));
        const redirectUrl = loadPostLoginRedirect();
        if (redirectUrl) {
          clearPostLoginRedirect();
          router.replace(redirectUrl);
          return;
        }
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
          gender: gender as "male" | "female",
          password,
          confirmPassword,
        });
        setProfile(nextProfile);
        setInvitations(await loadUserInvitations(nextProfile.id));
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
    if (role === "host") {
      router.push(resumeRoute?.startsWith("/host/") ? resumeRoute : "/host");
      return;
    }

    if (resumeRoute?.startsWith("/guest/") && window.confirm("이전 라운드가 아직 종료되지 않았습니다. 이어서 참가하시겠습니까?")) {
      router.push(resumeRoute);
      return;
    }

    router.push("/guest");
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

  async function handleInvitationResponse(invitation: Invitation, response: "accept" | "decline"): Promise<void> {
    if (!profile) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (response === "decline") {
        await updateInvitationStatus(invitation.eventId, invitation.id, "declined");
        setInvitations(await loadUserInvitations(profile.id));
        setInfo("초대를 거절했습니다.");
        return;
      }

      if (profile.gender === "unspecified") {
        setError("초대를 수락하려면 먼저 프로필 설정에서 성별을 입력해 주세요.");
        router.push("/profile");
        return;
      }

      const participant = await joinEvent(invitation.eventId, {
        displayName: profile.displayName,
        gender: profile.gender,
        guestNtrp: profile.defaultNtrp ?? null,
        userId: profile.id,
        inviteId: invitation.id,
      });
      if (!participant) {
        throw new Error("이벤트 참여에 실패했습니다.");
      }

      saveLastEvent(invitation.eventId);
      saveLastParticipant(participant.id);
      await updateInvitationStatus(invitation.eventId, invitation.id, "accepted");
      setInvitations(await loadUserInvitations(profile.id));
      router.push(`/guest/event/${invitation.eventId}`);
    } catch (invitationError) {
      setError(invitationError instanceof Error ? invitationError.message : "초대 처리에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="poster-page flex min-h-screen items-start py-12">
      <section className="grid w-full gap-10 border-t border-line py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="poster-label">Tennis Match Scheduler</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-black tracking-[-0.04em] text-ink sm:text-6xl">
            메인 페이지
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-ink/68">
            계정 로그인 후 메인 페이지에서 호스트와 플레이어 역할을 선택해 이벤트 생성, 참가,
            저장 이력, 최종 랭킹, 관리자 통계, 클럽 기능을 하나의 흐름으로 운영합니다.
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
                <Link href="/profile" className="poster-button-secondary">
                  프로필 설정
                </Link>
                <Link href="/clubs" className="poster-button-secondary">
                  클럽
                </Link>
                {resumeRoute ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("이전 라운드가 아직 종료되지 않았습니다. 이어서 참가하시겠습니까?")) {
                        router.push(resumeRoute);
                      }
                    }}
                    className="poster-button-secondary"
                  >
                    진행중인 경기로 돌아가기
                  </button>
                ) : null}
                <button type="button" onClick={() => void signOutAccount()} className="poster-button-secondary">
                  로그아웃
                </button>
              </div>
              {lastRole ? (
                <div className="mt-4 text-xs text-ink/55">메인 페이지 최근 선택 역할: {lastRole === "host" ? "호스트" : "플레이어"}</div>
              ) : null}
              <div className="mt-8 border-t border-line pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-xl font-black">최근 초대 및 중요 알림 <span className="text-accentStrong">[{invitations.length}]</span></div>
                </div>
                <div className="mt-4 space-y-3">
                  {invitations.length > 0 ? invitations.slice(0, 6).map((invitation) => (
                    <div key={invitation.id} className="border-b border-line py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">
                          {invitation.status === "pending" ? "초대 도착" : invitation.status === "accepted" ? "초대 수락" : invitation.status === "declined" ? "초대 거절" : "초대 만료"}
                        </div>
                        <div className="text-xs text-ink/55">{formatNotificationTime(invitation.createdAt)}</div>
                      </div>
                      <div className="mt-1 text-ink/80">{invitation.eventName}</div>
                      <div className="mt-1 text-xs text-ink/55">{invitation.status === "pending" ? "읽지 않음" : "읽음"}</div>
                    </div>
                  )) : (
                    <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">최근 초대 및 중요 알림이 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {profile && pendingInvitation ? (
          <div className="border border-accentStrong/25 bg-surface p-5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accentStrong">Invitation</div>
            <div className="mt-3 text-lg font-black">Host {pendingInvitation.invitedByName} invited you. Do you want to accept?</div>
            <div className="mt-2 text-ink/70">{pendingInvitation.eventName} · 코드 {pendingInvitation.code}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => void handleInvitationResponse(pendingInvitation, "accept")} className="poster-button">
                수락
              </button>
              <button type="button" onClick={() => void handleInvitationResponse(pendingInvitation, "decline")} className="poster-button-secondary">
                거절
              </button>
            </div>
          </div>
        ) : null}

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
                  성별
                  <select value={gender} onChange={(event) => setGender(event.target.value as ParticipantGender)} className="poster-input">
                    <option value="">선택</option>
                    <option value="male">남자</option>
                    <option value="female">여자</option>
                  </select>
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
