import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
