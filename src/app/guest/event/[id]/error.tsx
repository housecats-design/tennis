"use client";

import Link from "next/link";

export default function GuestEventError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[guest-event] route error boundary", error);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <div className="font-bold">게스트 화면 오류</div>
        <div className="mt-2">{error.message || "알 수 없는 오류가 발생했습니다."}</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-2xl bg-white px-4 py-3 font-semibold text-ink"
          >
            다시 시도
          </button>
          <Link href="/guest" className="rounded-2xl bg-white px-4 py-3 font-semibold text-ink">
            게스트 페이지로 이동
          </Link>
        </div>
      </div>
    </main>
  );
}
