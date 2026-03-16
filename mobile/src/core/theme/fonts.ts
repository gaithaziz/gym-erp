export const fontFamilies = {
  serif: {
    regular: "Fraunces-SemiBold",
    bold: "Fraunces-Bold",
  },
  sans: {
    regular: "Outfit-Regular",
    medium: "Outfit-Medium",
    bold: "Outfit-Bold",
  },
  mono: {
    regular: "JetBrainsMono-Regular",
    bold: "JetBrainsMono-Bold",
  },
  arabic: {
    regular: "Tajawal-Regular",
    bold: "Tajawal-Bold",
  },
} as const;

type FontTone = "sans" | "serif" | "mono";
type FontWeight = "regular" | "medium" | "bold";

export function resolveFontFamily(locale: string, tone: FontTone, weight: FontWeight = "regular") {
  if (locale === "ar") {
    return weight === "bold" ? fontFamilies.arabic.bold : fontFamilies.arabic.regular;
  }

  if (tone === "serif") {
    return weight === "bold" ? fontFamilies.serif.bold : fontFamilies.serif.regular;
  }

  if (tone === "mono") {
    return weight === "bold" ? fontFamilies.mono.bold : fontFamilies.mono.regular;
  }

  if (weight === "bold") return fontFamilies.sans.bold;
  if (weight === "medium") return fontFamilies.sans.medium;
  return fontFamilies.sans.regular;
}

export function resolveFontFromClassName(locale: string, className: string, fallbackTone: FontTone = "serif") {
  const tone = className.includes("font-mono")
    ? "mono"
    : className.includes("font-serif")
      ? "serif"
      : fallbackTone;
  const weight = className.includes("font-bold") || className.includes("font-extrabold") || className.includes("font-semibold")
    ? "bold"
    : className.includes("font-medium")
      ? "medium"
      : "regular";

  return resolveFontFamily(locale, tone, weight);
}
