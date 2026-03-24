"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="poster-page flex min-h-screen items-center">
      <section className="grid w-full gap-10 border-t border-line py-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="poster-label">Tennis Match Scheduler</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-black tracking-[-0.04em] text-ink sm:text-6xl">
            Premium Tennis Event Schedule
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-ink/68">
            호스트가 이벤트를 만들고, 게스트가 QR 또는 코드로 참여한 뒤 라운드 진행, 점수 확정,
            이동 안내, 리더보드까지 한 흐름으로 확인하는 테니스 운영 화면입니다.
          </p>
        </div>

        <div className="grid content-start gap-0 border-y border-line">
          <Link href="/host" className="group border-b border-line px-0 py-8">
            <div className="text-3xl font-black text-accentStrong">호스트</div>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              이벤트 생성, 참가자 정리, 전체 라운드 보기, 점수 확정
            </p>
          </Link>

          <Link href="/guest" className="group px-0 py-8">
            <div className="text-3xl font-black text-ink">게스트</div>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              이벤트 참여, 현재 경기 확인, 코트 이동, 휴식 및 알림 확인
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
