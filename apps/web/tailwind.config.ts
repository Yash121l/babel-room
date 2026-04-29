import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        room: {
          bg: "#0b1020",
          panel: "#121a2e",
          accent: "#38bdf8",
          muted: "#64748b",
          danger: "#f87171",
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
