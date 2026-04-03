import type { Metadata } from "next";
import { GlobalInvitationOverlay } from "@/components/global-invitation-overlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tennis Match Scheduler",
  description: "Generate fair singles and doubles tennis schedules.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const buildCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown";
  const buildEnv = process.env.NEXT_PUBLIC_BUILD_ENV ?? "unknown";

  return (
    <html lang="ko">
      <body>
        <div className="fixed right-3 top-3 z-[120] rounded-full border border-line bg-white/92 px-3 py-1 text-[11px] font-semibold tracking-[0.04em] text-ink shadow-sm backdrop-blur">
          버전 {buildCommit} · {buildEnv}
        </div>
        <GlobalInvitationOverlay />
        {children}
      </body>
    </html>
  );
}
