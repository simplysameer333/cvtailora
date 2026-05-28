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
        brand: {
          50:  "#edf2fb",
          100: "#d0def5",
          400: "#3d6ab8",
          500: "#254e9a",
          600: "#1b3868",
          700: "#142c54",
        },
        teal: {
          50:  "#e8fdf6",
          100: "#c8f7e8",
          400: "#2ed9b8",
          500: "#10c9a0",
          600: "#0cad8a",
          700: "#098f72",
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
