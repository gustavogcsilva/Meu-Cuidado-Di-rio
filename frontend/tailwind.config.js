/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d302c",
        muted: "#75827e",
        canvas: "#f5f8f6",
        forest: "#246b59",
        mint: "#e5f2eb",
      },
      boxShadow: {
        card: "0 8px 30px rgba(34, 69, 58, 0.06)",
      },
    },
  },
  plugins: [],
};
