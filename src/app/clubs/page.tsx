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
import { FormEvent, useEffect, useState } from "react";

export default function ClubsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [memberships, setMemberships] = useState<ClubMember[]>([]);
  const [applications, setApplications] = useState<ClubApplication[]>([]);
  const [clubName, setClubName] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      let shouldKeepLoading = false;
      setLoadError(null);
      try {
        const supabase = getSupabaseClient();
        const authResult = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
        console.info("[clubs-routing] auth user object", authResult.data.user ?? null);
        if (authResult.error) {
          console.error("[clubs-routing] auth user fetch failed", authResult.error);
        }

        const nextProfile = await getCurrentProfile({ forceRefresh: true });
        setProfile(nextProfile);
        console.info("[clubs-routing] auth user", {
          authUserId: authResult.data.user?.id ?? null,
          userId: nextProfile?.id ?? null,
          email: nextProfile?.email ?? null,
        });

        let nextMemberships: ClubMember[] = [];
        let nextClubs: Club[] = [];
        if (nextProfile?.id) {
          const membershipPromise = supabase
            ? supabase
                .from("club_members")
                .select("id, club_id, user_id, role, membership_status, joined_at, approved_by, approved_at, left_at, is_active, deleted_at")
                .eq("user_id", nextProfile.id)
                .is("deleted_at", null)
                .eq("is_active", true)
                .order("joined_at", { ascending: false })
            : Promise.resolve({ data: [], error: null });
          const clubsPromise = supabase
            ? supabase
                .from("clubs")
                .select("id, club_name, region, description, visibility, created_by_user_id, status, approved_by, approved_at, is_active, deleted_at, created_at, updated_at")
                .is("deleted_at", null)
                .eq("is_active", true)
                .in("status", ["active", "approved"])
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null });

          const [membershipResult, clubsResult, applicationResult] = await Promise.allSettled([
            membershipPromise,
            clubsPromise,
            listMyClubApplications(nextProfile.id),
          ]);

          if (membershipResult.status === "fulfilled") {
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
                  membershipStatus: membershipRow.membership_status,
                  joinedAt: membershipRow.joined_at ?? new Date().toISOString(),
                  approvedBy: membershipRow.approved_by ?? null,
                  approvedAt: membershipRow.approved_at ?? null,
                  leftAt: membershipRow.left_at ?? null,
                  isActive: membershipRow.is_active ?? true,
                  deletedAt: membershipRow.deleted_at ?? null,
                }),
              );
            }
            console.info("[clubs-routing] club_members", {
              userId: nextProfile.id,
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
            setLoadError("내 클럽 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          }

          if (clubsResult.status === "fulfilled") {
            if (clubsResult.value.error) {
              console.error("[clubs-routing] clubs query error", clubsResult.value.error);
              setLoadError((current) => current ?? "클럽 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
            } else {
              nextClubs = (clubsResult.value.data ?? []).map((clubRow) =>
                normalizeClub({
                  id: clubRow.id,
                  clubName: clubRow.club_name,
                  region: clubRow.region ?? null,
                  description: clubRow.description ?? null,
                  visibility: clubRow.visibility ?? "public",
                  createdByUserId: clubRow.created_by_user_id,
                  status: clubRow.status ?? "active",
                  approvedBy: clubRow.approved_by ?? null,
                  approvedAt: clubRow.approved_at ?? null,
                  isActive: clubRow.is_active ?? true,
                  deletedAt: clubRow.deleted_at ?? null,
                  createdAt: clubRow.created_at ?? new Date().toISOString(),
                  updatedAt: clubRow.updated_at ?? new Date().toISOString(),
                }),
              );
              setClubs(nextClubs);
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
            setLoadError((current) => current ?? "클럽 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          }

          if (applicationResult.status === "fulfilled") {
            setApplications(applicationResult.value);
          } else {
            console.error("[clubs-routing] club applications fetch failed", applicationResult.reason);
          }

          setMemberships(nextMemberships);
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
            shouldKeepLoading = true;
            setRedirecting(true);
            router.replace(`/clubs/home?clubId=${defaultMembership.clubId}`);
            return;
          }
        } else {
          setMemberships([]);
          setApplications([]);
          try {
            nextClubs = await listActiveClubs({ strict: true });
            setClubs(nextClubs);
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
            setLoadError("클럽 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          }
        }
      } finally {
        if (!shouldKeepLoading) {
          setLoading(false);
        }
      }
    };

    void load();

    const supabase = getSupabaseClient();
    const authSubscription = supabase?.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      authSubscription?.data.subscription.unsubscribe();
    };
  }, [router]);

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

  const joinedClubIds = new Set(
    memberships
      .filter((membership) => isActiveClubMembership(membership))
      .map((membership) => membership.clubId),
  );

  const myClubs = clubs.filter((club) => joinedClubIds.has(club.id));

  useEffect(() => {
    console.info("[clubs-routing] render state", {
      myClubs: myClubs.map((club) => ({ id: club.id, clubName: club.clubName })),
      discoveryClubs: clubs.map((club) => ({ id: club.id, clubName: club.clubName, visibility: club.visibility ?? "public" })),
      loading,
      error: loadError,
    });
  }, [clubs, loadError, loading, myClubs]);

  if (loading || redirecting) {
    return <main className="poster-page max-w-5xl text-sm text-ink/70">클럽 화면을 불러오는 중...</main>;
  }

  return (
    <main className="poster-page max-w-6xl">
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
      </section>

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
