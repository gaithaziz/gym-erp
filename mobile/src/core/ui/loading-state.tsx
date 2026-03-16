import { ActivityIndicator, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";

export function LoadingState({ fullScreen = false }: { fullScreen?: boolean }) {
  const { t } = useLocale();
  const { isDark } = useTheme();
  const content = (
    <View className="items-center justify-center gap-3">
      <ActivityIndicator size="large" color={isDark ? "#e6e2dd" : "#0c0a09"} />
      <AppText>{t("common.loading")}</AppText>
    </View>
  );

  if (fullScreen) {
    return <AppScreen className="items-center justify-center">{content}</AppScreen>;
  }

  return content;
}
