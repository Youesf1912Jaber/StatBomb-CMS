import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#04120C",
          900: "#0A1F16",
          800: "#0F2E1F",
          700: "#154029",
          600: "#1D5636",
          500: "#276E45",
        },
        chalk: {
          50: "#F6F8F5",
          100: "#EAEFE7",
          200: "#D3DCCE",
        },
        clock: {
          amber: "#D9A441",
          red: "#C1462F",
        },
        ink: "#0C1210",
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
