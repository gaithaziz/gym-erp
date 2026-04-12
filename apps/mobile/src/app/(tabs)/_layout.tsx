import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { usePreferences } from "@/lib/preferences";

export default function TabsLayout() {
  const { copy, fontSet, isRTL, theme } = usePreferences();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fontSet.body,
          fontSize: 11,
        },
        tabBarItemStyle: {
          flexDirection: isRTL ? "row-reverse" : "row",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: copy.tabs.home,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: copy.tabs.qr,
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: copy.tabs.plans,
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: copy.tabs.progress,
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: copy.tabs.more,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
