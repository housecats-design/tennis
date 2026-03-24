"use client";

import { getCurrentProfile } from "@/lib/auth";
import { buildAdminUserSummaries, buildGlobalAdminSummary } from "@/lib/history";
import { AdminUserSummary, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function AdminPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const currentProfile = await getCurrentProfile();
      setProfile(currentProfile);
      if (currentProfile?.isAdmin) {
        setRows(await buildAdminUserSummaries());
      }
      setLoading(false);
    };

    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return rows;
    }

    return rows.filter((row) =>
      row.profile.displayName.toLowerCase().includes(keyword) ||
      row.profile.email.toLowerCase().includes(keyword) ||
      row.profile.loginId.toLowerCase().includes(keyword),
    );
  }, [rows, search]);
  const summary = buildGlobalAdminSummary(rows);

  if (loading) {
    return <main className="poster-page max-w-6xl text-sm text-ink/70">관리자 데이터를 불러오는 중...</main>;
  }

  if (!profile?.isAdmin) {
    return (
      <main className="poster-page max-w-6xl">
        <div className="border-t border-line py-8">
          <h1 className="text-4xl font-black tracking-[-0.04em]">관리자 권한이 없습니다.</h1>
          <Link href="/" className="poster-button mt-5">홈으로</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="poster-page max-w-7xl">
      <section className="border-t border-line py-8">
        <p className="poster-label">Admin</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">마스터 관리자</h1>
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="poster-input max-w-xs" placeholder="이름 / 이메일 / 아이디 검색" />
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
                <th>상세</th>
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
                  <td><Link href={`/admin/users/${row.profile.id}`} className="poster-link">열기</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
