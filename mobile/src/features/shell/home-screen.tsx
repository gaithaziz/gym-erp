import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/core/api/client";
import { useSession } from "@/src/core/auth/use-session";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { EmptyState } from "@/src/core/ui/empty-state";
import { ErrorState } from "@/src/core/ui/error-state";
import { LoadingState } from "@/src/core/ui/loading-state";
import { ResponsiveContent } from "@/src/core/ui/responsive-content";
import { SectionCard } from "@/src/core/ui/section-card";
import { SectionChip } from "@/src/core/ui/section-chip";

type GamificationStats = {
  total_visits: number;
  streak: {
    current_streak: number;
    best_streak: number;
    last_visit_date: string | null;
  };
  badges: Array<{ id: string; badge_type: string; name: string }>;
};

type BiometricLogResponse = {
  id: string;
  date: string;
  height_cm?: number;
  weight_kg?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
};

async function fetchCustomerOverview(): Promise<{
  stats: GamificationStats | null;
  biometrics: BiometricLogResponse[];
}> {
  const [statsRes, biometricsRes] = await Promise.all([
    api.get("/gamification/stats").catch(() => ({ data: { data: null } })),
    api.get("/fitness/biometrics").catch(() => ({ data: { data: [] } })),
  ]);

  return {
    stats: (statsRes.data?.data as GamificationStats | null) ?? null,
    biometrics: (biometricsRes.data?.data as BiometricLogResponse[]) ?? [],
  };
}

const genericModules: Record<string, string[]> = {
  ADMIN: [
    "dashboard.nav.financials",
    "dashboard.nav.staff",
    "dashboard.nav.inventory",
    "dashboard.nav.auditLogs",
  ],
  COACH: [
    "dashboard.nav.workoutPlans",
    "dashboard.nav.dietPlans",
    "dashboard.nav.workoutDietLibrary",
    "dashboard.nav.feedback",
  ],
  RECEPTION: [
    "dashboard.nav.receptionRegistration",
    "dashboard.nav.supportDesk",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
  ],
  FRONT_DESK: [
    "dashboard.nav.receptionRegistration",
    "dashboard.nav.whatsappAutomation",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
  ],
  CASHIER: [
    "dashboard.nav.cashierPos",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
    "dashboard.nav.myProfile",
  ],
  EMPLOYEE: [
    "dashboard.nav.cashierPos",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
    "dashboard.nav.myProfile",
  ],
};

