import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "rgb(var(--pitch-950) / <alpha-value>)",
          900: "rgb(var(--pitch-900) / <alpha-value>)",
          800: "rgb(var(--pitch-800) / <alpha-value>)",
          700: "rgb(var(--pitch-700) / <alpha-value>)",
          600: "rgb(var(--pitch-600) / <alpha-value>)",
          500: "rgb(var(--pitch-500) / <alpha-value>)",
        },
        chalk: {
          50: "rgb(var(--chalk-50) / <alpha-value>)",
          100: "rgb(var(--chalk-100) / <alpha-value>)",
          200: "rgb(var(--chalk-200) / <alpha-value>)",
        },
        clock: {
          amber: "rgb(var(--clock-amber) / <alpha-value>)",
          red: "rgb(var(--clock-red) / <alpha-value>)",
        },
        ink: "rgb(var(--ink) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
