import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#F7F9F9",
        ink: "#111111",
        accent: "#2C7A7B",
        accentStrong: "#0F3D3E",
        line: "#E5E7EB",
        round1: "#0F3D3E",
        round2: "#1F5E60",
        round3: "#2C7A7B",
        round4: "#3F9A9C",
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(229, 231, 235, 0.85)",
      },
    },
  },
  plugins: [],
};

export default config;
