"use client";

import { getCurrentProfile } from "@/lib/auth";
import { buildAdminUserSummaries, buildGlobalAdminSummary } from "@/lib/history";
import { softDeleteUserProfile } from "@/lib/users";
import { AdminUserSummary, UserProfile } from "@/lib/types";
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

      setRows(await buildAdminUserSummaries());
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

  if (loading) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">관리자 데이터를 불러오는 중...</main>;
  }

  if (!profile?.isAdmin) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">권한을 확인하는 중...</main>;
  }

  return (
    <main className="poster-page max-w-7xl">
      <section className="border-t border-line py-8">
        <p className="poster-label">Admin</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">관리자 페이지</h1>
        <p className="mt-3 text-sm text-ink/68">회원 관리 및 통계</p>
      </section>

      <section className="grid gap-4 border-t border-line py-6 sm:grid-cols-3 lg:grid-cols-6">
        <div><div className="poster-label">TOTAL USERS</div><div className="mt-2 text-3xl font-black">{summary.totalUsers}</div></div>
        <div><div className="poster-label">TOTAL EVENTS</div><div className="mt-2 text-3xl font-black">{summary.totalEvents}</div></div>
        <div><div className="poster-label">TOTAL MATCHES</div><div className="mt-2 text-3xl font-black">{summary.totalMatches}</div></div>
        <div><div className="poster-label">WINS</div><div className="mt-2 text-3xl font-black">{summary.totalWins}</div></div>
        <div><div className="poster-label">LOSSES</div><div className="mt-2 text-3xl font-black">{summary.totalLosses}</div></div>
        <div><div className="poster-label">POINTS</div><div className="mt-2 text-3xl font-black">{summary.totalPoints}</div></div>
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
