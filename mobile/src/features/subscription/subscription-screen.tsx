import { useEffect } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { type AuthUser } from "@gym-erp/contracts";

import { fetchCurrentUser } from "@/src/core/api/client";
import { useSession } from "@/src/core/auth/use-session";
import { getCrossAxisAlign, getRowDirection, getTextAlign } from "@/src/core/i18n/rtl";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { EmptyState } from "@/src/core/ui/empty-state";
import { ErrorState } from "@/src/core/ui/error-state";
import { LoadingState } from "@/src/core/ui/loading-state";
import { SectionCard } from "@/src/core/ui/section-card";

const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

function localizePlanName(planName: string | null | undefined, locale: "en" | "ar") {
  if (!planName) return null;

  const normalized = planName.trim().toLowerCase();
  const labels: Record<string, { en: string; ar: string }> = {
    daily: { en: "Daily", ar: "يومي" },
    weekly: { en: "Weekly", ar: "أسبوعي" },
    monthly: { en: "Monthly", ar: "شهري" },
    yearly: { en: "Yearly", ar: "سنوي" },
    annual: { en: "Annual", ar: "سنوي" },
  };

  return labels[normalized]?.[locale] ?? planName;
}

function getStatusPalette(status: AuthUser["subscription_status"], isDark: boolean) {
  switch (status) {
    case "ACTIVE":
      return {
        badge: isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50",
        badgeText: isDark ? "text-emerald-300" : "text-emerald-700",
      };
    case "FROZEN":
      return {
        badge: isDark ? "border-sky-500/30 bg-sky-500/10" : "border-sky-200 bg-sky-50",
        badgeText: isDark ? "text-sky-300" : "text-sky-700",
      };
    case "EXPIRED":
      return {
        badge: isDark ? "border-rose-500/30 bg-rose-500/10" : "border-rose-200 bg-rose-50",
        badgeText: isDark ? "text-rose-300" : "text-rose-700",
      };
    default:
      return {
        badge: isDark ? "border-[#2a2f3a] bg-[#151d2b]" : "border-border bg-muted/40",
        badgeText: "text-foreground",
      };
  }
}

