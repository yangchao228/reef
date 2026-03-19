import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-card": "var(--bg-card)",
        "bg-soft": "var(--bg-soft)",
        pri: "var(--pri)",
        "pri-d": "var(--pri-d)",
        "pri-l": "var(--pri-l)",
        "pri-xl": "var(--pri-xl)",
        border: "var(--border)",
        t1: "var(--t1)",
        t2: "var(--t2)",
        t3: "var(--t3)",
        t4: "var(--t4)",
      },
      boxShadow: {
        glow: "0 20px 80px rgba(29, 158, 117, 0.14)",
      },
      fontFamily: {
        sans: ["Avenir Next", "Segoe UI", "Helvetica Neue", "sans-serif"],
        display: [
          "Iowan Old Style",
          "Palatino Linotype",
          "Book Antiqua",
          "Georgia",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
