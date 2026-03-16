import { Text, type TextProps } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { getTextAlign } from "@/src/core/i18n/rtl";
import { resolveFontFamily, resolveFontFromClassName } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";

type Variant = "title" | "subtitle" | "body" | "label";

const variantClassName: Record<Variant, string> = {
  title: "text-[28px] leading-8 tracking-tight text-foreground",
  subtitle: "text-sm leading-5 text-muted-foreground",
  body: "text-base leading-6 text-foreground",
  label: "text-[10px] uppercase tracking-[1.6px] text-muted-foreground",
};

function stripManagedFontClasses(value: string) {
  return value
    .replace(/\bfont-(serif|sans|mono|bold|semibold|medium|extrabold)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function AppText({
  className = "",
  variant = "body",
  style,
  ...props
}: TextProps & { variant?: Variant; className?: string }) {
  const { direction, locale } = useLocale();
  const { isDark } = useTheme();
  const variantFontFamily =
    variant === "title"
      ? resolveFontFamily(locale, "serif", "bold")
      : variant === "label"
        ? resolveFontFamily(locale, "mono", "bold")
        : resolveFontFamily(locale, "serif", "regular");
  const classFontFamily = resolveFontFromClassName(locale, className, "serif");
  const sanitizedClassName = stripManagedFontClasses(className);

  const wantsPrimaryTone =
    className.includes("text-primary") ||
    className.includes("text-orange-");

  const preservesSemanticColor =
    className.includes("text-danger") ||
    className.includes("text-emerald-") ||
    className.includes("text-rose-") ||
    className.includes("text-sky-") ||
    className.includes("text-red-") ||
    className.includes("text-white");

  const wantsMutedTone =
    variant === "subtitle" ||
    variant === "label" ||
    className.includes("text-muted-foreground");

  const themeTextColor =
    wantsPrimaryTone
      ? isDark
        ? "#e6e2dd"
        : "#0c0a09"
      : preservesSemanticColor
        ? undefined
      : wantsMutedTone
        ? isDark
          ? "#9ca3af"
          : "#57534e"
        : isDark
          ? "#e6e2dd"
          : "#0c0a09";

  return (
    <Text
      className={`${variantClassName[variant]} ${sanitizedClassName}`}
      style={[
        { writingDirection: direction, textAlign: getTextAlign(direction), color: themeTextColor },
        style,
        { fontFamily: className ? classFontFamily : variantFontFamily },
      ]}
      {...props}
    />
  );
}
