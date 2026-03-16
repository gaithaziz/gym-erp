import { View, type ViewProps } from "react-native";

import { useTheme } from "@/src/core/theme/theme-provider";

export function SectionCard({ className = "", style, ...props }: ViewProps & { className?: string }) {
  const { isDark } = useTheme();

  return (
    <View
      className={`rounded-lg border px-6 py-6 ${isDark ? "border-[#2a2f3a] bg-[#151a21]" : "border-border bg-card"} ${className}`}
      style={style}
      {...props}
    />
  );
}
