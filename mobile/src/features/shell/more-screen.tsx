import { Pressable, ScrollView, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";
import { SectionChip } from "@/src/core/ui/section-chip";

const previewModules = [
  "dashboard.nav.support",
  "dashboard.nav.lostFound",
  "dashboard.nav.myLeaves",
  "dashboard.nav.history",
];

export function MoreScreen() {
  const { locale, setLocale, t } = useLocale();
  const { logout, user } = useSession();
  const { isDark, resolvedTheme, setThemeMode, themeMode } = useTheme();

  const toggleLocale = async () => {
    await setLocale(locale === "en" ? "ar" : "en");
  };

  const cycleTheme = async () => {
    const nextTheme = themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system";
    await setThemeMode(nextTheme);
  };

  const themeLabel =
    themeMode === "system"
      ? locale === "ar"
        ? "النظام"
        : "System"
      : resolvedTheme === "dark"
        ? locale === "ar"
          ? "داكن"
          : "Dark"
        : locale === "ar"
          ? "فاتح"
          : "Light";

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <View className="gap-1">
          <AppText variant="title">{t("mobile.moreTitle")}</AppText>
          <AppText variant="subtitle">{t("mobile.moreBody")}</AppText>
        </View>

        <SectionCard className="gap-4">
          <SectionChip label={t("mobile.moreTitle")} />
          <View className="gap-2">
            <AppText className="font-serif text-xl font-bold text-foreground">
              {user?.full_name ?? user?.email ?? "-"}
            </AppText>
            <AppText className="font-mono text-xs uppercase tracking-[1.2px] text-muted-foreground">
              {user?.role ?? "-"}
            </AppText>
          </View>
        </SectionCard>

        <SectionCard className="gap-3">
          <SectionChip label={t("mobile.localeCard")} />
          <Pressable
            onPress={toggleLocale}
            className={`rounded-lg px-4 py-4 ${isDark ? "border border-[#2a2f3a] bg-[#1e2329]" : "border border-border bg-background"}`}
          >
            <AppText className="font-mono text-lg font-bold text-foreground">{t("mobile.switchLanguage")}</AppText>
            <AppText className="mt-1 text-xs text-muted-foreground">{locale === "en" ? "Arabic" : "English"}</AppText>
          </Pressable>
        </SectionCard>

        <SectionCard className="gap-3">
          <SectionChip label={locale === "ar" ? "المظهر" : "Theme"} />
          <Pressable
            onPress={cycleTheme}
            className={`rounded-lg px-4 py-4 ${isDark ? "border border-[#2a2f3a] bg-[#1e2329]" : "border border-border bg-background"}`}
          >
            <AppText className="font-mono text-lg font-bold text-foreground">
              {locale === "ar" ? "تغيير المظهر" : "Change Theme"}
            </AppText>
            <AppText className="mt-1 text-xs text-muted-foreground">{themeLabel}</AppText>
          </Pressable>
        </SectionCard>

        <SectionCard className="gap-3">
          <SectionChip label={t("mobile.previewModules")} />
          <View className="gap-3">
            {previewModules.map((moduleKey, index) => (
              <View key={moduleKey} className={`flex-row items-center gap-3 rounded-lg px-4 py-4 ${isDark ? "border border-[#2a2f3a] bg-[#1e2329]" : "border border-border bg-background"}`}>
                <View className={`h-10 w-10 items-center justify-center rounded-md ${isDark ? "border border-[#2a2f3a] bg-[#151a21]" : "border border-border bg-card"}`}>
                  <AppText className="font-mono text-sm font-bold text-foreground">{String(index + 1).padStart(2, "0")}</AppText>
                </View>
                <View className="flex-1 gap-1">
                  <AppText className="font-mono text-lg font-bold text-foreground">{t(moduleKey as never)}</AppText>
                  <AppText className="text-xs text-muted-foreground">{t("mobile.activeNow")}</AppText>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard className="gap-3">
          <SectionChip label={t("mobile.accountActions")} />
          <AppButton title={t("common.logout")} variant="secondary" onPress={logout} />
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
