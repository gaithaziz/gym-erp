import type { FlexAlignType, TextStyle, ViewStyle } from "react-native";

import type { Direction } from "@gym-erp/i18n";

export function isRtl(direction: Direction) {
  return direction === "rtl";
}

export function getRowDirection(
  direction: Direction,
  placement: "leading" | "trailing" = "leading",
): NonNullable<ViewStyle["flexDirection"]> {
  if (placement === "trailing") {
    return isRtl(direction) ? "row" : "row-reverse";
  }

  return isRtl(direction) ? "row-reverse" : "row";
}

export function getTextAlign(direction: Direction): NonNullable<TextStyle["textAlign"]> {
  return isRtl(direction) ? "right" : "left";
}

export function getCrossAxisAlign(direction: Direction): FlexAlignType {
  return isRtl(direction) ? "flex-end" : "flex-start";
}

export function getMainAxisStart(direction: Direction): NonNullable<ViewStyle["justifyContent"]> {
  return isRtl(direction) ? "flex-end" : "flex-start";
}

export function getMainAxisEnd(direction: Direction): NonNullable<ViewStyle["justifyContent"]> {
  return isRtl(direction) ? "flex-start" : "flex-end";
}
