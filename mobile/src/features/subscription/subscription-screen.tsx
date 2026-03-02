import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { type AuthUser } from "@gym-erp/contracts";

import { fetchCurrentUser } from "@/src/core/api/client";
import { useSession } from "@/src/core/auth/use-session";
import { useLocale } from "@/src/core/i18n/locale-provider";
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

function getStatusPalette(status: AuthUser["subscription_status"]) {
  switch (status) {
    case "ACTIVE":
      return { card: "border-emerald-200 bg-emerald-50/50", badge: "border-emerald-200 bg-emerald-50", badgeText: "text-emerald-700" };
    case "FROZEN":
      return { card: "border-sky-200 bg-sky-50/50", badge: "border-sky-200 bg-sky-50", badgeText: "text-sky-700" };
    case "EXPIRED":
      return { card: "border-rose-200 bg-rose-50/50", badge: "border-rose-200 bg-rose-50", badgeText: "text-rose-700" };
    default:
      return { card: "", badge: "border-border bg-white", badgeText: "text-foreground" };
  }
}

export function SubscriptionScreen() {
  const { user, applyUser, logout } = useSession();
  const { locale, formatDate, t } = useLocale();

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

  const palette = getStatusPalette(profile.subscription_status);

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <View className="gap-1">
          <AppText variant="title">{t("dashboard.nav.subscription")}</AppText>
          <AppText variant="subtitle">{descriptions[profile.subscription_status]}</AppText>
        </View>

        <SectionCard className={`gap-2 ${palette.card}`}>
          <AppText variant="label">{t("dashboard.nav.subscription")}</AppText>
          <AppText variant="title">{t("mobile.subscriptionHeading")}</AppText>
          <AppText className="text-muted-foreground">{descriptions[profile.subscription_status]}</AppText>
        </SectionCard>

        <SectionCard className="gap-4">
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <AppText variant="label">{t("mobile.subscriptionCurrentPlan")}</AppText>
                <AppText className="text-lg font-semibold text-foreground">{planName}</AppText>
              </View>
              <View className={`rounded-md border px-3 py-2 ${palette.badge}`}>
                <AppText className={`text-xs font-semibold ${palette.badgeText}`}>
                  {statusLabels[profile.subscription_status]}
                </AppText>
              </View>
            </View>

            <View className="rounded-lg border border-border bg-background px-4 py-4">
              <AppText variant="label">{t("mobile.subscriptionExpiry")}</AppText>
              <AppText className="font-semibold text-foreground">{expiryText}</AppText>
            </View>

            {profile.is_subscription_blocked ? (
              <View className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-4">
                <AppText variant="label">{t("mobile.subscriptionAccessState")}</AppText>
                <AppText className="font-semibold text-danger">{t("mobile.subscriptionBlockedNotice")}</AppText>
              </View>
            ) : (
              <View className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
                <AppText variant="label">{t("mobile.subscriptionAccessState")}</AppText>
                <AppText className="font-semibold text-emerald-700">{t("mobile.subscriptionActiveNotice")}</AppText>
              </View>
            )}
          </View>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.accountActions")}</AppText>
          <AppButton
            title={query.isFetching ? t("common.loading") : t("common.retry")}
            variant="secondary"
            loading={query.isFetching}
            onPress={() => void query.refetch()}
          />
          <AppButton title={t("common.logout")} variant="secondary" onPress={logout} />
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
