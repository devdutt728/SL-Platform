import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-primary)", "Roboto", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "serif"],
      },
      colors: {
        brand: "#E74011",
        dim: "#5D5552",
        ink: "rgb(var(--ink) / <alpha-value>)",
        lotus: "rgb(var(--lotus) / <alpha-value>)",
        leaf: "rgb(var(--leaf) / <alpha-value>)",
        sand: "rgb(var(--sand) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)",
        steel: "rgb(var(--steel) / <alpha-value>)",
        slate: {
          50: "#faf8f7",
          100: "#f1ecea",
          200: "#e3dedc",
          300: "#d1cbc8",
          400: "#b7aea8",
          500: "#9c918a",
          600: "#7f756f",
          700: "#655d58",
          800: "#4b4541",
          900: "#2f2927",
          950: "#1f1a18",
        },
      },
      boxShadow: {
        card: "0 8px 24px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
