import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from "@expo-google-fonts/tajawal";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* NetworkContext.Provider is transparent — adds no native View, never
          interferes with Expo Router's Stack gesture / touch responders. */}
      <NetworkContext.Provider value={network}>
        <QueryClientProvider client={queryClient}>
          <PreferencesProvider>
            <SessionProvider>
              <AppNavigator />
            </SessionProvider>
          </PreferencesProvider>
        </QueryClientProvider>
      </NetworkContext.Provider>
    </GestureHandlerRootView>
  );
}

function AppNavigator() {
  const { copy, fontSet, locale, theme, themeMode } = usePreferences();
  const { status, bootstrap } = useSession();
  const router = useRouter();
  const pathname = usePathname();
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

  useEffect(() => {
    if (status !== "signed_in") return;
    const localeSigned = Boolean(
      bootstrap?.policy?.locale_signatures?.en ||
      bootstrap?.policy?.locale_signatures?.ar
    );
    const requiresSignature = bootstrap?.role === "CUSTOMER" && !localeSigned;
    if (requiresSignature && pathname !== "/policy") {
      router.replace("/policy" as never);
      return;
    }
    if (!requiresSignature && pathname === "/policy") {
      router.replace("/(tabs)/home");
    }
  }, [bootstrap?.policy?.locale_signatures, bootstrap?.role, locale, pathname, router, status]);

  return (
    <>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <Stack
        key={locale}
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: {
            color: theme.foreground,
            fontFamily: fontSet.display,
            ...(Platform.OS === "android" && locale === "ar" ? { fontWeight: "500" } : null),
          },
          headerBackTitleStyle: {
            fontFamily: fontSet.body,
            ...(Platform.OS === "android" && locale === "ar" ? { fontWeight: "400" } : null),
          },
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
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="policy" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="billing" options={{ headerShown: false, title: copy.common.billing }} />
        <Stack.Screen name="hours" options={{ headerShown: false, title: copy.home.hours }} />
        <Stack.Screen name="private-coaching" options={{ headerShown: false, title: copy.privateCoachingScreen.title }} />
        <Stack.Screen name="private-coaching/[id]" options={{ headerShown: false, title: copy.privateCoachingScreen.detailsTitle }} />
        <Stack.Screen name="badges" options={{ headerShown: false, title: copy.home.achievements }} />
        <Stack.Screen name="diagnostics" options={{ headerShown: false, title: "Diagnostics" }} />
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
