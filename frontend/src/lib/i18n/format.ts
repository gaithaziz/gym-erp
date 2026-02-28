import type { Locale } from "./types";

const localeMap: Record<Locale, string> = {
  en: "en-US",
  ar: "ar",
};

export function localeToIntl(locale: Locale): string {
  return localeMap[locale];
}

export function formatDateByLocale(
  locale: Locale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeToIntl(locale), options).format(date);
}

export function formatNumberByLocale(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeToIntl(locale), options).format(value);
}

export function formatCurrencyByLocale(
  locale: Locale,
  value: number,
  currency = "JOD",
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeToIntl(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}
