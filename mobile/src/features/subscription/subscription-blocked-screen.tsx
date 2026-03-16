import { View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { getCrossAxisAlign, getTextAlign } from "@/src/core/i18n/rtl";
import { useSession } from "@/src/core/auth/use-session";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";

export function SubscriptionBlockedScreen() {
  const { direction, t } = useLocale();
  const { user } = useSession();
  const { isDark } = useTheme();
  const cardAlign = getCrossAxisAlign(direction);
  const cardTextAlign = getTextAlign(direction);
  const cardSurfaceClass = isDark ? "border-[#223047] bg-[#0f1826]" : "border-border bg-card";
  const insetSurfaceClass = isDark ? "border-danger/30 bg-danger/10" : "border-danger/20 bg-danger/5";

  return (
    <AppScreen className="justify-center">
      <SectionCard className={`gap-4 ${cardSurfaceClass}`} style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
        <View className="gap-2" style={{ alignItems: cardAlign, alignSelf: "stretch", width: "100%" }}>
          <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("mobile.foundationEyebrow")}
          </AppText>
          <AppText variant="title" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("mobile.blockedTitle")}
          </AppText>
          <AppText style={{ textAlign: cardTextAlign, width: "100%" }}>{t("mobile.blockedBody")}</AppText>
          <AppText className="text-muted-foreground" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("mobile.blockedAction")}
          </AppText>
        </View>

        <View className={`w-full rounded-lg border px-4 py-4 ${insetSurfaceClass}`} style={{ alignItems: cardAlign }}>
          <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("mobile.currentRole")}
          </AppText>
          <AppText className="font-mono text-base font-bold text-foreground" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {user?.role ?? "-"}
          </AppText>
        </View>
      </SectionCard>
    </AppScreen>
  );
}
