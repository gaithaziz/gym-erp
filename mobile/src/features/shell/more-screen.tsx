import { Pressable, ScrollView, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";
import { ShellHero } from "@/src/features/shell/shell-hero";

const previewModules = [
  "dashboard.nav.support",
  "dashboard.nav.lostFound",
  "dashboard.nav.myLeaves",
  "dashboard.nav.history",
];

export function MoreScreen() {
  const { locale, setLocale, t } = useLocale();
  const { logout } = useSession();

  const toggleLocale = async () => {
    await setLocale(locale === "en" ? "ar" : "en");
  };

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ShellHero
          eyebrow={t("mobile.foundationEyebrow")}
          title={t("mobile.moreTitle")}
          subtitle={t("mobile.moreBody")}
        />

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.localeCard")}</AppText>
          <Pressable
            onPress={toggleLocale}
            className="rounded-3xl border border-border bg-white px-4 py-4"
          >
            <AppText className="font-semibold">{t("mobile.switchLanguage")}</AppText>
            <AppText className="text-muted">{locale === "en" ? "Arabic" : "English"}</AppText>
          </Pressable>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.previewModules")}</AppText>
          <View className="gap-3">
            {previewModules.map((moduleKey) => (
              <View key={moduleKey} className="rounded-3xl border border-border bg-white px-4 py-4">
                <AppText className="font-semibold">{t(moduleKey as never)}</AppText>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.accountActions")}</AppText>
          <AppButton title={t("common.logout")} variant="secondary" onPress={logout} />
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