export function HomeScreen() {
  const { t, locale, formatDate } = useLocale();
  const { logout, user } = useSession();
  const { isDark } = useTheme();

  const isCustomer = user?.role === "CUSTOMER";
  const customerQuery = useQuery({
    queryKey: ["mobile", "customer-overview"],
    queryFn: fetchCustomerOverview,
    enabled: isCustomer,
  });

  const customerTxt = locale === "ar"
    ? {
        greeting: "مرحباً،",
        subtitle: "نظرة عامة على لياقتك.",
        streak: "سلسلة",
        dayStreakSuffix: "أيام",
        subscription: "الاشتراك",
        expires: "ينتهي",
        statusLabel: "الحالة",
        weeklyGoal: "الهدف الأسبوعي",
        visits: "زيارات",
        totalVisits: "إجمالي الزيارات",
        badgesEarned: "الشارات المكتسبة",
        latestHeight: "آخر طول",
        latestWeight: "آخر وزن",
        bodyFat: "دهون الجسم",
        quickAccess: "وصول سريع",
        myProgress: t("dashboard.nav.myProgress"),
        bodyMetricsTrends: "اتجاهات قياسات الجسم",
        workoutPlans: t("dashboard.nav.myWorkoutPlans"),
        viewPlansAndLog: "اعرض الخطط وسجل الجلسات",
        dietPlans: t("dashboard.nav.myDietPlans"),
        assignedNutrition: "خطة التغذية المخصصة",
        history: t("dashboard.nav.history"),
        attendancePayments: "الحضور والمدفوعات",
        achievements: t("dashboard.nav.achievements"),
        badgesMilestones: "الشارات والإنجازات المرحلية",
        myQrCode: t("dashboard.nav.myQrCode"),
        checkInAccess: "الوصول وتسجيل الدخول",
        myProfile: t("dashboard.nav.myProfile"),
        manageAccount: "إدارة الحساب",
      }
    : {
        greeting: "Welcome,",
        subtitle: "Your fitness overview.",
        streak: "Streak",
        dayStreakSuffix: "day streak",
        subscription: "Subscription",
        expires: "Expires",
        statusLabel: "Status",
        weeklyGoal: "Weekly Goal",
        visits: "visits",
        totalVisits: "Total Visits",
        badgesEarned: "Badges Earned",
        latestHeight: "Latest Height",
        latestWeight: "Latest Weight",
        bodyFat: "Body Fat",
        quickAccess: "Quick Access",
        myProgress: t("dashboard.nav.myProgress"),
        bodyMetricsTrends: "Body metrics trends",
        workoutPlans: t("dashboard.nav.myWorkoutPlans"),
        viewPlansAndLog: "View plans and log sessions",
        dietPlans: t("dashboard.nav.myDietPlans"),
        assignedNutrition: "Assigned nutrition plan",
        history: t("dashboard.nav.history"),
        attendancePayments: "Attendance and payments",
        achievements: t("dashboard.nav.achievements"),
        badgesMilestones: "Badges and milestones",
        myQrCode: t("dashboard.nav.myQrCode"),
        checkInAccess: "Check-in access",
        myProfile: t("dashboard.nav.myProfile"),
        manageAccount: "Manage account",
      };

  const latestBio = useMemo(() => {
    if (!customerQuery.data?.biometrics?.length) return null;
    return customerQuery.data.biometrics[customerQuery.data.biometrics.length - 1] ?? null;
  }, [customerQuery.data]);

  if (isCustomer && customerQuery.isLoading) {
    return <LoadingState fullScreen />;
  }

  if (isCustomer && customerQuery.isError) {
    return (
      <AppScreen className="justify-center">
        <ErrorState onRetry={() => void customerQuery.refetch()} />
      </AppScreen>
    );
  }

  if (isCustomer) {
    const stats = customerQuery.data?.stats;
    const streak = stats?.streak?.current_streak ?? 0;
    const planLabel = user?.subscription_plan_name ?? t("mobile.subscriptionNoPlan");
    const statusLabel = user?.subscription_status ?? "NONE";
    const formattedExpiryDate = user?.subscription_end_date
      ? formatDate(user.subscription_end_date, { month: "short", day: "numeric", year: "numeric" })
      : t("mobile.subscriptionNoExpiry");
    const subscriptionCardClass =
      statusLabel === "ACTIVE"
        ? "border-emerald-200 bg-emerald-50/50"
        : statusLabel === "FROZEN"
          ? "border-sky-200 bg-sky-50/50"
          : statusLabel === "EXPIRED"
            ? "border-red-200 bg-red-50/50"
            : isDark
              ? "border-[#2a2f3a] bg-[#1e2329]"
              : "border-border bg-muted/20";
    const weeklyGoal = 4;
    const weeklyProgress = Math.min(stats?.streak?.current_streak ?? 0, weeklyGoal);
    const progressPercent = Math.max(8, Math.min(100, Math.round((weeklyProgress / weeklyGoal) * 100)));

    const quickAccessItems = [
      {
        title: customerTxt.myProgress,
        subtitle: customerTxt.bodyMetricsTrends,
      },
      {
        title: customerTxt.workoutPlans,
        subtitle: customerTxt.viewPlansAndLog,
      },
      {
        title: customerTxt.dietPlans,
        subtitle: customerTxt.assignedNutrition,
      },
      {
        title: customerTxt.history,
        subtitle: customerTxt.attendancePayments,
      },
      {
        title: customerTxt.achievements,
        subtitle: customerTxt.badgesMilestones,
      },
      {
        title: customerTxt.myQrCode,
        subtitle: customerTxt.checkInAccess,
        onPress: () => router.push("/qr"),
      },
      {
        title: customerTxt.myProfile,
        subtitle: customerTxt.manageAccount,
        onPress: () => router.push("/profile"),
      },
      {
        title: t("dashboard.nav.subscription"),
        subtitle: t("mobile.subscriptionHeading"),
        onPress: () => router.push("/subscription"),
      },
    ];

    return (
      <AppScreen>
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
          <ResponsiveContent className="gap-4">
          <View className="gap-3">
            <View className="gap-1">
              <AppText variant="title">
                {customerTxt.greeting} {user?.full_name ?? user?.email ?? ""}
              </AppText>
              <AppText variant="subtitle">{customerTxt.subtitle}</AppText>
            </View>

            {streak > 0 ? (
              <View className="self-start rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5">
                <AppText className="font-mono text-xs font-bold text-orange-500">
                  {customerTxt.streak} {streak} {customerTxt.dayStreakSuffix}
                </AppText>
              </View>
            ) : null}
          </View>

          <SectionCard className={subscriptionCardClass}>
            <View className="gap-2">
              <SectionChip label={customerTxt.subscription} />
              <AppText className="font-mono text-lg font-bold text-foreground">
                {customerTxt.expires} {formattedExpiryDate}
              </AppText>
              <AppText className="text-xs text-muted-foreground">
                {planLabel} | {customerTxt.statusLabel} {statusLabel}
              </AppText>
            </View>
          </SectionCard>

          <View className="gap-3">
            <SectionCard className="gap-3">
              <SectionChip label={customerTxt.weeklyGoal} />
              <View className="flex-row items-end gap-2">
                <AppText className="font-mono text-3xl font-bold text-foreground">
                  {String(weeklyProgress)}
                </AppText>
                <AppText className="mb-1 text-sm text-muted-foreground">
                  / {weeklyGoal} {customerTxt.visits}
                </AppText>
              </View>
              <View className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-[#2a2f3a]" : "bg-muted/40"}`}>
                <View className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
              </View>
            </SectionCard>

            <SectionCard className="gap-2">
              <SectionChip label={customerTxt.totalVisits} />
              <AppText className="font-mono text-3xl font-bold text-foreground">
                {String(stats?.total_visits ?? 0)}
              </AppText>
            </SectionCard>

            <SectionCard className="gap-2">
              <SectionChip label={customerTxt.badgesEarned} />
              <AppText className="font-mono text-3xl font-bold text-foreground">
                {String(stats?.badges?.length ?? 0)}
              </AppText>
            </SectionCard>
          </View>

          <View className="gap-3">
            <SectionCard className="gap-2">
              <AppText variant="label">{customerTxt.latestHeight}</AppText>
              <AppText className="text-xl font-bold text-foreground">
                {latestBio?.height_cm ? `${latestBio.height_cm} cm` : "--"}
              </AppText>
            </SectionCard>
            <SectionCard className="gap-2">
              <AppText variant="label">{customerTxt.latestWeight}</AppText>
              <AppText className="text-xl font-bold text-foreground">
                {latestBio?.weight_kg ? `${latestBio.weight_kg} kg` : "--"}
              </AppText>
            </SectionCard>
            <SectionCard className="gap-2">
              <AppText variant="label">{customerTxt.bodyFat}</AppText>
              <AppText className="text-xl font-bold text-foreground">
                {latestBio?.body_fat_pct ? `${latestBio.body_fat_pct}%` : "--"}
              </AppText>
            </SectionCard>
          </View>

          <View className="gap-4">
            <SectionChip label={customerTxt.quickAccess} />
            <View className="gap-3">
              {quickAccessItems.map((item) => (
                <Pressable
                  key={item.title}
                  onPress={item.onPress}
                  disabled={!item.onPress}
                  className={`rounded-lg p-5 ${isDark ? "border border-[#2a2f3a] bg-[#151a21]" : "border border-border bg-card"}`}
                >
                  <View className="gap-1">
                    <AppText className="font-mono text-lg font-bold text-foreground">
                      {item.title}
                    </AppText>
                    <AppText className="text-xs text-muted-foreground">{item.subtitle}</AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
          </ResponsiveContent>
        </ScrollView>
      </AppScreen>
    );
  }

  const modules = genericModules[user?.role ?? ""] ?? ["dashboard.nav.dashboard"];

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ResponsiveContent className="gap-4">
        <View className="gap-1">
          <AppText variant="title">{t("dashboard.home.title")}</AppText>
          <AppText variant="subtitle">{user?.full_name ?? user?.email ?? "-"}</AppText>
        </View>

        <SectionCard className="gap-3">
          <SectionChip label={t("mobile.availableModules")} />
          {modules.length === 0 ? (
            <EmptyState title={t("dashboard.home.title")} subtitle={t("mobile.moduleHint")} />
          ) : (
            modules.map((moduleKey) => (
              <View
                key={moduleKey}
                className={`rounded-lg px-4 py-3 ${isDark ? "border border-[#2a2f3a] bg-[#1e2329]" : "border border-border bg-background"}`}
              >
                <AppText className="font-mono text-base font-bold text-foreground">
                  {t(moduleKey as never)}
                </AppText>
              </View>
            ))
          )}
        </SectionCard>

        <AppButton title={t("common.logout")} variant="secondary" onPress={logout} />
        </ResponsiveContent>
      </ScrollView>
    </AppScreen>
  );
}
