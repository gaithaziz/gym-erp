import { View, type ViewProps } from "react-native";

export function SectionCard({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-[28px] border border-border/90 bg-panel/95 p-5 shadow-sm shadow-black/5 ${className}`}
      {...props}
    />
  );
}
