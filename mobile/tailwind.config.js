/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#f5f5f4",
        foreground: "#0c0a09",
        card: "#ffffff",
        primary: "#ea580c",
        secondary: "#e7e5e4",
        muted: "#e7e5e4",
        "muted-foreground": "#57534e",
        border: "#d6d3d1",
        destructive: "#ef4444",
        success: "#16a34a",
        ink: "#0c0a09",
        sand: "#f5f5f4",
        panel: "#ffffff",
        accent: "#ea580c",
        "accent-strong": "#c2410c",
        danger: "#ef4444",
        "ink-soft": "#1c1917",
        "panel-strong": "#e7e5e4",
        "sky-tint": "#e7e5e4",
        "clay-tint": "#fed7aa",
        "gold-tint": "#fdba74",
      },
    },
  },
  plugins: [],
};
