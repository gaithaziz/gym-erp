import { View, type ViewProps } from "react-native";

import { useDeviceLayout } from "@/src/core/ui/use-device-layout";

export function ResponsiveContent({
  className = "",
  compactMaxWidth = 720,
  tabletMaxWidth = 1180,
  ...props
}: ViewProps & {
  className?: string;
  compactMaxWidth?: number;
  tabletMaxWidth?: number;
}) {
  const { isTablet } = useDeviceLayout();

  return (
    <View
      className={`w-full self-center ${className}`}
      style={{ maxWidth: isTablet ? tabletMaxWidth : compactMaxWidth }}
      {...props}
    />
  );
}
