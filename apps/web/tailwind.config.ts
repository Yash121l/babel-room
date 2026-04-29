import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        transcriptIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "transcript-in": "transcriptIn 0.28s ease-out forwards",
      },
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
