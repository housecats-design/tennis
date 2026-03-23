"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid w-full gap-6 rounded-3xl border border-line bg-white/90 p-8 shadow-panel lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mb-3 inline-flex rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-accentStrong">
            Tennis Event System
          </p>
          <h1 className="max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">
            호스트가 이벤트를 만들고, 게스트가 참여하는 테니스 경기 운영 화면
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/75 sm:text-base">
            이벤트 생성, 참가자 관리, 대진 생성, 라운드 진행, 알림, 리더보드까지 한 흐름으로
            관리할 수 있습니다.
          </p>
        </div>

        <div className="grid gap-4 self-center">
          <Link
            href="/host"
            className="rounded-3xl border border-accent bg-accentStrong px-6 py-6 text-white shadow-panel transition hover:translate-y-[-1px]"
          >
            <div className="text-2xl font-black">호스트</div>
            <p className="mt-2 text-sm text-white/80">
              이벤트 생성, 참가자 수정, 대진 생성, 점수 확정
            </p>
          </Link>

          <Link
            href="/guest"
            className="rounded-3xl border border-line bg-surface px-6 py-6 text-ink shadow-panel transition hover:translate-y-[-1px]"
          >
            <div className="text-2xl font-black">게스트</div>
            <p className="mt-2 text-sm text-ink/70">
              이벤트 참여, 현재 라운드 확인, 코트/휴식 안내 확인
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
