"use client";

import { getCurrentProfile } from "@/lib/auth";
import { listActiveClubs, listMyClubApplications, submitClubApplication } from "@/lib/clubs";
import { Club, ClubApplication, UserProfile } from "@/lib/types";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const DEBUG_BUILD_LABEL = "branch:main commit:f5b73e6 env:club-debug";

export default function ClubDiscoveryPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [applications, setApplications] = useState<ClubApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const nextProfile = await getCurrentProfile({ forceRefresh: true });
      setProfile(nextProfile);
      setClubs(await listActiveClubs({ strict: true }));
      if (nextProfile?.id) {
        setApplications(await listMyClubApplications(nextProfile.id));
      } else {
        setApplications([]);
      }
      setLoading(false);
    };

    void load();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!profile) {
      setError("로그인 후 클럽 생성 요청을 보낼 수 있습니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const nextApplication = await submitClubApplication({
        applicantUserId: profile.id,
        clubName,
        region,
        description,
      });
      setApplications((current) => [nextApplication, ...current]);
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

  if (loading) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">클럽 탐색 화면을 불러오는 중...</main>;
  }

  return (
    <main className="poster-page max-w-6xl">
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
        BUILD TAG · {DEBUG_BUILD_LABEL} · route:/clubs/discovery
      </div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
        <Link href="/clubs/home" className="poster-button-secondary">내 클럽 홈</Link>
        <Link href="/clubs/discovery" className="poster-button-secondary">클럽 탐색</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">클럽 탐색</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">클럽 탐색</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/68">
          다른 클럽 목록을 보고 공개 여부를 확인하거나, 새로운 클럽 생성 요청을 보낼 수 있습니다.
        </p>
      </section>

      <section className="grid gap-10 border-t border-line py-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h2 className="text-2xl font-black">클럽 리스트</h2>
          <div className="mt-4 space-y-3">
            {clubs.length > 0 ? (
              clubs.map((club) => (
                <div key={club.id} className="border-b border-line py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">{club.clubName}</div>
                      <div className="mt-1 text-xs text-ink/60">
                        {club.description ?? "소개가 아직 없습니다."}
                      </div>
                      <div className="mt-2 text-xs font-semibold">
                        {club.visibility === "private" ? (
                          <span className="text-red-700">비공개</span>
                        ) : (
                          <span className="text-accentStrong">공개</span>
                        )}
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
            ) : (
              <div className="border-b border-dashed border-line py-3 text-sm text-ink/65">아직 공개된 클럽이 없습니다.</div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-black">클럽 생성 요청</h2>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 border-t border-line py-6">
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
      <div className="fixed bottom-3 right-3 z-50 max-w-[92vw] rounded-lg border border-black/20 bg-black/85 px-3 py-2 text-[10px] leading-4 text-white shadow-lg">
        <div>BUILD TAG {DEBUG_BUILD_LABEL}</div>
        <div>route /clubs/discovery</div>
        <div>profile {profile?.id ?? "-"}</div>
        <div>clubs {clubs.length}</div>
        <div>applications {applications.length}</div>
      </div>
    </main>
  );
}
