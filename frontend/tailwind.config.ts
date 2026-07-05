import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep-teal brand family — dark surfaces (sidebar/nav) live at 800/900
        brand: {
          50:  "#effaf8",
          100: "#d7f0ec",
          200: "#b2e0d9",
          300: "#84c7be",
          400: "#53a89e",
          500: "#358a81",
          600: "#256e67",
          700: "#1e5854",
          800: "#174645",
          900: "#0f3d3e",
        },
        // Emerald CTA family (replaces the old mint-teal accent)
        teal: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        // Warm off-white page background
        surface: "#fafaf7",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
