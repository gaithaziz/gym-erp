import { Platform } from "react-native";

export type ThemeMode = "light" | "dark";
export type Locale = "en" | "ar";

export const themes = {
  light: {
    background: "#F5F5F4",
    foreground: "#0C0A09",
    card: "#FFFFFF",
    cardAlt: "#FAFAF9",
    primary: "#EA580C",
    primarySoft: "#FDE7D8",
    border: "#D6D3D1",
    muted: "#57534E",
    mutedSoft: "#A8A29E",
    inverseBackground: "#1C1917",
    inverseForeground: "#FFFFFF",
  },
  dark: {
    background: "#0F1419",
    foreground: "#E6E2DD",
    card: "#151A21",
    cardAlt: "#1E2329",
    primary: "#FF6B00",
    primarySoft: "#332014",
    border: "#2A2F3A",
    muted: "#9CA3AF",
    mutedSoft: "#6B7280",
    inverseBackground: "#E6E2DD",
    inverseForeground: "#0F1419",
  },
} as const;

export const fonts = {
  en: Platform.select({
    ios: {
      display: "Georgia",
      body: "System",
      mono: "Menlo",
    },
    android: {
      display: "serif",
      body: "sans-serif",
      mono: "monospace",
    },
    default: {
      display: "serif",
      body: "sans-serif",
      mono: "monospace",
    },
  }),
  ar: Platform.select({
    ios: {
      display: "Tajawal_800ExtraBold",
      body: "Tajawal_500Medium",
      mono: "Tajawal_500Medium",
    },
    android: {
      display: "Tajawal_800ExtraBold",
      body: "Tajawal_500Medium",
      mono: "Tajawal_500Medium",
    },
    default: {
      display: "Tajawal_800ExtraBold",
      body: "Tajawal_500Medium",
      mono: "Tajawal_500Medium",
    },
  }),
} as const;
