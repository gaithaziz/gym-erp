import { SafeAreaView, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/core/theme/theme-provider";
import { useInShell } from "@/src/features/shell/shell-context";

export function AppScreen({
  className = "",
  style,
  ...props
}: ViewProps & { className?: string }) {
  const { isDark } = useTheme();
  const inShell = useInShell();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className={`flex-1 ${isDark ? "bg-[#0f1419]" : "bg-background"}`}>
      <View
        className={`flex-1 px-4 py-4 ${className}`}
        style={[
          style,
          {
            paddingTop: inShell ? insets.top + 68 : undefined,
            paddingBottom: inShell ? Math.max(insets.bottom + 16, 16) : undefined,
          },
        ]}
        {...props}
      />
    </SafeAreaView>
  );
}
