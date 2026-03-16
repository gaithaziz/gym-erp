import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { resolveFontFamily } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";

const tabIcons: Record<string, keyof typeof Feather.glyphMap> = {
  index: "home",
  qr: "maximize",
  profile: "user",
  more: "more-horizontal",
};

export default function TabsLayout() {
  const { locale, t } = useLocale();
  const { isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#ea580c",
        tabBarInactiveTintColor: isDark ? "#9ca3af" : "#57534e",
        tabBarStyle: { display: "none" },
        tabBarLabelStyle: {
          fontSize: 10,
          letterSpacing: 0.4,
          fontFamily: resolveFontFamily(locale, "sans", "bold"),
        },
        tabBarIconStyle: {
          marginBottom: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("mobile.tabsHome"),
          tabBarLabel: t("mobile.tabsHome"),
          tabBarIcon: ({ focused }) => (
            <View className={`min-w-[34px] items-center rounded-md border px-2 py-1 ${focused ? "border-primary bg-orange-500/10" : isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}>
              <Feather name={tabIcons.index} size={16} color={focused ? "#ea580c" : isDark ? "#9ca3af" : "#57534e"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: t("mobile.tabsQr"),
          tabBarLabel: t("mobile.tabsQr"),
          tabBarIcon: ({ focused }) => (
            <View className={`min-w-[34px] items-center rounded-md border px-2 py-1 ${focused ? "border-primary bg-orange-500/10" : isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}>
              <Feather name={tabIcons.qr} size={16} color={focused ? "#ea580c" : isDark ? "#9ca3af" : "#57534e"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("mobile.tabsProfile"),
          tabBarLabel: t("mobile.tabsProfile"),
          tabBarIcon: ({ focused }) => (
            <View className={`min-w-[34px] items-center rounded-md border px-2 py-1 ${focused ? "border-primary bg-orange-500/10" : isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}>
              <Feather name={tabIcons.profile} size={16} color={focused ? "#ea580c" : isDark ? "#9ca3af" : "#57534e"} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("mobile.tabsMore"),
          tabBarLabel: t("mobile.tabsMore"),
          tabBarIcon: ({ focused }) => (
            <View className={`min-w-[42px] items-center rounded-md border px-2 py-1 ${focused ? "border-primary bg-orange-500/10" : isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}>
              <Feather name={tabIcons.more} size={16} color={focused ? "#ea580c" : isDark ? "#9ca3af" : "#57534e"} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
