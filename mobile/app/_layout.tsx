import "react-native-gesture-handler";
import "../global.css";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";

import { AuthGate } from "@/src/core/navigation/auth-gate";
import { LocaleProvider, useLocale } from "@/src/core/i18n/locale-provider";
import { getTextAlign } from "@/src/core/i18n/rtl";
import { SessionProvider } from "@/src/core/auth/session-provider";
import { fontFamilies, resolveFontFamily } from "@/src/core/theme/fonts";
import { ThemeProvider } from "@/src/core/theme/theme-provider";

function TypographyBootstrap() {
  const { direction, locale } = useLocale();

  useEffect(() => {
    const textComponent = Text as typeof Text & {
      defaultProps?: { style?: unknown };
    };
    const inputComponent = TextInput as typeof TextInput & {
      defaultProps?: { style?: unknown };
    };
    const textStyle = {
      fontFamily: resolveFontFamily(locale, "serif", "regular"),
      writingDirection: direction,
    } as const;
    const inputStyle = {
      fontFamily: resolveFontFamily(locale, "serif", "regular"),
      writingDirection: direction,
      textAlign: getTextAlign(direction),
    } as const;

    textComponent.defaultProps = textComponent.defaultProps ?? {};
    textComponent.defaultProps.style = [textStyle];

    inputComponent.defaultProps = inputComponent.defaultProps ?? {};
    inputComponent.defaultProps.style = [inputStyle];
  }, [direction, locale]);

  return null;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded] = useFonts({
    [fontFamilies.serif.regular]: require("../assets/fonts/Fraunces-SemiBold.ttf"),
    [fontFamilies.serif.bold]: require("../assets/fonts/Fraunces-Bold.ttf"),
    [fontFamilies.sans.regular]: require("../assets/fonts/Outfit-Regular.ttf"),
    [fontFamilies.sans.medium]: require("../assets/fonts/Outfit-Medium.ttf"),
    [fontFamilies.sans.bold]: require("../assets/fonts/Outfit-Bold.ttf"),
    [fontFamilies.mono.regular]: require("../assets/fonts/JetBrainsMono-Regular.ttf"),
    [fontFamilies.mono.bold]: require("../assets/fonts/JetBrainsMono-Bold.ttf"),
    [fontFamilies.arabic.regular]: require("../assets/fonts/Tajawal-Regular.ttf"),
    [fontFamilies.arabic.bold]: require("../assets/fonts/Tajawal-Bold.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <TypographyBootstrap />
          <SessionProvider>
            <AuthGate />
            <Stack screenOptions={{ headerShown: false }} />
          </SessionProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
