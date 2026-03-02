import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

export type DeviceClass = "phone" | "tablet";

export function useDeviceLayout() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const shortestSide = Math.min(width, height);
    const deviceClass: DeviceClass = shortestSide >= 768 ? "tablet" : "phone";

    return {
      width,
      height,
      shortestSide,
      isTablet: deviceClass === "tablet",
      isPhone: deviceClass === "phone",
      deviceClass,
    };
  }, [height, width]);
}
