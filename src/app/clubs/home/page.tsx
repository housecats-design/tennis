"use client";

import { getCurrentProfile } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { buildClubHomeData, canApproveClubJoinRequests, canCreateClubEvent, listMyApprovedClubs } from "@/lib/clubs";
import { Club, ClubMember, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function formatActivity(value: string | null): string {
  if (!value) {
    return "기록 없음";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "기록 없음";
  }

  return date.toLocaleString("ko-KR");
}

export default function ClubHomePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myClubs, setMyClubs] = useState<Array<{ club: Club; membership: ClubMember }>>([]);
  const [selectedClubId, setSelectedClubId] = useState("");
  const [loading, setLoading] = useState(true);
  const [clubData, setClubData] = useState<Awaited<ReturnType<typeof buildClubHomeData>> | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseClient();
      const authResult = await supabase?.auth.getUser();
      const authUser = authResult?.data.user ?? null;
      const authUserId = authUser?.id ?? null;
      const nextProfile = await getCurrentProfile({ forceRefresh: true });
      setProfile(nextProfile);

      if (!authUserId) {
        setLoading(false);
        return;
      }

      const nextClubs = await listMyApprovedClubs(authUserId);
      setMyClubs(nextClubs);
      const requestedClubId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("clubId")
          : null;
      const defaultClubId =
        (requestedClubId && nextClubs.find((item) => item.club.id === requestedClubId)?.club.id) ||
        nextClubs[0]?.club.id ||
        "";
      setSelectedClubId(defaultClubId);
      if (defaultClubId) {
        setClubData(await buildClubHomeData(defaultClubId));
      }
      setLoading(false);
    };

    void load();
  }, []);

  useEffect(() => {
    if (!selectedClubId) {
      setClubData(null);
      return;
    }

    void buildClubHomeData(selectedClubId).then(setClubData);
  }, [selectedClubId]);

  const selectedMembership = useMemo(
    () => myClubs.find((item) => item.club.id === selectedClubId)?.membership ?? null,
    [myClubs, selectedClubId],
  );

  if (loading) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">내 클럽 홈을 불러오는 중...</main>;
  }

  if (!profile) {
    return (
      <main className="poster-page max-w-5xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">클럽 홈은 로그인 후 이용할 수 있습니다.</h1>
          <div className="mt-5 flex gap-3">
            <Link href="/" className="poster-button">메인 페이지</Link>
            <Link href="/clubs" className="poster-button-secondary">클럽 탐색</Link>
          </div>
        </div>
      </main>
    );
  }

  if (myClubs.length === 0) {
    return (
      <main className="poster-page max-w-5xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">가입된 클럽이 없습니다.</h1>
          <div className="mt-5 flex gap-3">
            <Link href="/clubs" className="poster-button">클럽 탐색</Link>
            <Link href="/" className="poster-button-secondary">메인 페이지</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-7xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
        <Link href="/clubs/home" className="poster-button-secondary">내 클럽 홈</Link>
        <Link href="/clubs" className="poster-button-secondary">클럽 탐색</Link>
        <Link href="/profile" className="poster-button-secondary">프로필 설정</Link>
      </div>

      <section className="border-t border-line py-8">
        <div className="mb-3 text-xs font-black tracking-[0.2em] text-accentStrong">CLUB HOME MODE</div>
        <p className="poster-label">내 클럽 홈</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">내 클럽 홈</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/68">
          가입된 클럽의 최근 활동, 멤버 현황, 클럽 전적과 운영 메뉴를 한 곳에서 확인합니다.
        </p>
      </section>

      <section className="border-t border-line py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm font-semibold">내 클럽 선택</div>
          <select value={selectedClubId} onChange={(event) => setSelectedClubId(event.target.value)} className="poster-input max-w-sm">
            {myClubs.map((item) => (
              <option key={item.club.id} value={item.club.id}>
                {item.club.clubName}
              </option>
            ))}
          </select>
          <div className="text-xs text-ink/55">
            내 역할: {selectedMembership?.role === "owner" ? "클럽장" : selectedMembership?.role === "manager" ? "부클럽장" : "회원"}
          </div>
        </div>
      </section>

      {clubData?.club ? (
        <>
          <section className="grid gap-6 border-t border-line py-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="text-4xl font-black">{clubData.club.clubName}</div>
              <div className="mt-3 text-sm text-ink/68">
                {clubData.club.region ? `${clubData.club.region} · ` : ""}{clubData.club.description ?? "클럽 소개가 아직 없습니다."}
              </div>
              <div className="mt-2 text-xs text-ink/55">클럽 공개 여부: {clubData.club.visibility === "private" ? "비공개" : "공개"}</div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/55">
                <span>홈</span>
                <span>· 멤버</span>
                <span>· 랭킹</span>
                <span>· 이벤트</span>
                <span>· 활동</span>
                <span>· 관리</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border-b border-line pb-4">
                <div className="poster-label">총 멤버 수</div>
                <div className="mt-2 text-3xl font-black">{clubData.members.length}</div>
              </div>
              <div className="border-b border-line pb-4">
                <div className="poster-label">최근 활동</div>
                <div className="mt-2 text-sm text-ink/68">
                  {clubData.memberRows[0]?.lastActivityAt ? formatActivity(clubData.memberRows[0].lastActivityAt) : "활동 기록 없음"}
                </div>
              </div>
              <div className="border-b border-line pb-4">
                <div className="poster-label">클럽 누적 승 / 패 / 승률</div>
                <div className="mt-2 text-sm text-ink/68">
                  {clubData.clubStats
                    ? `${clubData.clubStats.wins}승 / ${clubData.clubStats.losses}패 / ${
                        clubData.clubStats.matchesPlayed > 0
                          ? Math.round((clubData.clubStats.wins / clubData.clubStats.matchesPlayed) * 100)
                          : 0
                      }%`
                    : "기록 없음"}
                </div>
              </div>
              <div className="border-b border-line pb-4">
                <div className="poster-label">클럽 포인트</div>
                <div className="mt-2 text-3xl font-black">{clubData.clubStats?.points ?? 0}</div>
              </div>
            </div>
          </section>

          <section className="border-t border-line py-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-3xl font-black">멤버 기록</h2>
              <div className="text-xs text-ink/55">
                {canApproveClubJoinRequests(selectedMembership?.role ?? "member")
                  ? "클럽장 권한"
                  : canCreateClubEvent(selectedMembership?.role ?? "member")
                    ? "부클럽장 운영 권한"
                    : "일반 회원"}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="poster-table min-w-full text-left">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>NTRP</th>
                    <th>전체 전적</th>
                    <th>클럽 전적</th>
                    <th>클럽 포인트</th>
                    <th>최근 활동</th>
                  </tr>
                </thead>
                <tbody>
                  {clubData.memberRows.map((member) => (
                    <tr key={member.userId}>
                      <td className="font-semibold">{member.displayName}</td>
                      <td>{typeof member.ntrp === "number" ? member.ntrp.toFixed(1) : "-"}</td>
                      <td>{member.totalWins}승 {member.totalLosses}패 / {member.totalMatches}경기</td>
                      <td>{member.clubWins}승 {member.clubLosses}패 / {member.clubMatches}경기</td>
                      <td>{member.clubPoints}</td>
                      <td>{formatActivity(member.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-t border-line py-8">
            <h2 className="text-3xl font-black">운영 메뉴</h2>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href={`/clubs/${clubData.club.id}`} className="poster-button-secondary">클럽 상세</Link>
              {canCreateClubEvent(selectedMembership?.role ?? "member") ? (
                <Link href="/host" className="poster-button">클럽 이벤트 생성</Link>
              ) : null}
              {canApproveClubJoinRequests(selectedMembership?.role ?? "member") ? (
                <div className="border-l-2 border-accentStrong pl-4 text-accentStrong">
                  클럽장은 가입 요청 승인/거절, 부클럽장 지정/해제, 클럽 소개 수정과 설정 관리를 할 수 있습니다.
                </div>
              ) : canCreateClubEvent(selectedMembership?.role ?? "member") ? (
                <div className="border-l-2 border-accentStrong pl-4 text-accentStrong">
                  부클럽장은 클럽 이벤트 생성과 운영이 가능합니다. 가입 요청 승인은 할 수 없습니다.
                </div>
              ) : (
                <div className="border-l-2 border-line pl-4 text-ink/68">
                  일반 회원은 클럽 홈과 기록을 확인하고 클럽 이벤트에 참여할 수 있습니다.
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