export function SubscriptionScreen() {
  const { user, applyUser, refreshProfile } = useSession();
  const { direction, locale, formatDate, t } = useLocale();
  const { isDark } = useTheme();

  const query = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchCurrentUser,
    initialData: user ?? undefined,
  });

  useEffect(() => {
    if (query.data) {
      void applyUser(query.data);
    }
  }, [applyUser, query.data]);

  if (query.isLoading && !query.data) {
    return <LoadingState fullScreen />;
  }

  if (query.isError) {
    return (
      <AppScreen className="justify-center">
        <ErrorState onRetry={() => void query.refetch()} />
      </AppScreen>
    );
  }

  const profile = query.data;
  if (!profile) {
    return (
      <AppScreen className="justify-center">
        <EmptyState title={t("mobile.subscriptionUnavailable")} subtitle={t("mobile.subscriptionUnavailableBody")} />
      </AppScreen>
    );
  }

  if (profile.role !== "CUSTOMER") {
    return (
      <AppScreen className="justify-center">
        <EmptyState title={t("mobile.subscriptionCustomerOnly")} subtitle={t("mobile.subscriptionCustomerOnlyBody")} />
      </AppScreen>
    );
  }

  const planName = localizePlanName(profile.subscription_plan_name, locale) ?? t("mobile.subscriptionNoPlan");
  const expiryText = profile.subscription_end_date
    ? formatDate(profile.subscription_end_date, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : t("mobile.subscriptionNoExpiry");

  const statusLabels = {
    ACTIVE: t("mobile.subscriptionStatusActive"),
    FROZEN: t("mobile.subscriptionStatusFrozen"),
    EXPIRED: t("mobile.subscriptionStatusExpired"),
    NONE: t("mobile.subscriptionStatusNone"),
  } as const;

  const descriptions = {
    ACTIVE: t("mobile.subscriptionActiveBody"),
    FROZEN: t("mobile.subscriptionFrozenBody"),
    EXPIRED: t("mobile.subscriptionExpiredBody"),
    NONE: t("mobile.subscriptionNoneBody"),
  } as const;

  const palette = getStatusPalette(profile.subscription_status, isDark);
  const cardAlign = getCrossAxisAlign(direction);
  const cardTextAlign = getTextAlign(direction);
  const cardRowDirection = getRowDirection(direction);
  const cardSurfaceClass = isDark ? "border-[#223047] bg-[#0f1826]" : "border-border bg-card";
  const insetSurfaceClass = isDark ? "border-[#2a2f3a] bg-[#151d2b]" : "border-border bg-muted/40";
  const blockedSurfaceClass = isDark ? "border-danger/30 bg-danger/10" : "border-danger/20 bg-danger/5";
  const activeSurfaceClass = isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50";
  const activeTextClass = isDark ? "text-emerald-300" : "text-emerald-700";

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void (async () => {
          await refreshProfile();
          await query.refetch();
        })()} />}
      >
        <View className="gap-1">
          <AppText variant="title">{t("dashboard.nav.subscription")}</AppText>
          <AppText variant="subtitle">{descriptions[profile.subscription_status]}</AppText>
        </View>

        <SectionCard className={`gap-2 ${cardSurfaceClass}`} style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
          <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("dashboard.nav.subscription")}
          </AppText>
          <AppText variant="title" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("mobile.subscriptionHeading")}
          </AppText>
          <AppText className="text-muted-foreground" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {descriptions[profile.subscription_status]}
          </AppText>
        </SectionCard>

        <SectionCard className={`gap-4 ${cardSurfaceClass}`} style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
          <View className="gap-3" style={{ alignItems: cardAlign, alignSelf: "stretch", width: "100%" }}>
            <View
              className="w-full items-center justify-between gap-3"
              style={{ flexDirection: cardRowDirection, alignItems: "center" }}
            >
              <View className="flex-1 gap-1" style={{ alignItems: cardAlign }}>
                <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                  {t("mobile.subscriptionCurrentPlan")}
                </AppText>
                <AppText className="text-lg font-bold text-foreground" style={{ textAlign: cardTextAlign, width: "100%" }}>
                  {planName}
                </AppText>
              </View>
              <View className={`rounded-md border px-3 py-2 ${palette.badge}`}>
                <AppText className={`font-mono text-xs font-bold ${palette.badgeText}`}>
                  {statusLabels[profile.subscription_status]}
                </AppText>
              </View>
            </View>

            <View className={`w-full rounded-lg border px-4 py-4 ${insetSurfaceClass}`} style={{ alignItems: cardAlign }}>
              <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                {t("mobile.subscriptionExpiry")}
              </AppText>
              <AppText className="font-mono text-base font-bold text-foreground" style={{ textAlign: cardTextAlign, width: "100%" }}>
                {expiryText}
              </AppText>
            </View>

            {profile.is_subscription_blocked ? (
              <View className={`w-full rounded-lg border px-4 py-4 ${blockedSurfaceClass}`} style={{ alignItems: cardAlign }}>
                <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                  {t("mobile.subscriptionAccessState")}
                </AppText>
                <AppText className="text-base font-bold text-danger" style={{ textAlign: cardTextAlign, width: "100%" }}>
                  {t("mobile.subscriptionBlockedNotice")}
                </AppText>
              </View>
            ) : (
              <View className={`w-full rounded-lg border px-4 py-4 ${activeSurfaceClass}`} style={{ alignItems: cardAlign }}>
                <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                  {t("mobile.subscriptionAccessState")}
                </AppText>
                <AppText className={`text-base font-bold ${activeTextClass}`} style={{ textAlign: cardTextAlign, width: "100%" }}>
                  {t("mobile.subscriptionActiveNotice")}
                </AppText>
              </View>
            )}
          </View>
        </SectionCard>

        <SectionCard className={`gap-3 ${cardSurfaceClass}`} style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
          <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
            {t("mobile.accountActions")}
          </AppText>
          <AppButton
            title={query.isFetching ? t("common.loading") : t("common.retry")}
            variant="secondary"
            loading={query.isFetching}
            onPress={() => void query.refetch()}
          />
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
