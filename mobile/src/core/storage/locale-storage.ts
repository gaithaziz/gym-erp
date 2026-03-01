import AsyncStorage from "@react-native-async-storage/async-storage";

import { LOCALE_STORAGE_KEY, type Locale } from "@gym-erp/i18n";

export async function getStoredLocale(): Promise<Locale | null> {
  const value = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
  return value === "en" || value === "ar" ? value : null;
}

export async function setStoredLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
