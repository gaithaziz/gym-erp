import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setThemeMode: (theme: ThemeMode) => Promise<void>;
};

const STORAGE_KEY = "gym_mobile_theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeModeState(stored);
      }
    })();
  }, []);

  const resolvedTheme: ResolvedTheme =
    themeMode === "system" ? (systemScheme === "dark" ? "dark" : "light") : themeMode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      isDark: resolvedTheme === "dark",
      setThemeMode: async (theme) => {
        setThemeModeState(theme);
        await AsyncStorage.setItem(STORAGE_KEY, theme);
      },
    }),
    [resolvedTheme, themeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
