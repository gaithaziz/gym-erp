import { arMessages } from "./locales/ar";
import { enMessages } from "./locales/en";
import type { Direction, Locale, TranslationKey } from "./types";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "gym_locale";

type MessageTree = {
  [key: string]: string | MessageTree;
};

export const messages: Record<Locale, MessageTree> = {
  en: enMessages,
  ar: arMessages,
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "ar";
}

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

function getByKeyPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

export function translate(locale: Locale, key: TranslationKey): string {
  const localized = getByKeyPath(messages[locale], key);
  if (typeof localized === "string") return localized;
  const fallback = getByKeyPath(messages.en, key);
  if (typeof fallback === "string") return fallback;
  return key;
}
