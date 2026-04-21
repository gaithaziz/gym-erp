import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from "@expo-google-fonts/tajawal";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { LogBox } from "react-native";

import { parseNotificationDeepLink } from "@/lib/deep-link";
import { NetworkContext } from "@/lib/network-context";
import { useNetwork } from "@/hooks/use-network";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { queryClientConfig } from "@/lib/query-config";
import { SessionProvider, useSession } from "@/lib/session";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));
  const network = useNetwork();
  const [fontsLoaded] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  });

  useEffect(() => {
    LogBox.ignoreLogs(["Sending `onAnimatedValueUpdate` with no listeners registered."]);
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    // NetworkContext.Provider is transparent — adds no native View, never
    // interferes with Expo Router's Stack gesture / touch responders.
    <NetworkContext.Provider value={network}>
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <SessionProvider>
            <AppNavigator />
          </SessionProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    </NetworkContext.Provider>
  );
}

function AppNavigator() {
  const { copy, fontSet, theme, themeMode } = usePreferences();
  const { status } = useSession();
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.Subscription | null>(null);

  // Route notification taps to the correct in-app screen
  useEffect(() => {
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      const target = parseNotificationDeepLink(data);
      if (target && status === "signed_in") {
        router.push(target as never);
      }
    });
    return () => {
      notifListenerRef.current?.remove();
    };
  }, [router, status]);

  return (
    <>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.foreground, fontFamily: fontSet.display },
          headerBackTitleStyle: { fontFamily: fontSet.body },
          headerTintColor: theme.foreground,
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
          animation: "fade",
          headerTitleAlign: "left",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="billing" options={{ headerShown: false, title: copy.common.billing }} />
        <Stack.Screen name="badges" options={{ headerShown: false, title: copy.home.achievements }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, title: copy.common.notifications }} />
        <Stack.Screen name="ticket" options={{ headerShown: false, title: copy.common.support }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="lost-found" options={{ headerShown: false, title: copy.common.lostFound }} />
        <Stack.Screen name="profile" options={{ headerShown: false, title: copy.common.profile }} />
        <Stack.Screen name="feedback" options={{ headerShown: false, title: copy.common.feedbackHistory }} />
        <Stack.Screen name="coach-feedback" options={{ headerShown: false, title: copy.common.feedbackHistory }} />
        <Stack.Screen name="leaves" options={{ headerShown: false, title: copy.operationsScreen.myLeaves }} />
        <Stack.Screen name="approvals" options={{ headerShown: false, title: copy.adminControl.approvalQueue }} />
        <Stack.Screen name="classes" options={{ headerShown: false, title: copy.coachClasses.title }} />
        <Stack.Screen name="admin-audit" options={{ headerShown: false, title: copy.adminControl.auditSummary }} />
        <Stack.Screen name="inventory-summary" options={{ headerShown: false, title: copy.adminControl.inventorySummary }} />
        <Stack.Screen name="staff-operations" options={{ headerShown: false, title: copy.adminControl.employeeOperations }} />
      </Stack>
    </>
  );
}
