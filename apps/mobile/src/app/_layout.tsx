import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from "@expo-google-fonts/tajawal";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <SessionProvider>
          <AppNavigator />
        </SessionProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

function AppNavigator() {
  const { copy, fontSet, theme, themeMode } = usePreferences();

  return (
    <>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTitleStyle: {
            color: theme.foreground,
            fontFamily: fontSet.display,
          },
          headerBackTitleStyle: {
            fontFamily: fontSet.body,
          },
          headerTintColor: theme.foreground,
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: theme.background,
          },
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
        <Stack.Screen name="support" options={{ headerShown: false, title: copy.common.support }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="lost-found" options={{ headerShown: false, title: copy.common.lostFound }} />
        <Stack.Screen name="profile" options={{ headerShown: false, title: copy.common.profile }} />
        <Stack.Screen name="feedback" options={{ headerShown: false, title: copy.common.feedbackHistory }} />
        <Stack.Screen name="coach-feedback" options={{ headerShown: false, title: copy.common.feedbackHistory }} />
        <Stack.Screen name="leaves" options={{ headerShown: false, title: copy.operationsScreen.myLeaves }} />
        <Stack.Screen name="admin-audit" options={{ headerShown: false, title: copy.adminControl.auditSummary }} />
        <Stack.Screen name="inventory-summary" options={{ headerShown: false, title: copy.adminControl.inventorySummary }} />
      </Stack>
    </>
  );
}
