"use client";

import { useLocale } from "@/context/LocaleContext";

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  const nextLocale = locale === "ar" ? "en" : "ar";
  const nextLabel = nextLocale === "ar" ? "العربية" : "English";

  return (
    <button
      type="button"
      onClick={() => setLocale(nextLocale)}
      aria-label={nextLocale === "ar" ? t("language.switchToArabic") : t("language.switchToEnglish")}
      data-testid={nextLocale === "ar" ? "locale-ar" : "locale-en"}
      className="inline-flex h-9 min-w-[5.5rem] items-center justify-center rounded-sm border border-border bg-card px-2 text-xs font-bold text-foreground transition-colors hover:bg-muted"
      title={t("language.label")}
    >
      {nextLabel}
    </button>
  );
}
