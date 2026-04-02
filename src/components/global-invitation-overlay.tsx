"use client";

import { getCurrentProfile, subscribeAuthChanges } from "@/lib/auth";
import { joinEvent, loadUserInvitations, updateInvitationStatus } from "@/lib/events";
import { Invitation, UserProfile } from "@/lib/types";
import { saveLastEvent, saveLastParticipant } from "@/lib/storage";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 0)}분 전`;
  }

  const sameDate = now.toDateString() === date.toDateString();
  if (sameDate) {
    return `오늘 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function GlobalInvitationOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = async () => {
      try {
        const nextProfile = await getCurrentProfile({ forceRefresh: true });
        setProfile(nextProfile);
        if (nextProfile?.id) {
          setInvitations(await loadUserInvitations(nextProfile.id));
        } else {
          setInvitations([]);
        }
        setError(null);
      } catch (syncError) {
        console.error("[global-invitation] sync failed", syncError);
        setError(syncError instanceof Error ? syncError.message : "초대 알림을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void sync();
    const unsubscribe = subscribeAuthChanges(() => {
      void sync();
    });
    const interval = window.setInterval(() => {
      void sync();
    }, 3000);

    return () => {
      unsubscribe?.();
      window.clearInterval(interval);
    };
  }, []);

  const pendingInvitation = useMemo(
    () => invitations.find((invitation) => invitation.status === "pending") ?? null,
    [invitations],
  );

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

  if (loading || !profile) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-accentStrong/20 bg-white/95 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accentStrong">초대 알림</div>
            <div className="mt-1 text-sm text-ink/70">
              현재 위치: {pathname}
            </div>
          </div>
          <div className="text-sm font-semibold text-ink/70">{invitations.filter((invitation) => invitation.status === "pending").length}건</div>
        </div>

        {pendingInvitation ? (
          <div className="mt-3 rounded-xl border border-line bg-surface p-4">
            <div className="text-base font-black text-ink">호스트 {pendingInvitation.invitedByName}님이 게임 초대를 보냈습니다.</div>
            <div className="mt-1 text-sm text-ink/72">{pendingInvitation.eventName}</div>
            <div className="mt-1 text-xs text-ink/55">{formatNotificationTime(pendingInvitation.createdAt)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleInvitationResponse(pendingInvitation, "accept")}
                disabled={submitting}
                className="poster-button disabled:opacity-60"
              >
                수락
              </button>
              <button
                type="button"
                onClick={() => void handleInvitationResponse(pendingInvitation, "decline")}
                disabled={submitting}
                className="poster-button-secondary disabled:opacity-60"
              >
                거절
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-ink/60">새 초대가 없습니다.</div>
        )}

        {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
      </div>
    </div>
  );
}
