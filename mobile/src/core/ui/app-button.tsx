import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { getRowDirection } from "@/src/core/i18n/rtl";
import { resolveFontFamily } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";

type ButtonVariant = "primary" | "secondary";

const variantClassName: Record<ButtonVariant, string> = {
  primary: "rounded-lg bg-primary",
  secondary: "rounded-lg border border-border bg-secondary",
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
  const { direction, locale } = useLocale();
  const { isDark } = useTheme();

  const resolvedVariantClassName =
    variant === "primary"
      ? "rounded-lg bg-primary"
      : isDark
        ? "rounded-lg border border-[#2a2f3a] bg-[#2a2f3a]"
        : variantClassName.secondary;

  const resolvedTextColor =
    variant === "primary"
      ? isDark
        ? "#e6e2dd"
        : "#0c0a09"
      : isDark
        ? "#e6e2dd"
        : "#0c0a09";
  const activityIndicatorColor = resolvedTextColor;
  const rowDirection = getRowDirection(direction);

  return (
    <Pressable
      className={`min-h-[44px] flex-row items-center justify-center gap-2 px-5 py-2.5 active:scale-[0.97] ${resolvedVariantClassName} ${className}`}
      style={{ flexDirection: rowDirection }}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={activityIndicatorColor} />
      ) : (
        <Text
          className="text-sm"
          style={{ color: resolvedTextColor, fontFamily: resolveFontFamily(locale, "serif", "regular") }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
