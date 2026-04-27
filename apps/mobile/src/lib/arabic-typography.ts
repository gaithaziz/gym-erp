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

  return {
    letterSpacing: 0,
    ...(safeLineHeight ? { lineHeight: safeLineHeight } : null),
    ...(Platform.OS === "android" ? { includeFontPadding: true } : null),
  } satisfies TextStyle;
}
