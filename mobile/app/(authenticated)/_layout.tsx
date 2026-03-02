import { Stack, router, usePathname } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/src/core/auth/use-session";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppText } from "@/src/core/ui/app-text";
import { ShellProvider } from "@/src/features/shell/shell-context";

const navSections = [
  {
    labelEn: "Account",
    labelAr: "الحساب",
    items: [
      { labelKey: "mobile.tabsHome", route: "/" },
      { labelKey: "mobile.tabsQr", route: "/qr" },
      { labelKey: "mobile.tabsProfile", route: "/profile" },
      { labelKey: "dashboard.nav.subscription", route: "/subscription" },
      { labelKey: "mobile.tabsMore", route: "/more" },
    ],
  },
] as const;

export default function AuthenticatedLayout() {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const { locale, setLocale, t } = useLocale();
  const { isDark, resolvedTheme, setThemeMode, themeMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const themeLabel = useMemo(() => {
    if (themeMode === "system") return locale === "ar" ? "النظام" : "System";
    return resolvedTheme === "dark" ? (locale === "ar" ? "داكن" : "Dark") : locale === "ar" ? "فاتح" : "Light";
  }, [locale, resolvedTheme, themeMode]);

  const cycleTheme = async () => {
    const next = themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system";
    await setThemeMode(next);
  };

  const initial = (user?.full_name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();

  return (
    <ShellProvider value>
      <View className={`flex-1 ${isDark ? "bg-[#0f1419]" : "bg-background"}`}>
        <View
          className={`absolute inset-x-0 top-0 z-[70] flex-row items-center justify-between px-4 py-3 ${isDark ? "bg-[#151a21]" : "bg-card"} border-b ${isDark ? "border-[#2a2f3a]" : "border-border"}`}
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setSidebarOpen((value) => !value)}
              className={`rounded-lg px-3 py-2 ${isDark ? "bg-[#1e2329]" : "bg-muted/50"}`}
            >
              <Text className={`${isDark ? "text-white" : "text-foreground"} font-mono text-xs font-bold`}>
                {sidebarOpen ? "X" : "MENU"}
              </Text>
            </Pressable>
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Text className="font-mono text-xs font-bold text-primary">GYM</Text>
            </View>
            <Text className={`${isDark ? "text-white" : "text-foreground"} text-sm font-bold`}>
              {t("common.appName")}
            </Text>
          </View>
        </View>

        {sidebarOpen ? (
          <Pressable
            className="absolute inset-0 z-[60] bg-black/35"
            onPress={() => setSidebarOpen(false)}
          />
        ) : null}

        <View
          className={`absolute left-0 bottom-0 z-[65] w-64 ${isDark ? "bg-[#151a21]" : "bg-card"} border-r ${isDark ? "border-[#2a2f3a]" : "border-border"} ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ top: insets.top + 61 }}
        >
          <View className={`border-b px-5 pb-4 pt-5 ${isDark ? "border-[#2a2f3a]" : "border-border"}`}>
            <View className="mb-3 flex-row items-center justify-end gap-2">
              <Pressable
                onPress={() => void setLocale(locale === "en" ? "ar" : "en")}
                className={`rounded-md px-3 py-2 ${isDark ? "bg-[#1e2329]" : "bg-muted/40"}`}
              >
                <AppText className="font-mono text-xs">{locale === "en" ? "AR" : "EN"}</AppText>
              </Pressable>
              <Pressable
                onPress={() => void cycleTheme()}
                className={`rounded-md px-3 py-2 ${isDark ? "bg-[#1e2329]" : "bg-muted/40"}`}
              >
                <AppText className="font-mono text-xs">{themeLabel}</AppText>
              </Pressable>
            </View>

            <View className="items-center gap-2">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                <Text className="text-xl font-bold text-primary">{initial}</Text>
              </View>
              <View className="items-center">
                <Text className={`${isDark ? "text-white" : "text-foreground"} text-sm font-bold`}>
                  {user?.full_name ?? user?.email ?? "-"}
                </Text>
                <Text className={`${isDark ? "text-[#9ca3af]" : "text-muted-foreground"} mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase`}>
                  {user?.role ?? "-"}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-1 px-3 py-4">
            {navSections.map((section) => (
              <View key={section.labelEn} className="mb-4">
                <Text className={`${isDark ? "text-[#9ca3af]" : "text-muted-foreground"} px-3 pb-2 text-[10px] font-bold uppercase`}>
                  {locale === "ar" ? section.labelAr : section.labelEn}
                </Text>
                <View className="gap-1">
                  {section.items
                    .filter((item) => item.labelKey !== "dashboard.nav.subscription" || user?.role === "CUSTOMER")
                    .map((item) => {
                      const active = pathname === item.route;
                      return (
                        <Pressable
                          key={item.route}
                          onPress={() => router.push(item.route)}
                          className={`rounded-lg px-3 py-3 ${active ? "bg-primary/10" : isDark ? "bg-transparent" : "bg-transparent"}`}
                        >
                          <AppText className={`font-mono text-sm ${active ? "text-primary" : ""}`}>
                            {t(item.labelKey as never)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                </View>
              </View>
            ))}
          </View>

          <View className="px-3 pb-4">
            <Pressable
              onPress={logout}
              className={`rounded-lg px-3 py-3 ${isDark ? "bg-[#1e2329]" : "bg-muted/40"}`}
            >
              <AppText className="font-mono text-sm text-danger">{t("common.logout")}</AppText>
            </Pressable>
          </View>
        </View>

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="subscription" />
        </Stack>
      </View>
    </ShellProvider>
  );
}
