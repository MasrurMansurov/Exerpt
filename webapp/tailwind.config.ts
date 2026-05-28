import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--cp-bg) / <alpha-value>)",
        panel: "rgb(var(--cp-panel) / <alpha-value>)",
        "panel-strong": "rgb(var(--cp-panel-strong) / <alpha-value>)",
        surface: "rgb(var(--cp-surface) / <alpha-value>)",
        border: "rgb(var(--cp-border) / <alpha-value>)",
        primary: "rgb(var(--cp-text-primary) / <alpha-value>)",
        secondary: "rgb(var(--cp-text-secondary) / <alpha-value>)",
        muted: "rgb(var(--cp-text-muted) / <alpha-value>)",
        ink: "rgb(var(--cp-ink) / <alpha-value>)",
        signal: "rgb(var(--cp-signal) / <alpha-value>)",
        cobalt: "rgb(var(--cp-cobalt) / <alpha-value>)",
        warning: "rgb(var(--cp-warning) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["var(--cp-font-sans)"],
        mono: ["var(--cp-font-mono)"]
      },
      fontSize: {
        "ui-12": ["var(--cp-text-12)", { lineHeight: "16px" }],
        "ui-14": ["var(--cp-text-14)", { lineHeight: "20px" }],
        "ui-16": ["var(--cp-text-16)", { lineHeight: "24px" }],
        "ui-20": ["var(--cp-text-20)", { lineHeight: "28px" }],
        "ui-24": ["var(--cp-text-24)", { lineHeight: "32px" }],
        "ui-32": ["var(--cp-text-32)", { lineHeight: "40px" }],
        "ui-40": ["var(--cp-text-40)", { lineHeight: "48px" }],
        "ui-48": ["var(--cp-text-48)", { lineHeight: "56px" }]
      },
      boxShadow: {
        glow: "var(--cp-shadow-glow)",
        glass: "var(--cp-shadow-glass)"
      },
      keyframes: {
        "fade-panel": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-panel": "fade-panel 180ms ease-out",
        shimmer: "shimmer 1.2s ease-in-out infinite"
      }
    }
  },
  plugins: [forms]
};

export default config;
