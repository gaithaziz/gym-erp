import { ScrollView, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";
import { ShellHero } from "@/src/features/shell/shell-hero";

export function QrScreen() {
  const { t } = useLocale();
  const { user } = useSession();

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ShellHero
          eyebrow={t("mobile.foundationEyebrow")}
          title={t("mobile.qrTitle")}
          subtitle={t("mobile.qrBody")}
        />

        <SectionCard className="items-center gap-4">
          <View className="h-56 w-56 items-center justify-center rounded-[32px] border-2 border-dashed border-accent/40 bg-white">
            <View className="h-36 w-36 rounded-3xl bg-accent/10" />
          </View>
          <AppText variant="label">{t("mobile.signedInAs")}</AppText>
          <AppText className="text-center font-semibold">{user?.email ?? "-"}</AppText>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.previewModules")}</AppText>
          <View className="gap-3">
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText className="font-semibold">{t("dashboard.nav.myQrCode")}</AppText>
            </View>
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText className="font-semibold">{t("dashboard.nav.entranceQr")}</AppText>
            </View>
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText className="font-semibold">{t("dashboard.nav.attendance")}</AppText>
            </View>
          </View>
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
