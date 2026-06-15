import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#1a1a2e",
          "navy-light": "#16213e",
          gold: "#f0a500",
          "gold-light": "#f5c842",
        },
        surface: {
          DEFAULT: "#0f0f1a",
          card: "#1a1a2e",
          hover: "#22223a",
          border: "#2d2d4a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
