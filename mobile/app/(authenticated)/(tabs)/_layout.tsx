import { Tabs } from "expo-router";
import { Text, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";

const tabIcons: Record<string, string> = {
  index: "D",
  qr: "QR",
  profile: "ME",
  more: "MORE",
};

export default function TabsLayout() {
  const { t } = useLocale();
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
          fontWeight: "700",
          letterSpacing: 0.4,
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
              <Text className={`font-mono text-[10px] font-bold ${focused ? "text-primary" : isDark ? "text-[#9ca3af]" : "text-muted-foreground"}`}>{tabIcons.index}</Text>
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
              <Text className={`font-mono text-[10px] font-bold ${focused ? "text-primary" : isDark ? "text-[#9ca3af]" : "text-muted-foreground"}`}>{tabIcons.qr}</Text>
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
              <Text className={`font-mono text-[10px] font-bold ${focused ? "text-primary" : isDark ? "text-[#9ca3af]" : "text-muted-foreground"}`}>{tabIcons.profile}</Text>
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
              <Text className={`font-mono text-[10px] font-bold ${focused ? "text-primary" : isDark ? "text-[#9ca3af]" : "text-muted-foreground"}`}>{tabIcons.more}</Text>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
