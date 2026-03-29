"use client";

import { getCurrentProfile } from "@/lib/auth";
import { getClubById, listMyClubMemberships } from "@/lib/clubs";
import { findEventByCodeOrName, getInvitationById, joinEvent, loadEvent, loadReturnableParticipationSession } from "@/lib/events";
import { saveLastEvent, saveLastParticipant, savePostLoginRedirect } from "@/lib/storage";
import { ParticipantGender, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const NTRP_OPTIONS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export default function GuestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<ParticipantGender | "">("");
  const [guestNtrp, setGuestNtrp] = useState(3.5);
  const [joinedAsClubId, setJoinedAsClubId] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const sync = async () => {
      const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const hasDirectEventTarget = Boolean(searchParams?.get("eventId") || searchParams?.get("invite"));
      const currentProfile = await getCurrentProfile();
      setProfile(currentProfile);
      setDisplayName(currentProfile?.displayName ?? "");
      setGender(currentProfile?.gender && currentProfile.gender !== "unspecified" ? currentProfile.gender : "");
      setGuestNtrp(currentProfile?.defaultNtrp ?? 3.5);
      if (currentProfile?.id) {
        const memberships = await listMyClubMemberships(currentProfile.id);
        const approvedMemberships = memberships.filter((membership) => membership.membershipStatus === "approved" && membership.leftAt == null);
        const clubs = await Promise.all(
          approvedMemberships.map(async (membership) => {
            const club = await getClubById(membership.clubId);
            return club ? { id: club.id, name: club.clubName } : null;
          }),
        );
        setAvailableClubs(clubs.filter(Boolean) as Array<{ id: string; name: string }>);
      }
      setCheckingAuth(false);

      if (currentProfile?.id && !hasDirectEventTarget) {
        const activeSession = await loadReturnableParticipationSession(currentProfile.id);
        if (activeSession && activeSession.participant.role !== "host") {
          const shouldResume = window.confirm("이전 라운드가 아직 종료되지 않았습니다. 이어서 참가하시겠습니까?");
          if (shouldResume) {
            router.replace(`/guest/event/${activeSession.event.id}`);
            return;
          }
        }
      }
    };

    void sync();

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const eventId = searchParams.get("eventId");
      const invite = searchParams.get("invite");
      if (eventId) {
        setEventQuery(eventId);
      }
      if (invite) {
        setInviteId(invite);
      }
    } catch (error) {
      console.error("[guest-join] failed to read search params", error);
    }
  }, []);

  useEffect(() => {
    const autoJoin = async () => {
      if (checkingAuth || !eventQuery.trim()) {
        return;
      }

      if (!profile) {
        if (typeof window !== "undefined") {
          savePostLoginRedirect(window.location.pathname + window.location.search);
        }
        router.replace("/");
        return;
      }

      if (inviteId) {
        setSubmitting(true);
        try {
          const targetEvent = await loadEvent(eventQuery.trim());
          if (!targetEvent) {
            setError("유효하지 않은 참여 링크입니다.");
            return;
          }

          if (["finished", "completed", "completed_unsaved", "cancelled", "archived"].includes(targetEvent.status)) {
            setError("이미 종료된 이벤트입니다.");
            return;
          }

          if (profile.gender === "unspecified") {
            setError("먼저 프로필 설정에서 성별을 입력해 주세요.");
            return;
          }

          if (targetEvent.eventType === "club" && targetEvent.clubId) {
            const hasClubMembership = availableClubs.some((club) => club.id === targetEvent.clubId);
            if (!hasClubMembership) {
              setError("이 클럽 이벤트는 해당 클럽 승인 회원만 참가할 수 있습니다.");
              return;
            }
          }

          const invitation = getInvitationById(targetEvent, inviteId);
          if (!invitation) {
            setError("만료되었거나 유효하지 않은 초대 링크입니다.");
            return;
          }

          const participant = await joinEvent(targetEvent.id, {
            displayName: profile.displayName,
            gender: profile.gender,
            guestNtrp: profile.defaultNtrp ?? null,
            joinedAsClubId: targetEvent.eventType === "club" ? targetEvent.clubId ?? null : null,
            userId: profile.id,
            inviteId,
          });
          if (!participant?.id) {
            setError("이벤트 참여에 실패했습니다.");
            return;
          }

          saveLastEvent(targetEvent.id);
          saveLastParticipant(participant.id);
          router.replace(`/guest/event/${targetEvent.id}`);
        } catch (autoJoinError) {
          setError(autoJoinError instanceof Error ? autoJoinError.message : "초대 링크 처리에 실패했습니다.");
        } finally {
          setSubmitting(false);
        }
      }
    };

    void autoJoin();
  }, [availableClubs, checkingAuth, eventQuery, inviteId, profile, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!profile) {
        setError("먼저 로그인해 주세요.");
        return;
      }

      if (!displayName.trim() || !eventQuery.trim() || !gender) {
        setError("이름, 성별, 이벤트 코드 또는 이벤트 이름을 입력해 주세요.");
        return;
      }

      const targetEvent = await findEventByCodeOrName(eventQuery);
      if (!targetEvent?.id) {
        setError("이벤트를 찾을 수 없습니다.");
        return;
      }

      if (["finished", "completed", "completed_unsaved", "cancelled", "archived"].includes(targetEvent.status)) {
        setError("이미 종료된 이벤트입니다.");
        return;
      }

      if (targetEvent.eventType === "club") {
        if (!targetEvent.clubId) {
          setError("클럽 이벤트 정보가 올바르지 않습니다.");
          return;
        }
        if (joinedAsClubId !== targetEvent.clubId) {
          setError("클럽 이벤트는 해당 클럽으로 참가해야 합니다.");
          return;
        }
      }

      const participant = await joinEvent(targetEvent.id, {
        displayName,
        gender,
        guestNtrp,
        joinedAsClubId: joinedAsClubId || null,
        userId: profile.id,
        inviteId: inviteId || null,
      });
      if (!participant?.id) {
        setError("이벤트 참여에 실패했습니다. 중복 이름인지 확인해 주세요.");
        return;
      }

      saveLastEvent(targetEvent.id);
      saveLastParticipant(participant.id);
      router.push(`/guest/event/${targetEvent.id}`);
    } catch (submitError) {
      console.error("[guest-join] submit failed", submitError);
      setError(submitError instanceof Error ? submitError.message : "게스트 참여 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAuth) {
    return <main className="poster-page max-w-4xl text-sm text-ink/70">플레이어 계정을 확인하는 중...</main>;
  }

  if (!profile) {
    return (
      <main className="poster-page max-w-4xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">플레이어는 로그인 후 참여할 수 있습니다.</h1>
          <div className="mt-5 flex gap-3">
            <Link href="/" className="poster-button">로그인하러 가기</Link>
            <Link href="/history/player" className="poster-button-secondary">내 기록</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-4xl">
      <div className="border-t border-line py-8">
        <p className="poster-label">Player Entry</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">플레이어 참여</h1>
        <p className="mt-4 text-sm leading-6 text-ink/68">
          로그인 계정으로 이벤트에 참여하고 현재 라운드, 코트, 알림, 종료 후 내 기록을 확인합니다.
        </p>
        {inviteId ? <p className="mt-2 text-sm text-accentStrong">초대 링크가 감지되었습니다. 로그인 상태라면 자동으로 참여를 시도합니다.</p> : null}
      </div>

      <div className="mb-6 flex flex-wrap gap-3 border-t border-line py-4">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
        <Link href="/history/player" className="poster-button-secondary">내 기록</Link>
        <Link href="/history/host" className="poster-button-secondary">호스트 이력</Link>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 border-t border-line py-8">
        <label className="grid gap-2 text-sm font-semibold">
          표시 이름
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="poster-input" placeholder="이름 입력" />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          성별
          <select value={gender} onChange={(event) => setGender(event.target.value as ParticipantGender)} className="poster-input">
            <option value="">선택</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
            </select>
          </label>

        <label className="grid gap-2 text-sm font-semibold">
          이벤트 코드 또는 이벤트 이름
          <input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} className="poster-input" placeholder="예: ABC123" />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          NTRP
          <select value={guestNtrp} onChange={(event) => setGuestNtrp(Number(event.target.value))} className="poster-input">
            {NTRP_OPTIONS.map((option) => (
              <option key={option} value={option}>{option.toFixed(1)}</option>
            ))}
          </select>
        </label>

        {availableClubs.length > 0 ? (
          <label className="grid gap-2 text-sm font-semibold">
            참가 클럽
            <select value={joinedAsClubId} onChange={(event) => setJoinedAsClubId(event.target.value)} className="poster-input">
              <option value="">개인 참가</option>
              {availableClubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <button type="submit" disabled={submitting} className="poster-button w-fit disabled:opacity-60">
          {submitting ? "참여 중..." : "이벤트 참여"}
        </button>
      </form>
    </main>
  );
}
