import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function getGitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || getGitShortSha(),
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
  },
};

export default nextConfig;
