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
  return (
    <html lang="ko">
      <body>
        <GlobalInvitationOverlay />
        {children}
      </body>
    </html>
  );
}
