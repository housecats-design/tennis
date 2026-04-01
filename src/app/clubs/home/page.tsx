"use client";

import { normalizeClub, normalizeClubMember } from "@/lib/clubs";
import { getSupabaseClient } from "@/lib/supabase";
import { buildClubHomeData, canApproveClubJoinRequests, canCreateClubEvent, listMyApprovedClubs } from "@/lib/clubs";
import { Club, ClubMember } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const DEBUG_BUILD_LABEL = "branch:main commit:f5b73e6 env:club-debug";

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
  const [myClubs, setMyClubs] = useState<Array<{ club: Club; membership: ClubMember }>>([]);
  const [selectedClubId, setSelectedClubId] = useState("");
  const [loading, setLoading] = useState(true);
  const [clubData, setClubData] = useState<Awaited<ReturnType<typeof buildClubHomeData>> | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [rawMembershipRows, setRawMembershipRows] = useState<unknown>(null);
  const [rawClubRows, setRawClubRows] = useState<unknown>(null);
  const [approvedClubsResultCount, setApprovedClubsResultCount] = useState(0);
  const [matchedClubsCount, setMatchedClubsCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [routingDecision, setRoutingDecision] = useState("CLUB HOME MODE");
  const noClubReason = loadError
    ? `클럽 홈 로딩 오류: ${loadError}`
    : !authUserId
      ? "auth user id가 없습니다."
      : Array.isArray(rawMembershipRows) && rawMembershipRows.length === 0
        ? "club_members 조회 결과가 0건입니다."
        : myClubs.length === 0
          ? "club_members는 조회됐지만 myClubs 조합 결과가 0건입니다."
          : "원인 미확인";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      const supabase = getSupabaseClient();

      try {
        const authResult = await supabase?.auth.getUser();
        const authUser = authResult?.data.user ?? null;
        const nextAuthUserId = authUser?.id ?? null;
        setAuthUserId(nextAuthUserId);
        setAuthUserEmail(authUser?.email ?? null);

        if (!nextAuthUserId || !supabase) {
          setRoutingDecision("CLUB DISCOVERY MODE");
          setLoading(false);
          return;
        }

        const [membershipResult, clubsResult, nextClubs] = await Promise.all([
          supabase
            .from("club_members")
            .select("id, club_id, user_id, role, joined_at, is_active, deleted_at")
            .eq("user_id", nextAuthUserId)
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("joined_at", { ascending: false }),
          supabase
            .from("clubs")
            .select("id, club_name, description, visibility, created_by_user_id, is_active, deleted_at, created_at, updated_at")
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          listMyApprovedClubs(nextAuthUserId),
        ]);

        setRawMembershipRows(membershipResult.data ?? membershipResult.error ?? null);
        setRawClubRows(clubsResult.data ?? clubsResult.error ?? null);

        if (membershipResult.error) {
          throw new Error(membershipResult.error.message);
        }
        if (clubsResult.error) {
          throw new Error(clubsResult.error.message);
        }

        const normalizedMemberships = (membershipResult.data ?? []).map((row) =>
          normalizeClubMember({
            id: row.id,
            clubId: row.club_id,
            userId: row.user_id,
            role: row.role,
            joinedAt: row.joined_at ?? new Date().toISOString(),
            isActive: row.is_active ?? true,
            deletedAt: row.deleted_at ?? null,
          }),
        );
        const normalizedClubs = (clubsResult.data ?? []).map((row) =>
          normalizeClub({
            id: row.id,
            clubName: row.club_name,
            description: row.description ?? null,
            visibility: row.visibility ?? "public",
            createdByUserId: row.created_by_user_id,
            isActive: row.is_active ?? true,
            deletedAt: row.deleted_at ?? null,
            createdAt: row.created_at ?? new Date().toISOString(),
            updatedAt: row.updated_at ?? new Date().toISOString(),
          }),
        );

        console.info("[clubs-home] auth user", { id: nextAuthUserId, email: authUser?.email ?? null });
        console.info("[clubs-home] club_members", normalizedMemberships);
        console.info("[clubs-home] clubs", normalizedClubs);
        console.info("[clubs-home] listMyApprovedClubs", nextClubs);

        setMatchedClubsCount(normalizedClubs.length);
        setApprovedClubsResultCount(nextClubs.length);
        setMyClubs(nextClubs);
        setRoutingDecision(nextClubs.length > 0 ? "CLUB HOME MODE" : "CLUB DISCOVERY MODE");
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
      } catch (error) {
        console.error("[clubs-home] load failed", error);
        setLoadError(error instanceof Error ? error.message : "클럽 홈을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
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
    return (
      <main className="poster-page max-w-6xl text-sm text-ink/70">
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
          BUILD TAG · {DEBUG_BUILD_LABEL} · route:/clubs/home
        </div>
        <div className="mb-6 border-4 border-red-600 bg-yellow-200 px-4 py-3 text-base font-black tracking-[0.08em] text-red-700">
          DEBUG CLUB PAGE ACTIVE
        </div>
        <div className="mb-4 border-4 border-blue-700 bg-blue-100 px-4 py-3 text-base font-black tracking-[0.08em] text-blue-800">
          CLUB HOME MODE
        </div>
        <div>내 클럽 홈을 불러오는 중...</div>
      </main>
    );
  }

  if (!authUserId) {
    return (
      <main className="poster-page max-w-5xl">
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
          BUILD TAG · {DEBUG_BUILD_LABEL} · route:/clubs/home
        </div>
        <div className="mb-6 border-4 border-red-600 bg-yellow-200 px-4 py-3 text-base font-black tracking-[0.08em] text-red-700">
          DEBUG REAL CLUB HOME
        </div>
        <div className="mb-4 border-4 border-blue-700 bg-blue-100 px-4 py-3 text-base font-black tracking-[0.08em] text-blue-800">
          CLUB HOME MODE
        </div>
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">클럽 홈은 로그인 후 이용할 수 있습니다.</h1>
          <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-xs leading-5 text-red-900">
            <div className="font-bold">클럽 홈 디버그</div>
            <div>route: /clubs/home</div>
            <div>auth user id: {authUserId ?? "-"}</div>
            <div>membership count: {Array.isArray(rawMembershipRows) ? rawMembershipRows.length : 0}</div>
            <div>reason: 로그인 세션이 없어 클럽 홈을 렌더할 수 없습니다.</div>
          </div>
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
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
          BUILD TAG · {DEBUG_BUILD_LABEL} · route:/clubs/home
        </div>
        <div className="mb-6 border-4 border-red-600 bg-yellow-200 px-4 py-3 text-base font-black tracking-[0.08em] text-red-700">
          DEBUG REAL CLUB HOME
        </div>
        <div className="mb-4 border-4 border-blue-700 bg-blue-100 px-4 py-3 text-base font-black tracking-[0.08em] text-blue-800">
          CLUB HOME MODE
        </div>
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">가입된 클럽이 없습니다.</h1>
          <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-xs leading-5 text-red-900">
            <div className="font-bold">클럽 홈 디버그</div>
            <div>route: /clubs/home</div>
            <div>auth user id: {authUserId ?? "-"}</div>
            <div>auth user email: {authUserEmail ?? "-"}</div>
            <div>membership count: {Array.isArray(rawMembershipRows) ? rawMembershipRows.length : 0}</div>
            <div>reason: {noClubReason}</div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(
                {
                  rawMembershipRows,
                  rawClubRows,
                },
                null,
                2,
              )}
            </pre>
          </div>
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
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
        BUILD TAG · {DEBUG_BUILD_LABEL} · route:/clubs/home
      </div>
      <div className="mb-6 border-4 border-red-600 bg-yellow-200 px-4 py-3 text-base font-black tracking-[0.08em] text-red-700">
        DEBUG REAL CLUB HOME
      </div>
      <div className="mb-4 border-4 border-blue-700 bg-blue-100 px-4 py-3 text-base font-black tracking-[0.08em] text-blue-800">
        {routingDecision}
      </div>
      <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-xs leading-5 text-red-900">
        <div className="font-bold">클럽 디버그</div>
        <div>route: /clubs/home</div>
        <div>auth user id exists: {String(Boolean(authUserId))}</div>
        <div>auth user id: {authUserId ?? "-"}</div>
        <div>auth user email: {authUserEmail ?? "-"}</div>
        <div>loading: {String(loading)}</div>
        <div>error: {loadError ?? "-"}</div>
        <div>final routing decision: {routingDecision}</div>
        <div>membership result count: {Array.isArray(rawMembershipRows) ? rawMembershipRows.length : 0}</div>
        <div>clubs result count: {Array.isArray(rawClubRows) ? rawClubRows.length : 0}</div>
        <div>listMyApprovedClubs result count: {approvedClubsResultCount}</div>
        <div>clubs matched count: {matchedClubsCount}</div>
        <div>myClubs length: {myClubs.length}</div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(
            {
              rawMembershipRows,
              rawClubRows,
            },
            null,
            2,
          )}
        </pre>
      </div>
      <div className="fixed bottom-3 right-3 z-50 max-w-[92vw] rounded-lg border border-black/20 bg-black/85 px-3 py-2 text-[10px] leading-4 text-white shadow-lg">
        <div>BUILD TAG {DEBUG_BUILD_LABEL}</div>
        <div>route /clubs/home</div>
        <div>auth {authUserId ? "yes" : "no"}</div>
        <div>memberships {Array.isArray(rawMembershipRows) ? rawMembershipRows.length : 0}</div>
        <div>clubs {Array.isArray(rawClubRows) ? rawClubRows.length : 0}</div>
        <div>approvedClubs {approvedClubsResultCount}</div>
        <div>myClubs {myClubs.length}</div>
      </div>
    <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
        <Link href="/clubs/home" className="poster-button-secondary">내 클럽 홈</Link>
        <Link href="/clubs/discovery" className="poster-button-secondary">클럽 탐색</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">내 클럽 홈</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">내 클럽 홈</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/68">
          가입된 클럽의 최근 활동, 멤버 현황, 클럽 전적과 운영 메뉴를 한 곳에서 확인합니다.
        </p>
        {loadError ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div> : null}
      </section>

      <section className="border-t border-line py-6">
        <h2 className="text-2xl font-black">운영 메뉴</h2>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href={`/clubs/${selectedClubId || clubData?.club?.id || ""}`} className="poster-button-secondary">클럽 상세</Link>
          {canCreateClubEvent(selectedMembership?.role ?? "member") ? (
            <Link href="/host" className="poster-button">클럽 이벤트 생성</Link>
          ) : null}
          {canApproveClubJoinRequests(selectedMembership?.role ?? "member") ? (
            <div className="border-l-2 border-accentStrong pl-4 text-accentStrong">
              클럽장은 가입 요청 승인/거절, 부클럽장 지정/해제, 클럽 설정 관리를 할 수 있습니다.
            </div>
          ) : canCreateClubEvent(selectedMembership?.role ?? "member") ? (
            <div className="border-l-2 border-accentStrong pl-4 text-accentStrong">
              부클럽장은 클럽 이벤트 생성과 운영이 가능합니다.
            </div>
          ) : (
            <div className="border-l-2 border-line pl-4 text-ink/68">
              일반 회원은 클럽 기록 확인과 클럽 이벤트 참여가 가능합니다.
            </div>
          )}
        </div>
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
        </>
      ) : null}
    </main>
  );
}
