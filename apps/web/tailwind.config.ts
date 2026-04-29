import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"DM Serif Display"', "Georgia", "serif"],
        sans: ["Inter", "Helvetica", "Arial", "sans-serif"],
      },
      keyframes: {
        transcriptIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        waveBar: {
          "0%, 100%": { transform: "scaleY(0.25)" },
          "50%": { transform: "scaleY(1)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "transcript-in": "transcriptIn 0.28s ease-out forwards",
        "fade-up": "fadeUp 0.5s ease",
        "wave-bar": "waveBar 0.5s ease-in-out infinite",
        "pulse-dot": "pulseDot 2s ease infinite",
        "slide-in": "slideIn 0.25s ease",
        "spin-slow": "spin 0.7s linear infinite",
      },
      colors: {
        paper: "#F9F9F7",
        ink: {
          DEFAULT: "#333333",
          light: "#666666",
          faint: "#AAAAAA",
        },
        rule: "#D0D0CB",
        terracotta: "#E07A5F",
        sage: {
          DEFAULT: "#81B29A",
          light: "#C8DDD5",
        },
        "warm-white": "#F2F0EB",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
