import { Stack, router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveProfileImageUrl } from "@/src/core/api/profile-image";
import { isBlockedCustomer } from "@/src/core/auth/auth-store";
import { useSession } from "@/src/core/auth/use-session";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { getMainAxisEnd, getRowDirection, getTextAlign } from "@/src/core/i18n/rtl";
import { resolveFontFamily } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppText } from "@/src/core/ui/app-text";
import {
  type MobileDrawerIconName,
  getMobileDrawerItems,
  mobileDrawerSections,
} from "@/src/features/shell/navigation";
import { ShellProvider } from "@/src/features/shell/shell-context";

const drawerIconGlyphMap: Record<MobileDrawerIconName, keyof typeof Feather.glyphMap> = {
  LayoutDashboard: "grid",
  Package: "package",
  ShoppingCart: "shopping-cart",
  MessageSquare: "message-square",
  QrCode: "maximize",
  LifeBuoy: "life-buoy",
  ShieldAlert: "shield",
  UserCheck: "user-check",
  Users: "users",
  ClipboardList: "clipboard",
  Wallet: "credit-card",
  Dumbbell: "activity",
  Utensils: "coffee",
  Activity: "activity",
  Trophy: "award",
};

export default function AuthenticatedLayout() {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const { direction, locale, setLocale, t } = useLocale();
  const { isDark, resolvedTheme, setThemeMode, themeMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const cycleTheme = async () => {
    const next = themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system";
    await setThemeMode(next);
  };

  const initial = (user?.full_name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();
  const profileImageUrl = resolveProfileImageUrl(user?.profile_picture_url);
  const nextLocaleLabel = locale === "en" ? "AR" : "EN";
  const themeIconName =
    themeMode === "system" ? "monitor" : resolvedTheme === "dark" ? "moon" : "sun";
  const blockedCustomer = isBlockedCustomer(user);
  const drawerItems = getMobileDrawerItems(user?.role, blockedCustomer);
  const rowDirection = getRowDirection(direction);
  const textAlign = getTextAlign(direction);
  const drawerBottomInset = Math.max(insets.bottom, 16);

  function renderNavIcon(iconName: MobileDrawerIconName, color: string) {
    return <Feather name={drawerIconGlyphMap[iconName]} size={18} color={color} />;
  }

  return (
    <ShellProvider value>
      <View className={`flex-1 ${isDark ? "bg-[#0f1419]" : "bg-background"}`}>
        <View
          className={`absolute inset-x-0 top-0 z-[70] flex-row items-center justify-between border-b px-4 py-3 ${isDark ? "border-[#2a2f3a] bg-[#151a21]" : "border-border bg-card"}`}
          style={{ paddingTop: insets.top + 12, flexDirection: rowDirection }}
        >
          <View
            className="items-center gap-3"
            style={{ flexDirection: rowDirection }}
          >
            <Pressable
              onPress={() => setSidebarOpen((value) => !value)}
              className={`rounded-lg p-2 ${isDark ? "bg-transparent" : "bg-transparent"}`}
            >
              <Feather name={sidebarOpen ? "x" : "menu"} size={20} color={isDark ? "#9ca3af" : "#57534e"} />
            </Pressable>
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Feather name="activity" size={16} color="#ea580c" />
            </View>
            <Text
              className={`${isDark ? "text-white" : "text-foreground"} text-sm font-bold`}
              style={{ fontFamily: resolveFontFamily(locale, "serif", "bold") }}
            >
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
          className={`absolute bottom-0 z-[65] w-72 ${isDark ? "bg-[#151a21]" : "bg-card"} ${sidebarOpen ? "translate-x-0" : direction === "rtl" ? "translate-x-full" : "-translate-x-full"}`}
          style={{
            top: insets.top + 61,
            left: direction === "rtl" ? undefined : 0,
            right: direction === "rtl" ? 0 : undefined,
            borderRightWidth: direction === "rtl" ? 0 : 1,
            borderLeftWidth: direction === "rtl" ? 1 : 0,
            borderColor: isDark ? "#2a2f3a" : "#d6d3d1",
          }}
        >
          <View className={`border-b px-5 pb-4 pt-5 ${isDark ? "border-[#2a2f3a]" : "border-border"}`}>
            <View
              className="mb-3 items-center gap-2"
              style={{
                flexDirection: rowDirection,
                justifyContent: getMainAxisEnd(direction),
              }}
            >
              <Pressable
                onPress={() => void setLocale(locale === "en" ? "ar" : "en")}
                className={`min-w-[88px] rounded-sm border px-2 py-2 ${isDark ? "border-[#2a2f3a] bg-[#151a21]" : "border-border bg-card"}`}
                style={{ flexDirection: rowDirection, alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Feather name="globe" size={14} color={isDark ? "#e6e2dd" : "#0c0a09"} />
                <AppText className="font-mono text-xs font-bold">{nextLocaleLabel}</AppText>
              </Pressable>
              <Pressable
                onPress={() => void cycleTheme()}
                className="rounded-sm border border-transparent p-2"
                style={{ alignItems: "center", justifyContent: "center" }}
              >
                <Feather name={themeIconName} size={18} color={isDark ? "#9ca3af" : "#57534e"} />
              </Pressable>
            </View>

            <View className="items-center gap-2">
              <View className="h-16 w-16 overflow-hidden rounded-full border-2 border-background bg-primary/20">
                {profileImageUrl ? (
                  <Image source={{ uri: profileImageUrl }} className="h-full w-full" />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Text
                      className="text-xl font-bold text-primary"
                      style={{ fontFamily: resolveFontFamily(locale, "sans", "bold") }}
                    >
                      {initial}
                    </Text>
                  </View>
                )}
              </View>
              <View className="items-center">
                <Text
                  className={`${isDark ? "text-white" : "text-foreground"} text-sm font-bold`}
                  style={{ fontFamily: resolveFontFamily(locale, "serif", "bold") }}
                >
                  {user?.full_name ?? user?.email ?? "-"}
                </Text>
                <Text
                  className={`${isDark ? "bg-[#1e2329] text-[#9ca3af]" : "bg-muted/40 text-muted-foreground"} mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase`}
                  style={{ fontFamily: resolveFontFamily(locale, "mono", "bold") }}
                >
                  {user?.role ?? "-"}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: drawerBottomInset + 8 }}
          >
            {mobileDrawerSections.map((section) => {
              const sectionItems = drawerItems.filter((item) => item.section === section.key);
              if (sectionItems.length === 0) {
                return null;
              }

              return (
                <View key={section.key} className="mb-4">
                  <Text
                    className={`${isDark ? "text-[#9ca3af]" : "text-muted-foreground"} px-3 pb-2 text-[10px] font-bold uppercase`}
                    style={{ fontFamily: resolveFontFamily(locale, "mono", "bold"), textAlign }}
                  >
                    {t(section.labelKey)}
                  </Text>
                  <View className="gap-1">
                    {sectionItems.map((item) => {
                      const active = item.mobileRoute != null && pathname === item.mobileRoute;
                      const enabled = item.mobileRoute != null;
                      const itemTextColor = active
                        ? isDark
                          ? "#e6e2dd"
                          : "#0c0a09"
                        : enabled
                          ? isDark
                            ? "#d6dde8"
                            : "#292524"
                          : isDark
                            ? "#8b98ab"
                            : "#78716c";
                      const itemIconColor = active ? "#ea580c" : itemTextColor;
                      return (
                        <Pressable
                          key={item.webHref}
                          disabled={!enabled}
                          onPress={() => {
                            if (item.mobileRoute) {
                              router.push(item.mobileRoute);
                            }
                          }}
                          className={`px-4 py-2.5 ${
                            active
                              ? isDark
                                ? "bg-[#2a2f3a]"
                                : "bg-secondary"
                              : ""
                          }`}
                          style={
                            active
                              ? direction === "rtl"
                                ? { borderRightWidth: 2, borderRightColor: "#ea580c" }
                                : { borderLeftWidth: 2, borderLeftColor: "#ea580c" }
                              : undefined
                          }
                        >
                          <View
                            className="items-center gap-3"
                            style={{ flexDirection: rowDirection, width: "100%" }}
                          >
                            {renderNavIcon(item.icon, itemIconColor)}
                            <AppText
                              className={`flex-1 text-sm ${active ? "font-semibold" : enabled ? "" : "font-medium"}`}
                              style={{ textAlign, color: itemTextColor }}
                            >
                              {t(item.labelKey)}
                            </AppText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View className="px-3 pt-2" style={{ paddingBottom: drawerBottomInset }}>
            <Pressable
              onPress={logout}
              className="px-4 py-2.5"
              style={{ flexDirection: rowDirection, alignItems: "center", gap: 12 }}
            >
              <Feather name="log-out" size={16} color="#ef4444" />
              <AppText className="text-sm text-danger">{t("common.logout")}</AppText>
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
