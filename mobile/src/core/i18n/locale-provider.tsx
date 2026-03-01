import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  formatCurrencyByLocale,
  formatDateByLocale,
  formatNumberByLocale,
  getDirection,
  translate,
  type Direction,
  type Locale,
  type TranslationKey,
} from "@gym-erp/i18n";

import { getStoredLocale, setStoredLocale } from "@/src/core/storage/locale-storage";

type LocaleContextValue = {
  locale: Locale;
  direction: Direction;
  isLocaleReady: boolean;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: TranslationKey) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string, options?: Intl.NumberFormatOptions) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [isLocaleReady, setIsLocaleReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const storedLocale = await getStoredLocale();
      if (storedLocale) {
        setLocaleState(storedLocale);
      }
      setIsLocaleReady(true);
    })();
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const direction = getDirection(locale);

    return {
      locale,
      direction,
      isLocaleReady,
      setLocale: async (nextLocale) => {
        setLocaleState(nextLocale);
        await setStoredLocale(nextLocale);
      },
      t: (key) => translate(locale, key),
      formatDate: (value, options) => formatDateByLocale(locale, value, options),
      formatNumber: (value, options) => formatNumberByLocale(locale, value, options),
      formatCurrency: (value, currency, options) =>
        formatCurrencyByLocale(locale, value, currency, options),
    };
  }, [isLocaleReady, locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
