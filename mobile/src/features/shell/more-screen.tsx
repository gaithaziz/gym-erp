import { Feather } from "@expo/vector-icons";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useState } from "react";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { getRowDirection } from "@/src/core/i18n/rtl";
import { useSession } from "@/src/core/auth/use-session";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";
import { SectionChip } from "@/src/core/ui/section-chip";

const previewModules = [
  { key: "dashboard.nav.support", icon: "life-buoy" },
  { key: "dashboard.nav.lostFound", icon: "search" },
  { key: "dashboard.nav.myLeaves", icon: "calendar" },
  { key: "dashboard.nav.history", icon: "clock" },
] as const;

export function MoreScreen() {
  const { direction, locale, setLocale, t } = useLocale();
  const { refreshProfile, user } = useSession();
  const { isDark, resolvedTheme, setThemeMode, themeMode } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const rowDirection = getRowDirection(direction);

  const toggleLocale = async () => {
    await setLocale(locale === "en" ? "ar" : "en");
  };

  const cycleTheme = async () => {
    const nextTheme = themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system";
    await setThemeMode(nextTheme);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setIsRefreshing(false);
    }
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
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
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
            className={`rounded-lg border px-4 py-4 ${isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}
          >
            <AppText className="font-mono text-lg font-bold text-foreground">{t("mobile.switchLanguage")}</AppText>
            <AppText className="mt-1 text-xs text-muted-foreground">{locale === "en" ? "Arabic" : "English"}</AppText>
          </Pressable>
        </SectionCard>

        <SectionCard className="gap-3">
          <SectionChip label={locale === "ar" ? "المظهر" : "Theme"} />
          <Pressable
            onPress={cycleTheme}
            className={`rounded-lg border px-4 py-4 ${isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}
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
            {previewModules.map((module) => (
              <View
                key={module.key}
                className={`items-center gap-3 rounded-lg border px-4 py-4 ${isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}
                style={{ flexDirection: rowDirection }}
              >
                <View className={`h-10 w-10 items-center justify-center border ${isDark ? "border-[#2a2f3a] bg-[#151a21]" : "border-border bg-card"}`}>
                  <Feather name={module.icon} size={16} color={isDark ? "#e6e2dd" : "#0c0a09"} />
                </View>
                <View className="flex-1 gap-1">
                  <AppText className="font-mono text-lg font-bold text-foreground">{t(module.key as never)}</AppText>
                  <AppText className="text-xs text-muted-foreground">{t("mobile.activeNow")}</AppText>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
