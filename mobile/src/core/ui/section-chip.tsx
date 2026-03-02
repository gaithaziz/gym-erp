import { View, type ViewProps } from "react-native";

import { AppText } from "@/src/core/ui/app-text";
import { useTheme } from "@/src/core/theme/theme-provider";

export function SectionChip({
  label,
  className = "",
  ...props
}: ViewProps & { label: string; className?: string }) {
  const { isDark } = useTheme();

  return (
    <View
      className={`self-start rounded-md px-2 py-1 ${isDark ? "border border-orange-500/40 bg-orange-500/15" : "border border-orange-500/30 bg-orange-500/10"} ${className}`}
      {...props}
    >
      <AppText className="font-mono text-[11px] font-extrabold uppercase tracking-[1.2px] text-orange-500">
        {label}
      </AppText>
    </View>
  );
}
