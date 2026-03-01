import { View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { AppButton } from "@/src/core/ui/app-button";
import { AppText } from "@/src/core/ui/app-text";

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useLocale();
  return (
    <View className="items-center gap-4 rounded-3xl border border-danger/20 bg-white p-6">
      <AppText variant="title" className="text-danger">
        {t("common.error")}
      </AppText>
      {onRetry ? <AppButton title={t("common.retry")} onPress={onRetry} /> : null}
    </View>
  );
}
