import { Text, type TextProps } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";

type Variant = "title" | "subtitle" | "body" | "label";

const variantClassName: Record<Variant, string> = {
  title: "font-serif text-[28px] font-bold leading-8 tracking-tight text-foreground",
  subtitle: "text-sm leading-5 text-muted-foreground",
  body: "text-base leading-6 text-foreground",
  label: "font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground",
};

export function AppText({
  className = "",
  variant = "body",
  style,
  ...props
}: TextProps & { variant?: Variant; className?: string }) {
  const { direction } = useLocale();
  const { isDark } = useTheme();

  const themeClassName =
    variant === "title"
      ? isDark
        ? "text-[#e6e2dd]"
        : ""
      : variant === "subtitle" || variant === "label"
        ? isDark
          ? "text-[#9ca3af]"
          : ""
        : isDark
          ? "text-[#e6e2dd]"
          : "";

  return (
    <Text
      className={`${variantClassName[variant]} ${themeClassName} ${className}`}
      style={[style, { writingDirection: direction }]}
      {...props}
    />
  );
}
