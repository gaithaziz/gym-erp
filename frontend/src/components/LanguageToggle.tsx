"use client";

import { useLocale } from "@/context/LocaleContext";

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  const isArabic = locale === "ar";

  return (
    <div className="inline-flex items-center gap-1 rounded-sm border border-border bg-card p-1">
      <span className="px-2 text-[10px] font-bold uppercase text-muted-foreground">
        {t("language.label")}
      </span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-label={t("language.switchToEnglish")}
        aria-pressed={!isArabic}
        data-testid="locale-en"
        className={`rounded-xs px-2 py-1 text-xs font-semibold transition-colors ${
          !isArabic
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        aria-label={t("language.switchToArabic")}
        aria-pressed={isArabic}
        data-testid="locale-ar"
        className={`rounded-xs px-2 py-1 text-xs font-semibold transition-colors ${
          isArabic
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        AR
      </button>
    </div>
  );
}
