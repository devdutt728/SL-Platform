import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "serif"],
      },
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        lotus: "rgb(var(--lotus) / <alpha-value>)",
        leaf: "rgb(var(--leaf) / <alpha-value>)",
        sand: "rgb(var(--sand) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)",
        steel: "rgb(var(--steel) / <alpha-value>)",
      },
      boxShadow: {
        card: "0 8px 24px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
