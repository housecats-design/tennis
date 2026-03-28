"use client";

import { getCurrentProfile } from "@/lib/auth";
import { listAllClubApplications, reviewClubApplication } from "@/lib/clubs";
import { buildAdminUserSummaries, buildGlobalAdminSummary } from "@/lib/history";
import { softDeleteUserProfile } from "@/lib/users";
import { AdminUserSummary, ClubApplication, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [clubApplications, setClubApplications] = useState<ClubApplication[]>([]);
  const [applicationInfo, setApplicationInfo] = useState<string | null>(null);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null);
  const [processingApplicationId, setProcessingApplicationId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const currentProfile = await getCurrentProfile();
      setProfile(currentProfile);
      if (!currentProfile) {
        router.replace("/");
        return;
      }

      if (!currentProfile.isAdmin) {
        router.replace("/");
        return;
      }

      const [nextRows, nextApplications] = await Promise.all([
        buildAdminUserSummaries(),
        listAllClubApplications(),
      ]);
      setRows(nextRows);
      setClubApplications(nextApplications);
      setLoading(false);
    };

    void load();
  }, [router]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows
      .filter((row) => (showDeleted ? true : !row.profile.isDeleted))
      .filter((row) =>
        !keyword
          ? true
          : row.profile.displayName.toLowerCase().includes(keyword) ||
            row.profile.email.toLowerCase().includes(keyword) ||
            row.profile.loginId.toLowerCase().includes(keyword),
      );
  }, [rows, search, showDeleted]);
  const summary = buildGlobalAdminSummary(rows);
  const pendingClubApplications = useMemo(
    () => clubApplications.filter((application) => application.status === "pending"),
    [clubApplications],
  );
  const applicantNameMap = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.profile.id,
          row.profile.displayName,
        ]),
      ),
    [rows],
  );

  function formatClubApplicationStatus(status: ClubApplication["status"]): string {
    return status === "approved" ? "수락됨" : status === "rejected" ? "거절됨" : "대기중";
  }

  async function handleReviewClubApplication(applicationId: string, status: "approved" | "rejected"): Promise<void> {
    if (!profile?.isAdmin) {
      return;
    }

    const target = clubApplications.find((application) => application.id === applicationId);
    if (!target) {
      return;
    }

    const confirmMessage =
      status === "approved"
        ? `${target.clubName} 클럽 신청을 수락하시겠습니까?`
        : `${target.clubName} 클럽 신청을 거절하시겠습니까?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const rejectionReason =
      status === "rejected" ? window.prompt("거절 사유를 입력하세요. (선택)") : null;

    setProcessingApplicationId(applicationId);
    setApplicationInfo(null);
    setApplicationError(null);
    try {
      const result = await reviewClubApplication({
        applicationId,
        reviewerUserId: profile.id,
        status,
        rejectionReason,
      });
      setClubApplications((current) =>
        current.map((application) => (application.id === applicationId ? result.application : application)),
      );
      setApplicationInfo(
        status === "approved"
          ? `클럽 신청을 수락했습니다.${result.createdClub ? ` ${result.createdClub.clubName} 클럽이 생성되었습니다.` : ""}`
          : "클럽 신청을 거절했습니다.",
      );
    } catch (reviewError) {
      setApplicationError(reviewError instanceof Error ? reviewError.message : "클럽 신청 처리에 실패했습니다.");
    } finally {
      setProcessingApplicationId(null);
    }
  }

  if (loading) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">관리자 데이터를 불러오는 중...</main>;
  }

  if (!profile?.isAdmin) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">권한을 확인하는 중...</main>;
  }

  return (
    <main className="poster-page max-w-7xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">
          메인페이지로 이동
        </Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">관리자</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">관리자 페이지</h1>
        <p className="mt-3 text-sm text-ink/68">회원 관리 및 통계</p>
      </section>

      <section className="grid gap-4 border-t border-line py-6 sm:grid-cols-3 lg:grid-cols-6">
        <div><div className="poster-label">전체 회원</div><div className="mt-2 text-3xl font-black">{summary.totalUsers}</div></div>
        <div><div className="poster-label">저장 이벤트</div><div className="mt-2 text-3xl font-black">{summary.totalEvents}</div></div>
        <div><div className="poster-label">누적 경기</div><div className="mt-2 text-3xl font-black">{summary.totalMatches}</div></div>
        <div><div className="poster-label">누적 승</div><div className="mt-2 text-3xl font-black">{summary.totalWins}</div></div>
        <div><div className="poster-label">누적 패</div><div className="mt-2 text-3xl font-black">{summary.totalLosses}</div></div>
        <div><div className="poster-label">대기중 신청</div><div className="mt-2 text-3xl font-black">{pendingClubApplications.length}</div></div>
      </section>

      <section className="border-t border-line py-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-black">클럽 신청 관리</h2>
          <div className="text-sm font-semibold text-ink/68">대기중 {pendingClubApplications.length}건</div>
        </div>
        {applicationError ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{applicationError}</div> : null}
        {applicationInfo ? <div className="mb-4 border-l-2 border-accentStrong pl-4 text-sm text-accentStrong">{applicationInfo}</div> : null}
        <div className="overflow-x-auto">
          <table className="poster-table min-w-full text-left">
            <thead>
              <tr>
                <th>클럽 이름</th>
                <th>신청자</th>
                <th>지역</th>
                <th>소개</th>
                <th>신청일시</th>
                <th>상태</th>
                <th>상세보기</th>
                <th>수락</th>
                <th>거절</th>
              </tr>
            </thead>
            <tbody>
              {clubApplications.map((application) => {
                const expanded = expandedApplicationId === application.id;
                const applicantName = applicantNameMap.get(application.applicantUserId) ?? application.applicantUserId;
                const disabled = processingApplicationId === application.id || application.status !== "pending";

                return (
                  <tr key={application.id}>
                    <td className="font-semibold">{application.clubName}</td>
                    <td>{applicantName}</td>
                    <td>{application.region}</td>
                    <td className="max-w-[280px] truncate text-ink/68">{application.description || "-"}</td>
                    <td>{new Date(application.createdAt).toLocaleString("ko-KR")}</td>
                    <td>{formatClubApplicationStatus(application.status)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setExpandedApplicationId((current) => (current === application.id ? null : application.id))}
                        className="poster-link"
                      >
                        상세보기
                      </button>
                      {expanded ? (
                        <div className="mt-2 max-w-[320px] text-xs leading-5 text-ink/65">
                          <div>소개: {application.description || "소개 없음"}</div>
                          {application.rejectionReason ? <div className="mt-1 text-red-700">거절 사유: {application.rejectionReason}</div> : null}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void handleReviewClubApplication(application.id, "approved")}
                        disabled={disabled}
                        className="text-sm font-semibold text-accentStrong disabled:opacity-40"
                      >
                        {processingApplicationId === application.id ? "처리 중..." : "수락"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void handleReviewClubApplication(application.id, "rejected")}
                        disabled={disabled}
                        className="text-sm font-semibold text-red-700 disabled:opacity-40"
                      >
                        {processingApplicationId === application.id ? "처리 중..." : "거절"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {clubApplications.length === 0 ? <div className="py-6 text-sm text-ink/70">클럽 생성 신청이 없습니다.</div> : null}
      </section>

      <section className="border-t border-line py-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-black">회원 목록</h2>
          <div className="flex items-center gap-3">
            <label className="text-xs text-ink/65">
              <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} className="mr-2" />
              삭제 회원 포함
            </label>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="poster-input max-w-xs" placeholder="이름 / 이메일 / 아이디 검색" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="poster-table min-w-full text-left">
            <thead>
              <tr>
                <th>아이디</th>
                <th>이메일</th>
                <th>이름</th>
                <th>저장 이벤트</th>
                <th>총 경기</th>
                <th>승</th>
                <th>패</th>
                <th>득점</th>
                <th>실점</th>
                <th>득실차</th>
                <th>메모</th>
                <th>상세</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.profile.id}>
                  <td>{row.profile.loginId}</td>
                  <td>{row.profile.email}</td>
                  <td>{row.profile.displayName}</td>
                  <td>{row.totalSavedEvents}</td>
                  <td>{row.totalMatches}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.pointsScored}</td>
                  <td>{row.pointsAllowed}</td>
                  <td>{row.pointDiff}</td>
                  <td className="max-w-[220px] truncate text-ink/65">{row.profile.memo || "-"}</td>
                  <td><Link href={`/admin/users/${row.profile.id}`} className="poster-link">열기</Link></td>
                  <td>
                    {row.profile.isDeleted ? (
                      <span className="text-xs font-semibold text-red-700">
                        삭제됨{row.profile.deletedAt ? ` · ${new Date(row.profile.deletedAt).toLocaleDateString("ko-KR")}` : ""}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`${row.profile.displayName} 회원을 삭제 처리하시겠습니까? 기록은 유지됩니다.`)) {
                            return;
                          }

                          void (async () => {
                            const next = await softDeleteUserProfile(row.profile.id);
                            if (!next) {
                              return;
                            }

                            setRows((current) =>
                              current.map((item) => (item.profile.id === next.id ? { ...item, profile: next } : item)),
                            );
                          })();
                        }}
                        className="text-sm font-semibold text-red-700"
                      >
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 ? <div className="py-6 text-sm text-ink/70">표시할 회원이 없습니다.</div> : null}
      </section>
    </main>
  );
}
