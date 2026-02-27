"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  getDirection,
  isLocale,
  LOCALE_STORAGE_KEY,
  translate,
} from "@/lib/i18n";
import {
  formatCurrencyByLocale,
  formatDateByLocale,
  formatNumberByLocale,
} from "@/lib/i18n/format";
import type { Direction, Locale, TranslationKey } from "@/lib/i18n/types";

type LocaleContextValue = {
  locale: Locale;
  direction: Direction;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string, options?: Intl.NumberFormatOptions) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe: keep first client render aligned with SSR, then load persisted locale.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const direction = getDirection(locale);

  useEffect(() => {
    const persisted = resolveInitialLocale();
    if (persisted !== DEFAULT_LOCALE) {
      setLocaleState(persisted);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.documentElement.dataset.locale = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [direction, locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction,
      setLocale: setLocaleState,
      t: (key) => translate(locale, key),
      formatDate: (value, options) => formatDateByLocale(locale, value, options),
      formatNumber: (value, options) => formatNumberByLocale(locale, value, options),
      formatCurrency: (value, currency, options) =>
        formatCurrencyByLocale(locale, value, currency, options),
    }),
    [direction, locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
