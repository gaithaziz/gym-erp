import { View, type ViewProps } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { getCrossAxisAlign } from "@/src/core/i18n/rtl";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppText } from "@/src/core/ui/app-text";

export function SectionChip({
  label,
  className = "",
  style,
  ...props
}: ViewProps & { label: string; className?: string }) {
  const { direction } = useLocale();
  const { isDark } = useTheme();
  const labelColor = isDark ? "#ff6b00" : "#c2410c";
  const chipStyle = {
    borderColor: isDark ? "rgba(255, 107, 0, 0.32)" : "rgba(194, 65, 12, 0.22)",
    backgroundColor: isDark ? "rgba(255, 107, 0, 0.1)" : "rgba(249, 115, 22, 0.1)",
  };

  return (
    <View
      className={`rounded-md border px-2 py-1 ${className}`}
      style={[{ alignSelf: getCrossAxisAlign(direction) }, chipStyle, style]}
      {...props}
    >
      <AppText
        className="font-mono text-[11px] font-extrabold uppercase tracking-[1.5px] text-orange-500"
        style={{ color: labelColor }}
      >
        {label}
      </AppText>
    </View>
  );
}
