import { Tabs } from "expo-router";

import { useLocale } from "@/src/core/i18n/locale-provider";

export default function TabsLayout() {
  const { t } = useLocale();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#8f4d10",
        tabBarInactiveTintColor: "#6b7280",
        tabBarStyle: {
          backgroundColor: "#fffaf1",
          borderTopColor: "#e7dcc9",
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("mobile.tabsHome"),
          tabBarLabel: t("mobile.tabsHome"),
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: t("mobile.tabsQr"),
          tabBarLabel: t("mobile.tabsQr"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("mobile.tabsProfile"),
          tabBarLabel: t("mobile.tabsProfile"),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("mobile.tabsMore"),
          tabBarLabel: t("mobile.tabsMore"),
        }}
      />
    </Tabs>
  );
}
