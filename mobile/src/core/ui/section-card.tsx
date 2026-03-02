import { View, type ViewProps } from "react-native";

import { useTheme } from "@/src/core/theme/theme-provider";

export function SectionCard({ className = "", ...props }: ViewProps & { className?: string }) {
  const { isDark } = useTheme();

  return (
    <View
      className={`rounded-lg p-5 ${isDark ? "border border-[#2a2f3a] bg-[#151a21]" : "border border-border bg-card"} ${className}`}
      {...props}
    />
  );
}
