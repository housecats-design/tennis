"use client";

import { getCurrentProfile } from "@/lib/auth";
import {
  canApproveClubJoinRequests,
  canCreateClubEvent,
  getClubById,
  getClubMembership,
  getPendingJoinRequest,
  listClubMembers,
  listMyClubMemberships,
  listPendingClubJoinRequests,
  submitClubJoinRequest,
  updateClubJoinRequestStatus,
  updateClubMemberRole,
} from "@/lib/clubs";
import { listProfiles } from "@/lib/users";
import { Club, ClubJoinRequest, ClubMember, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ClubDetailPage() {
  const params = useParams<{ id: string }>();
  const clubId = typeof params.id === "string" ? params.id : "";
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [memberships, setMemberships] = useState<ClubMember[]>([]);
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [joinRequest, setJoinRequest] = useState<ClubJoinRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<ClubJoinRequest[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [nextProfile, nextClub] = await Promise.all([getCurrentProfile(), getClubById(clubId)]);
        setProfile(nextProfile);
        setClub(nextClub);
        const [nextClubMembers, nextProfiles] = await Promise.all([
          listClubMembers(clubId),
          listProfiles(),
        ]);
        setClubMembers(nextClubMembers);
        setProfiles(nextProfiles);
        if (nextProfile?.id) {
          const [nextMemberships, nextJoinRequest, nextPendingRequests] = await Promise.all([
            listMyClubMemberships(nextProfile.id),
            getPendingJoinRequest(clubId, nextProfile.id),
            listPendingClubJoinRequests(clubId),
          ]);
          setMemberships(nextMemberships);
          setJoinRequest(nextJoinRequest);
          setPendingRequests(nextPendingRequests);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [clubId]);

  const membership = useMemo(
    () => memberships.find((item) => item.clubId === clubId && item.deletedAt == null),
    [clubId, memberships],
  );
  const currentClubMembership = useMemo(
    () => clubMembers.find((item) => item.userId === profile?.id && item.deletedAt == null) ?? membership ?? null,
    [clubMembers, membership, profile?.id],
  );
  const canApproveRequests = Boolean(
    currentClubMembership &&
    currentClubMembership.membershipStatus === "approved" &&
    canApproveClubJoinRequests(currentClubMembership.role),
  );
  const canOperateClubEvent = Boolean(
    currentClubMembership &&
    currentClubMembership.membershipStatus === "approved" &&
    canCreateClubEvent(currentClubMembership.role),
  );

  function getUserLabel(userId: string): string {
    return profiles.find((item) => item.id === userId)?.displayName ?? userId;
  }

  async function handleJoinRequest(): Promise<void> {
    if (!profile || !club) {
      setError("로그인 후 가입 신청할 수 있습니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const nextRequest = await submitClubJoinRequest({
        clubId: club.id,
        userId: profile.id,
      });
      setJoinRequest(nextRequest);
      setInfo("클럽 가입 요청이 접수되었습니다.");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "클럽 가입 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReviewRequest(requestId: string, status: "approved" | "rejected"): Promise<void> {
    if (!profile) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await updateClubJoinRequestStatus({
        clubId,
        requestId,
        reviewerUserId: profile.id,
        status,
      });
      setPendingRequests(await listPendingClubJoinRequests(clubId));
      setClubMembers(await listClubMembers(clubId));
      setInfo(status === "approved" ? "가입 요청을 승인했습니다." : "가입 요청을 거절했습니다.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "가입 요청 처리에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(targetUserId: string, role: "vice_leader" | "member"): Promise<void> {
    if (!profile) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await updateClubMemberRole({
        clubId,
        actorUserId: profile.id,
        targetUserId,
        role,
      });
      setClubMembers(await listClubMembers(clubId));
      setInfo(role === "vice_leader" ? "부리더로 지정했습니다." : "일반 회원 역할로 변경했습니다.");
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "역할 변경에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="poster-page max-w-4xl text-sm text-ink/70">클럽 정보를 불러오는 중...</main>;
  }

  if (!club) {
    return (
      <main className="poster-page max-w-4xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">클럽을 찾을 수 없습니다.</h1>
          <div className="mt-5">
            <Link href="/clubs" className="poster-button-secondary">클럽 목록으로 이동</Link>
          </div>
        </div>
      </main>
    );
  }

  const isApprovedMember = membership?.membershipStatus === "approved" && membership.leftAt == null;

  return (
    <main className="poster-page max-w-5xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
        <Link href="/clubs" className="poster-button-secondary">클럽 목록</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">Club Detail</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">{club.clubName}</h1>
        <p className="mt-4 text-sm text-ink/68">
          {club.region ? `${club.region} · ` : ""}{club.description ?? "클럽 소개가 아직 없습니다."}
        </p>
        <div className="mt-4 text-xs text-ink/55">상태: {club.status === "approved" ? "승인됨" : club.status === "active" ? "운영중" : club.status}</div>
      </section>

      <section className="border-t border-line py-8">
        <h2 className="text-2xl font-black">가입</h2>
        <div className="mt-4 space-y-3 text-sm">
          {isApprovedMember ? (
            <div className="border-l-2 border-accentStrong pl-4 text-accentStrong">이미 가입된 클럽입니다.</div>
          ) : joinRequest?.status === "pending" ? (
            <div className="border-l-2 border-amber-400 pl-4 text-amber-800">가입 요청 검토 중입니다.</div>
          ) : (
            <button type="button" onClick={() => void handleJoinRequest()} disabled={!profile || submitting} className="poster-button disabled:opacity-60">
              {submitting ? "요청 중..." : "가입 요청 보내기"}
            </button>
          )}
          {!profile ? <div className="text-xs text-ink/55">로그인 후 가입 요청을 보낼 수 있습니다.</div> : null}
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {info ? <div className="border-l-2 border-accentStrong pl-4 text-sm text-accentStrong">{info}</div> : null}
        </div>
      </section>

      <section className="border-t border-line py-8">
        <h2 className="text-2xl font-black">클럽 구성</h2>
        <div className="mt-4 space-y-3">
          {clubMembers.length > 0 ? (
            clubMembers
              .filter((item) => item.membershipStatus === "approved" && item.deletedAt == null && item.leftAt == null)
              .map((member) => (
                <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 text-sm">
                  <div>
                    <div className="font-semibold">{getUserLabel(member.userId)}</div>
                    <div className="mt-1 text-xs text-ink/60">{member.role === "leader" ? "리더" : member.role === "vice_leader" ? "부리더" : "회원"}</div>
                  </div>
                  {canApproveRequests && member.role !== "leader" ? (
                    <div className="flex gap-2">
                      {member.role !== "vice_leader" ? (
                        <button type="button" onClick={() => void handleRoleChange(member.userId, "vice_leader")} className="poster-button-secondary text-xs">
                          부리더 지정
                        </button>
                      ) : (
                        <button type="button" onClick={() => void handleRoleChange(member.userId, "member")} className="poster-button-secondary text-xs">
                          일반 회원 전환
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ))
          ) : (
            <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">아직 승인된 회원이 없습니다.</div>
          )}
        </div>
        {canOperateClubEvent ? (
          <div className="mt-4 text-xs font-semibold text-accentStrong">이 계정은 클럽 이벤트를 만들 수 있는 운영 권한이 있습니다.</div>
        ) : null}
      </section>

      {canApproveRequests ? (
        <section className="border-t border-line py-8">
          <h2 className="text-2xl font-black">가입 요청 관리</h2>
          <div className="mt-4 space-y-3">
            {pendingRequests.length > 0 ? (
              pendingRequests.map((request) => (
                <div key={request.id} className="border-b border-line py-3">
                  <div className="font-semibold">{getUserLabel(request.userId)}</div>
                  <div className="mt-1 text-xs text-ink/60">
                    요청 시각 {new Date(request.requestedAt).toLocaleString("ko-KR")}
                  </div>
                  {request.message ? <div className="mt-2 text-sm text-ink/70">{request.message}</div> : null}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void handleReviewRequest(request.id, "approved")} disabled={submitting} className="poster-button text-xs disabled:opacity-60">
                      승인
                    </button>
                    <button type="button" onClick={() => void handleReviewRequest(request.id, "rejected")} disabled={submitting} className="poster-button-secondary text-xs disabled:opacity-60">
                      거절
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">대기 중인 가입 요청이 없습니다.</div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
