import { View, type ViewProps } from "react-native";

import { useDeviceLayout } from "@/src/core/ui/use-device-layout";

export function ResponsiveColumns({
  className = "",
  gap = 16,
  ...props
}: ViewProps & { className?: string; gap?: number }) {
  const { isTablet } = useDeviceLayout();

  return (
    <View
      className={className}
      style={{
        flexDirection: isTablet ? "row" : "column",
        gap,
      }}
      {...props}
    />
  );
}
