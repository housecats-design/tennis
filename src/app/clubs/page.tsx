"use client";

import { getCurrentProfile } from "@/lib/auth";
import {
  isActiveClubMembership,
  listActiveClubs,
  listMyClubApplications,
  normalizeClub,
  normalizeClubMember,
  submitClubApplication,
} from "@/lib/clubs";
import { getSupabaseClient } from "@/lib/supabase";
import { Club, ClubApplication, ClubMember, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type DebugState = {
  authUser: unknown;
  authUserId: string | null;
  authUserEmail: string | null;
  clubMembersRaw: unknown;
  clubsRaw: unknown;
  routingDecision: string;
};

const DEBUG_BUILD_LABEL = "branch:main commit:f5b73e6 env:club-debug";

export default function ClubsPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [memberships, setMemberships] = useState<ClubMember[]>([]);
  const [applications, setApplications] = useState<ClubApplication[]>([]);

  const [clubName, setClubName] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [debugState, setDebugState] = useState<DebugState>({
    authUser: null,
    authUserId: null,
    authUserEmail: null,
    clubMembersRaw: null,
    clubsRaw: null,
    routingDecision: "초기화 전",
  });

  useEffect(() => {
    const supabase = getSupabaseClient();

    const hydrateAuth = async () => {
      setAuthReady(false);
      setLoading(true);
      setLoadError(null);
      setRedirecting(false);
      setDebugState((current) => ({
        ...current,
        routingDecision: "인증 상태 확인 중",
      }));

      if (!supabase) {
        setProfile(null);
        setAuthUserId(null);
        setAuthUserEmail(null);
        setDebugState((current) => ({
          ...current,
          authUser: null,
          authUserId: null,
          authUserEmail: null,
        }));
        setAuthReady(true);
        return;
      }

      const authResult = await supabase.auth.getUser();
      const authUser = authResult.data.user ?? null;
      console.info("[clubs-routing] auth user object", authUser);
      if (authResult.error) {
        console.error("[clubs-routing] auth user fetch failed", authResult.error);
      }

      setDebugState((current) => ({
        ...current,
        authUser,
        authUserId: authUser?.id ?? null,
        authUserEmail: authUser?.email ?? null,
      }));
      setAuthUserId(authUser?.id ?? null);
      setAuthUserEmail(authUser?.email ?? null);

      if (!authUser?.id) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const nextProfile = await getCurrentProfile({ forceRefresh: true });
      setProfile(nextProfile);
      console.info("[clubs-routing] auth user", {
        authUserId: authUser.id,
        userId: nextProfile?.id ?? null,
        email: nextProfile?.email ?? authUser.email ?? null,
      });
      setAuthReady(true);
    };

    void hydrateAuth();

    const subscription = supabase?.auth.onAuthStateChange(() => {
      void hydrateAuth();
    });

    return () => {
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadClubPageData = async () => {
      if (!authReady) {
        return;
      }

      setLoading(true);
      setLoadError(null);
      setDebugState((current) => ({
        ...current,
        routingDecision: "클럽 데이터 불러오는 중",
      }));

      const supabase = getSupabaseClient();
      let nextMemberships: ClubMember[] = [];
      let nextClubs: Club[] = [];

      if (authUserId && supabase) {
        const [membershipResult, clubsResult, applicationResult] = await Promise.allSettled([
          supabase
            .from("club_members")
            .select("id, club_id, user_id, role, joined_at, is_active, deleted_at")
            .eq("user_id", authUserId)
            .is("deleted_at", null)
            .eq("is_active", true)
            .order("joined_at", { ascending: false }),
          supabase
            .from("clubs")
            .select("id, club_name, description, visibility, created_by_user_id, is_active, deleted_at, created_at, updated_at")
            .is("deleted_at", null)
            .eq("is_active", true)
            .order("created_at", { ascending: false }),
            listMyClubApplications(authUserId),
          ]);

        if (membershipResult.status === "fulfilled") {
          setDebugState((current) => ({
            ...current,
            clubMembersRaw: membershipResult.value.data ?? membershipResult.value.error ?? null,
          }));
          if (membershipResult.value.error) {
            console.error("[clubs-routing] club_members query error", membershipResult.value.error);
            setLoadError("내 클럽 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          } else {
            nextMemberships = (membershipResult.value.data ?? []).map((membershipRow) =>
              normalizeClubMember({
                id: membershipRow.id,
                clubId: membershipRow.club_id,
                userId: membershipRow.user_id,
                role: membershipRow.role,
                joinedAt: membershipRow.joined_at ?? new Date().toISOString(),
                isActive: membershipRow.is_active ?? true,
                deletedAt: membershipRow.deleted_at ?? null,
              }),
            );
          }
            console.info("[clubs-routing] club_members", {
              userId: authUserId,
              rawCount: membershipResult.value.data?.length ?? 0,
              count: nextMemberships.length,
              memberships: nextMemberships.map((membership) => ({
              clubId: membership.clubId,
              role: membership.role,
              isActive: membership.isActive,
              deletedAt: membership.deletedAt,
            })),
          });
        } else {
          console.error("[clubs-routing] club_members fetch failed", membershipResult.reason);
          setDebugState((current) => ({
            ...current,
            clubMembersRaw: { error: String(membershipResult.reason) },
          }));
          setLoadError("내 클럽 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }

        if (clubsResult.status === "fulfilled") {
          setDebugState((current) => ({
            ...current,
            clubsRaw: clubsResult.value.data ?? clubsResult.value.error ?? null,
          }));
          if (clubsResult.value.error) {
            console.error("[clubs-routing] clubs query error", clubsResult.value.error);
            setLoadError((current) => current ?? "클럽 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          } else {
            nextClubs = (clubsResult.value.data ?? []).map((clubRow) =>
              normalizeClub({
                id: clubRow.id,
                clubName: clubRow.club_name,
                description: clubRow.description ?? null,
                visibility: clubRow.visibility ?? "public",
                createdByUserId: clubRow.created_by_user_id,
                isActive: clubRow.is_active ?? true,
                deletedAt: clubRow.deleted_at ?? null,
                createdAt: clubRow.created_at ?? new Date().toISOString(),
                updatedAt: clubRow.updated_at ?? new Date().toISOString(),
              }),
            );
          }
          console.info("[clubs-routing] clubs", {
            rawCount: clubsResult.value.data?.length ?? 0,
            count: nextClubs.length,
            clubs: nextClubs.map((club) => ({
              id: club.id,
              clubName: club.clubName,
              visibility: club.visibility ?? "public",
            })),
          });
        } else {
          console.error("[clubs-routing] clubs fetch failed", clubsResult.reason);
          setDebugState((current) => ({
            ...current,
            clubsRaw: { error: String(clubsResult.reason) },
          }));
          setLoadError((current) => current ?? "클럽 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }

        if (applicationResult.status === "fulfilled") {
          setApplications(applicationResult.value);
        } else {
          console.error("[clubs-routing] club applications fetch failed", applicationResult.reason);
        }
      } else {
        try {
          nextClubs = await listActiveClubs({ strict: true });
          setDebugState((current) => ({
            ...current,
            clubsRaw: nextClubs,
          }));
          console.info("[clubs-routing] clubs", {
            count: nextClubs.length,
            clubs: nextClubs.map((club) => ({
              id: club.id,
              clubName: club.clubName,
              visibility: club.visibility ?? "public",
            })),
          });
        } catch (clubError) {
          console.error("[clubs-routing] clubs fetch failed", clubError);
          setDebugState((current) => ({
            ...current,
            clubsRaw: { error: clubError instanceof Error ? clubError.message : String(clubError) },
          }));
          setLoadError("클럽 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        setMemberships([]);
        setApplications([]);
        setDebugState((current) => ({
          ...current,
          clubMembersRaw: [],
        }));
      }

      setMemberships(nextMemberships);
      setClubs(nextClubs);

      const defaultMembership = [...nextMemberships]
        .filter((membership) => isActiveClubMembership(membership))
        .sort((left, right) => {
          const leftPriority = left.role === "owner" ? 0 : left.role === "manager" ? 1 : 2;
          const rightPriority = right.role === "owner" ? 0 : right.role === "manager" ? 1 : 2;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }
          return new Date(right.joinedAt).getTime() - new Date(left.joinedAt).getTime();
        })[0];

      if (defaultMembership) {
        setDebugState((current) => ({
          ...current,
          routingDecision: `내 클럽 홈으로 이동: ${defaultMembership.clubId}`,
        }));
        setRedirecting(true);
        router.replace(`/clubs/home?clubId=${defaultMembership.clubId}`);
        return;
      }

        setDebugState((current) => ({
          ...current,
          routingDecision: authUserId ? "CLUB DISCOVERY MODE" : "비로그인: CLUB DISCOVERY MODE",
        }));
      setLoading(false);
    };

    void loadClubPageData();
  }, [authReady, authUserId, router]);

  const myClubs = useMemo(() => {
    const joinedClubIds = new Set(
      memberships
        .filter((membership) => isActiveClubMembership(membership))
        .map((membership) => membership.clubId),
    );
    return clubs.filter((club) => joinedClubIds.has(club.id));
  }, [clubs, memberships]);

  useEffect(() => {
    console.info("[clubs-routing] render state", {
      myClubs: myClubs.map((club) => ({ id: club.id, clubName: club.clubName })),
      discoveryClubs: clubs.map((club) => ({ id: club.id, clubName: club.clubName, visibility: club.visibility ?? "public" })),
      loading,
      error: loadError,
    });
  }, [clubs, loadError, loading, myClubs]);

  async function handleSubmitApplication(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!profile) {
      setError("클럽 생성 요청은 로그인 후 이용할 수 있습니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const application = await submitClubApplication({
        applicantUserId: profile.id,
        clubName,
        region,
        description,
      });
      setApplications((current) => [application, ...current]);
      setClubName("");
      setRegion("");
      setDescription("");
      setInfo("클럽 생성 요청이 접수되었습니다.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "클럽 생성 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authReady || loading || redirecting) {
    return (
      <main className="poster-page max-w-5xl text-sm text-ink/70">
        <div className="mb-6 border-4 border-red-600 bg-yellow-200 px-4 py-3 text-base font-black tracking-[0.08em] text-red-700">
          DEBUG CLUB PAGE ACTIVE
        </div>
        <div className="mb-4 border-4 border-blue-700 bg-blue-100 px-4 py-3 text-base font-black tracking-[0.08em] text-blue-800">
          {redirecting ? "CLUB HOME MODE" : "CLUB DISCOVERY MODE"}
        </div>
        <div>클럽 화면을 불러오는 중...</div>
        <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-xs leading-5 text-red-900">
          <div className="font-bold">클럽 디버그</div>
          <div>route: /clubs</div>
          <div>auth ready: {String(authReady)}</div>
          <div>auth user id: {authUserId ?? debugState.authUserId ?? "-"}</div>
          <div>auth user email: {authUserEmail ?? debugState.authUserEmail ?? "-"}</div>
          <div>loading: {String(loading)}</div>
          <div>error: {loadError ?? "-"}</div>
          <div>routing: {debugState.routingDecision}</div>
          <div>membership result count: {Array.isArray(debugState.clubMembersRaw) ? debugState.clubMembersRaw.length : 0}</div>
          <div>clubs result count: {Array.isArray(debugState.clubsRaw) ? debugState.clubsRaw.length : 0}</div>
          <div>myClubs length: {myClubs.length}</div>
          <div>discoveryClubs length: {clubs.length}</div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(
              {
                authUser: debugState.authUser,
                clubMembers: debugState.clubMembersRaw,
                clubs: debugState.clubsRaw,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
        BUILD TAG · {DEBUG_BUILD_LABEL} · route:/clubs
      </div>
      <div className="mb-6 border-4 border-red-600 bg-yellow-200 px-4 py-3 text-base font-black tracking-[0.08em] text-red-700">
        DEBUG CLUB PAGE ACTIVE
      </div>
      <div className="mb-6 border-4 border-blue-700 bg-blue-100 px-4 py-3 text-base font-black tracking-[0.08em] text-blue-800">
        CLUB DISCOVERY MODE
      </div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
        {profile ? <Link href="/profile" className="poster-button-secondary">프로필 설정</Link> : null}
        <Link href="/clubs" className="poster-button-secondary">클럽 탐색</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">클럽 탐색</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">클럽 탐색</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/68">
          클럽 소개를 보고, 가입 신청을 보내고, 클럽 생성 요청과 내 요청 이력을 확인할 수 있습니다.
        </p>
        {loadError ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div> : null}
        <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-xs leading-5 text-red-900">
          <div className="font-bold">클럽 디버그</div>
          <div>route: /clubs</div>
          <div>auth ready: {String(authReady)}</div>
          <div>auth user id: {authUserId ?? debugState.authUserId ?? "-"}</div>
          <div>auth user email: {authUserEmail ?? debugState.authUserEmail ?? "-"}</div>
          <div>loading: {String(loading)}</div>
          <div>error: {loadError ?? "-"}</div>
          <div>routing: {debugState.routingDecision}</div>
          <div>membership result count: {Array.isArray(debugState.clubMembersRaw) ? debugState.clubMembersRaw.length : 0}</div>
          <div>clubs result count: {Array.isArray(debugState.clubsRaw) ? debugState.clubsRaw.length : 0}</div>
          <div>myClubs length: {myClubs.length}</div>
          <div>discoveryClubs length: {clubs.length}</div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(
              {
                authUser: debugState.authUser,
                clubMembers: debugState.clubMembersRaw,
                clubs: debugState.clubsRaw,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </section>
      <div className="fixed bottom-3 right-3 z-50 max-w-[92vw] rounded-lg border border-black/20 bg-black/85 px-3 py-2 text-[10px] leading-4 text-white shadow-lg">
        <div>BUILD TAG {DEBUG_BUILD_LABEL}</div>
        <div>route /clubs</div>
        <div>auth {authUserId ? "yes" : "no"}</div>
        <div>memberships {Array.isArray(debugState.clubMembersRaw) ? debugState.clubMembersRaw.length : 0}</div>
        <div>clubs {Array.isArray(debugState.clubsRaw) ? debugState.clubsRaw.length : 0}</div>
        <div>myClubs {myClubs.length}</div>
        <div>{debugState.routingDecision}</div>
      </div>

      <section className="grid gap-10 border-t border-line py-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-black">내 클럽</h2>
            <div className="mt-4 space-y-3">
              {profile ? (
                myClubs.length > 0 ? (
                  myClubs.map((club) => (
                    <Link key={club.id} href={`/clubs/${club.id}`} className="block border-b border-line py-3">
                      <div className="font-semibold">{club.clubName}</div>
                      <div className="mt-1 text-xs text-ink/60">
                        {club.region ? `${club.region} · ` : ""}승인된 클럽
                      </div>
                    </Link>
                  ))
                ) : loadError ? (
                  <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">내 클럽 정보를 다시 불러와 주세요.</div>
                ) : (
                  <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">아직 가입된 클럽이 없습니다.</div>
                )
              ) : (
                <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">로그인하면 내 클럽을 확인할 수 있습니다.</div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-black">클럽 목록</h2>
            <div className="mt-4 space-y-3">
              {clubs.length > 0 ? (
                clubs.map((club) => (
                  <div key={club.id} className="border-b border-line py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold">{club.clubName}</div>
                        <div className="mt-1 text-xs text-ink/60">
                          {club.region ? `${club.region} · ` : ""}
                          {club.description ?? "소개가 아직 없습니다."}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <span className="text-accentStrong">{club.status === "approved" ? "승인됨" : "운영중"}</span>
                          <span className={club.visibility === "private" ? "text-red-700" : "text-ink/55"}>
                            {club.visibility === "private" ? "비공개" : "공개"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Link href={`/clubs/${club.id}`} className="poster-button-secondary text-xs">
                          상세보기
                        </Link>
                        {club.visibility === "private" ? (
                          <button type="button" disabled className="poster-button-secondary text-xs opacity-50">
                            비공개
                          </button>
                        ) : (
                          <Link href={`/clubs/${club.id}`} className="poster-button-secondary text-xs">
                            가입하기
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : loadError ? (
                <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">클럽 목록을 다시 불러와 주세요.</div>
              ) : (
                <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">아직 등록된 클럽이 없습니다.</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-black">클럽 생성 요청</h2>
            <form onSubmit={handleSubmitApplication} className="mt-4 grid gap-4 border-t border-line py-6">
              <label className="grid gap-2 text-sm font-semibold">
                클럽 이름
                <input value={clubName} onChange={(event) => setClubName(event.target.value.slice(0, 20))} className="poster-input" maxLength={20} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                지역
                <input value={region} onChange={(event) => setRegion(event.target.value.slice(0, 10))} className="poster-input" maxLength={10} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                클럽 소개
                <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 300))} className="poster-input min-h-32" maxLength={300} />
              </label>
              {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
              {info ? <div className="border-l-2 border-accentStrong pl-4 text-sm text-accentStrong">{info}</div> : null}
              <button type="submit" disabled={submitting || !profile} className="poster-button w-fit disabled:opacity-60">
                {submitting ? "요청 중..." : "클럽 생성 요청"}
              </button>
              {!profile ? <div className="text-xs text-ink/55">로그인 후 요청할 수 있습니다.</div> : null}
            </form>
          </div>

          <div>
            <h2 className="text-2xl font-black">내 요청 이력</h2>
            <div className="mt-4 space-y-3">
              {profile ? (
                applications.length > 0 ? (
                  applications.map((application) => (
                    <div key={application.id} className="border-b border-line py-3">
                      <div className="font-semibold">{application.clubName}</div>
                      <div className="mt-1 text-xs text-ink/60">{application.region} · {application.status}</div>
                      {application.rejectionReason ? <div className="mt-1 text-xs text-red-700">사유: {application.rejectionReason}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">아직 생성 요청 이력이 없습니다.</div>
                )
              ) : (
                <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">로그인하면 요청 이력을 확인할 수 있습니다.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
