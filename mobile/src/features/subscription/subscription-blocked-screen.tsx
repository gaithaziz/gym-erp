import { View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";

export function SubscriptionBlockedScreen() {
  const { t } = useLocale();
  const { logout, user } = useSession();

  return (
    <AppScreen className="justify-center">
      <SectionCard className="gap-4">
        <View className="gap-2">
          <AppText variant="label">{t("mobile.foundationEyebrow")}</AppText>
          <AppText variant="title">{t("mobile.blockedTitle")}</AppText>
          <AppText>{t("mobile.blockedBody")}</AppText>
          <AppText className="text-muted">{t("mobile.blockedAction")}</AppText>
        </View>

        <View className="rounded-3xl border border-danger/20 bg-white px-4 py-4">
          <AppText variant="label">{t("mobile.currentRole")}</AppText>
          <AppText className="font-semibold">{user?.role ?? "-"}</AppText>
        </View>

        <AppButton title={t("common.logout")} variant="secondary" onPress={logout} />
      </SectionCard>
    </AppScreen>
  );
}
