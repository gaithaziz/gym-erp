import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";

type ButtonVariant = "primary" | "secondary";

const variantClassName: Record<ButtonVariant, string> = {
  primary: "rounded-lg bg-primary",
  secondary: "rounded-lg border border-border bg-secondary",
};

const textClassName: Record<ButtonVariant, string> = {
  primary: "text-white",
  secondary: "text-foreground",
};

export function AppButton({
  title,
  loading = false,
  variant = "primary",
  className = "",
  ...props
}: PressableProps & {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  className?: string;
}) {
  const { direction } = useLocale();
  const { isDark } = useTheme();

  const resolvedVariantClassName =
    variant === "primary"
      ? "rounded-lg bg-primary"
      : isDark
        ? "rounded-lg border border-[#2a2f3a] bg-[#1e2329]"
        : variantClassName.secondary;

  const resolvedTextClassName =
    variant === "primary"
      ? textClassName.primary
      : isDark
        ? "text-[#e6e2dd]"
        : textClassName.secondary;

  return (
    <Pressable
      className={`min-h-12 flex-row items-center justify-center gap-2 px-5 active:scale-[0.97] ${resolvedVariantClassName} ${className}`}
      style={{ flexDirection: direction === "rtl" ? "row-reverse" : "row" }}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#ffffff" : isDark ? "#e6e2dd" : "#0c0a09"} />
      ) : (
        <Text className={`text-sm font-semibold ${resolvedTextClassName}`}>{title}</Text>
      )}
    </Pressable>
  );
}
