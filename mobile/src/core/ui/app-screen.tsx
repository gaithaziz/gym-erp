import { SafeAreaView, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";
import { useInShell } from "@/src/features/shell/shell-context";

export function AppScreen({
  className = "",
  style,
  ...props
}: ViewProps & { className?: string }) {
  const { direction } = useLocale();
  const { isDark } = useTheme();
  const inShell = useInShell();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className={`flex-1 ${isDark ? "bg-[#0f1419]" : "bg-background"}`}>
      <View
        className={`flex-1 px-5 py-4 ${className}`}
        style={[style, { direction, paddingTop: inShell ? insets.top + 72 : undefined }]}
        {...props}
      />
    </SafeAreaView>
  );
}
