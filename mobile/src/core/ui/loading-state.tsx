import { ActivityIndicator, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";

export function LoadingState({ fullScreen = false }: { fullScreen?: boolean }) {
  const { t } = useLocale();
  const content = (
    <View className="items-center justify-center gap-3">
      <ActivityIndicator size="large" color="#c56a1a" />
      <AppText>{t("common.loading")}</AppText>
    </View>
  );

  if (fullScreen) {
    return <AppScreen className="items-center justify-center">{content}</AppScreen>;
  }

  return content;
}
