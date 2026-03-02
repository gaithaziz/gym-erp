import "react-native-gesture-handler";
import "../global.css";

import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AuthGate } from "@/src/core/navigation/auth-gate";
import { LocaleProvider } from "@/src/core/i18n/locale-provider";
import { SessionProvider } from "@/src/core/auth/session-provider";
import { ThemeProvider } from "@/src/core/theme/theme-provider";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <SessionProvider>
            <AuthGate />
            <Stack screenOptions={{ headerShown: false }} />
          </SessionProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
