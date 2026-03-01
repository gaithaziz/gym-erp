/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        sand: "#f6f1e8",
        panel: "#fffaf1",
        accent: "#c56a1a",
        "accent-strong": "#8f4d10",
        muted: "#6b7280",
        border: "#e7dcc9",
        success: "#0f766e",
        danger: "#b91c1c",
      },
    },
  },
  plugins: [],
};
