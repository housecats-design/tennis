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
        surface: "#f6f8ef",
        ink: "#10231a",
        accent: "#2f6f4f",
        accentStrong: "#173b2b",
        line: "#d5dfd2",
      },
      boxShadow: {
        panel: "0 16px 40px rgba(16, 35, 26, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
