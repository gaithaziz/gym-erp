import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";
import { getCurrentRole, hasModule, isCashierRole, isCoachRole, isCustomerRole, isReceptionDeskRole } from "@/lib/mobile-role";

export default function TabsLayout() {
  const { copy, fontSet, isRTL, locale, theme } = usePreferences();
  const { bootstrap } = useSession();
  const role = getCurrentRole(bootstrap);
  const customer = isCustomerRole(role);

  function hidden(moduleName: "home" | "qr" | "plans" | "progress" | "more" | "members" | "support" | "finance" | "operations") {
    if (moduleName === "more") {
      return false;
    }
    return !hasModule(bootstrap, moduleName as never);
  }

  const supportTitle = isCoachRole(role) ? copy.common.chat : copy.common.support;
  const financeTitle = isCashierRole(role) ? copy.staffTabs.pos : copy.staffTabs.finance;
  const operationsTitle = isCashierRole(role) ? copy.staffTabs.transactions : copy.staffTabs.tasks;
  const qrTitle = isReceptionDeskRole(role) ? copy.staffTabs.checkIn : copy.tabs.qr;

  return (
    <Tabs
      key={locale}
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
          ...(Platform.OS === "android" && locale === "ar" ? { fontWeight: "400" } : null),
        },
        tabBarItemStyle: {
          flexDirection: isRTL ? "row-reverse" : "row",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          href: hidden("home") ? null : undefined,
          title: copy.tabs.home,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          href: hidden("qr") ? null : undefined,
          title: qrTitle,
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          href: hidden("members") ? null : undefined,
          title: copy.staffTabs.members,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          href: hidden("plans") ? null : undefined,
          title: copy.tabs.plans,
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: customer && !hidden("progress") ? undefined : null,
          title: copy.tabs.progress,
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          href: hidden("support") ? null : undefined,
          title: supportTitle,
          tabBarIcon: ({ color, size }) => <Ionicons name={isCoachRole(role) ? "chatbubble-ellipses-outline" : "help-buoy-outline"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          href: hidden("finance") ? null : undefined,
          title: financeTitle,
          tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="operations"
        options={{
          href: hidden("operations") ? null : undefined,
          title: operationsTitle,
          tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" size={size} color={color} />,
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
