import { Platform, type TextStyle } from "react-native";

function flattenTextStyle(style: any): TextStyle {
  if (!style) {
    return {};
  }
  if (Array.isArray(style)) {
    return style.reduce<TextStyle>((accumulator, item) => ({ ...accumulator, ...flattenTextStyle(item) }), {});
  }
  return style;
}

export function getArabicTextStyle(style: any) {
  const flattened = flattenTextStyle(style);
  const fontSize = typeof flattened.fontSize === "number" ? flattened.fontSize : undefined;
  const lineHeight = typeof flattened.lineHeight === "number" ? flattened.lineHeight : undefined;
  const safeLineHeight = fontSize ? Math.max(lineHeight ?? 0, Math.ceil(fontSize * 1.35)) : lineHeight;
  const weight = typeof flattened.fontWeight === "number"
    ? flattened.fontWeight
    : typeof flattened.fontWeight === "string"
      ? Number.parseInt(flattened.fontWeight, 10)
      : undefined;
  const arabicFontFamily =
    Platform.OS === "android"
      ? weight && weight >= 800
        ? "Tajawal_800ExtraBold"
        : weight && weight >= 700
          ? "Tajawal_700Bold"
          : weight && weight >= 600
            ? "Tajawal_700Bold"
            : weight && weight >= 500
              ? "Tajawal_500Medium"
              : "Tajawal_400Regular"
      : undefined;

  return {
    letterSpacing: 0,
    ...(arabicFontFamily ? { fontFamily: arabicFontFamily } : null),
    ...(safeLineHeight ? { lineHeight: safeLineHeight } : null),
    ...(Platform.OS === "android" ? { includeFontPadding: true } : null),
  } satisfies TextStyle;
}
