import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/core/api/client";
import { useSession } from "@/src/core/auth/use-session";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { getCrossAxisAlign, getMainAxisStart, getRowDirection, getTextAlign } from "@/src/core/i18n/rtl";
import { fontFamilies } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { EmptyState } from "@/src/core/ui/empty-state";
import { ErrorState } from "@/src/core/ui/error-state";
import { LoadingState } from "@/src/core/ui/loading-state";
import { ResponsiveContent } from "@/src/core/ui/responsive-content";
import { SectionCard } from "@/src/core/ui/section-card";
import { SectionChip } from "@/src/core/ui/section-chip";

import { AdminDateRangeCalendar } from "./admin-date-range-calendar";

const quickAccessGlyphs: Record<string, keyof typeof Feather.glyphMap> = {
  progress: "activity",
  workout: "activity",
  diet: "coffee",
  history: "clipboard",
  achievements: "award",
  qr: "maximize",
  profile: "user",
  subscription: "shield",
};

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

type DashboardStats = {
  today_visitors: number;
  todays_revenue: number;
  active_members: number;
  monthly_revenue: number;
  monthly_expenses: number;
  pending_salaries: number;
};

type LowStockItem = {
  id: string;
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
};

type AttendanceData = {
  hour: string;
  visits: number;
};

type RevenueData = {
  date: string;
  revenue: number;
  expenses: number;
};

type RevenueChartPoint = RevenueData & {
  label: string;
};

type AdminDashboardCard = {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  isAlert?: boolean;
};

type AdminCalendarAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ADMIN_DASHBOARD_DAYS = 31;
const adminDashboardGlyphs = {
  todayVisitors: "activity",
  todaysRevenue: "dollar-sign",
  pendingSalaries: "clock",
  lowStockAlerts: "trending-up",
} satisfies Record<string, keyof typeof Feather.glyphMap>;

function isolateInline(value: string) {
  return `\u2068${value}\u2069`;
}

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

async function fetchAdminOverview(): Promise<{
  stats: DashboardStats | null;
  lowStockItems: LowStockItem[];
  attendanceData: AttendanceData[];
  revenueData: RevenueData[];
}> {
  const [statsRes, lowStockRes, attendanceRes, revenueRes] = await Promise.all([
    api.get("/analytics/dashboard").catch(() => ({ data: { data: null } })),
    api.get("/inventory/products/low-stock").catch(() => ({ data: { data: [] } })),
    api.get(`/analytics/attendance?days=${ADMIN_DASHBOARD_DAYS}`).catch(() => ({ data: { data: [] } })),
    api.get(`/analytics/revenue-chart?days=${ADMIN_DASHBOARD_DAYS}`).catch(() => ({ data: { data: [] } })),
  ]);

  return {
    stats: (statsRes.data?.data as DashboardStats | null) ?? null,
    lowStockItems: (lowStockRes.data?.data as LowStockItem[]) ?? [],
    attendanceData: (attendanceRes.data?.data as AttendanceData[]) ?? [],
    revenueData: (revenueRes.data?.data as RevenueData[]) ?? [],
  };
}

function buildRevenueChartData(
  revenueData: RevenueData[],
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string,
  revenueViewMode: "daily" | "weekly",
): RevenueChartPoint[] {
  if (revenueViewMode === "daily") {
    return revenueData.map((point) => {
      const date = new Date(point.date);
      const label = Number.isNaN(date.getTime())
        ? point.date
        : formatDate(date, { month: "short", day: "numeric" });
      return { ...point, label };
    });
  }

  const weeklyBuckets = new Map<string, RevenueChartPoint>();

  revenueData.forEach((point) => {
    const date = new Date(point.date);
    if (Number.isNaN(date.getTime())) return;

    const weekStart = new Date(date);
    const dayOfWeek = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    const key = weekStart.toISOString().split("T")[0];
    const existing = weeklyBuckets.get(key);
    if (existing) {
      existing.revenue += point.revenue;
      existing.expenses += point.expenses;
      return;
    }

    weeklyBuckets.set(key, {
      date: key,
      label: formatDate(weekStart, { month: "short", day: "numeric" }),
      revenue: point.revenue,
      expenses: point.expenses,
    });
  });

  return Array.from(weeklyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildChartTicks(maxValue: number, desiredSteps: number, minimumStep: number) {
  const safeMax = Math.max(1, maxValue);
  const roughStep = Math.max(minimumStep, Math.ceil(safeMax / desiredSteps));
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceNormalizedStep = 1;
  if (normalized > 1 && normalized <= 2) niceNormalizedStep = 2;
  else if (normalized > 2 && normalized <= 5) niceNormalizedStep = 5;
  else if (normalized > 5) niceNormalizedStep = 10;

  const step = niceNormalizedStep * magnitude;
  const maxTick = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];

  for (let value = 0; value <= maxTick; value += step) {
    ticks.push(value);
  }

  return { maxTick, ticks };
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
  const { direction, t, locale, formatCurrency, formatDate, formatNumber } = useLocale();
  const { refreshProfile, user } = useSession();
  const { isDark } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminRevenueViewMode, setAdminRevenueViewMode] = useState<"daily" | "weekly">("daily");
  const [selectedAttendanceIndex, setSelectedAttendanceIndex] = useState<number | null>(null);
  const [selectedRevenueIndex, setSelectedRevenueIndex] = useState<number | null>(null);
  const [isAdminCalendarOpen, setIsAdminCalendarOpen] = useState(false);
  const [adminCalendarAnchor, setAdminCalendarAnchor] = useState<AdminCalendarAnchor | null>(null);
  const adminDateBarRef = useRef<View>(null);

  const isCustomer = user?.role === "CUSTOMER";
  const isAdmin = user?.role === "ADMIN";
  const customerQuery = useQuery({
    queryKey: ["mobile", "customer-overview"],
    queryFn: fetchCustomerOverview,
    enabled: isCustomer,
  });
  const adminQuery = useQuery({
    queryKey: ["mobile", "admin-dashboard-overview"],
    queryFn: fetchAdminOverview,
    enabled: isAdmin,
  });

  const closeAdminCalendar = () => {
    setIsAdminCalendarOpen(false);
  };

  const openAdminCalendar = () => {
    if (!adminDateBarRef.current) {
      setAdminCalendarAnchor(null);
      setIsAdminCalendarOpen(true);
      return;
    }

    adminDateBarRef.current.measureInWindow((x, y, width, height) => {
      setAdminCalendarAnchor({ x, y, width, height });
      setIsAdminCalendarOpen(true);
    });
  };

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
    const displayName = isolateInline(user?.full_name ?? user?.email ?? "");
    const planLabel = isolateInline(user?.subscription_plan_name ?? t("mobile.subscriptionNoPlan"));
    const statusLabel = user?.subscription_status ?? "NONE";
    const localizedStatusLabel = statusLabel === "ACTIVE"
      ? t("mobile.subscriptionStatusActive")
      : statusLabel === "FROZEN"
        ? t("mobile.subscriptionStatusFrozen")
        : statusLabel === "EXPIRED"
          ? t("mobile.subscriptionStatusExpired")
          : t("mobile.subscriptionStatusNone");
    const formattedExpiryDate = user?.subscription_end_date
      ? formatDate(user.subscription_end_date, { month: "short", day: "numeric", year: "numeric" })
      : t("mobile.subscriptionNoExpiry");
    const isolatedExpiryDate = isolateInline(formattedExpiryDate);
    const isolatedStatusLabel = isolateInline(localizedStatusLabel);
    const dashboardCardClass = isDark ? "border-[#2a2f3a] bg-[#151a21]" : "border-border bg-card";
    const primaryTextColor = isDark ? "#e6e2dd" : "#0f172a";
    const mutedTextColor = isDark ? "#9ca3af" : "#64748b";
    const localizedMonoBoldFont = locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.mono.bold;
    const localizedSansRegularFont = locale === "ar" ? fontFamilies.arabic.regular : fontFamilies.sans.regular;
    const cardAlign = getCrossAxisAlign(direction);
    const cardTextAlign = getTextAlign(direction);
    const cardRowDirection = getRowDirection(direction);
    const counterValueFontSize = locale === "ar" ? 32 : 36;
    const standaloneMetricTextAlign = getTextAlign(direction);
    const standaloneMetricWrapperStyle = {
      width: "100%" as const,
      alignItems: cardAlign,
    };
    const weeklyGoal = 4;
    const weeklyProgress = Math.min(stats?.streak?.current_streak ?? 0, weeklyGoal);
    const progressPercent = Math.max(8, Math.min(100, Math.round((weeklyProgress / weeklyGoal) * 100)));
    const formattedStreak = formatNumber(streak);
    const formattedWeeklyProgress = formatNumber(weeklyProgress);
    const formattedWeeklyGoal = formatNumber(weeklyGoal);
    const isolatedWeeklyGoalTarget = isolateInline(`${formattedWeeklyGoal}/`);
    const weeklyGoalVisitLabel = locale === "ar" ? "زيارة" : customerTxt.visits;
    const formattedTotalVisits = formatNumber(stats?.total_visits ?? 0);
    const formattedBadges = formatNumber(stats?.badges?.length ?? 0);
    const formattedHeight = latestBio?.height_cm ? `${formatNumber(latestBio.height_cm)} cm` : "--";
    const formattedWeight = latestBio?.weight_kg ? `${formatNumber(latestBio.weight_kg)} kg` : "--";
    const formattedBodyFat = latestBio?.body_fat_pct ? `${formatNumber(latestBio.body_fat_pct)}%` : "--";
    const statusTone = statusLabel === "ACTIVE"
      ? "#34d399"
      : statusLabel === "FROZEN"
        ? "#38bdf8"
        : statusLabel === "EXPIRED"
          ? "#f87171"
          : mutedTextColor;

    const quickAccessItems = [
      {
        key: "progress",
        title: customerTxt.myProgress,
        subtitle: customerTxt.bodyMetricsTrends,
      },
      {
        key: "workout",
        title: customerTxt.workoutPlans,
        subtitle: customerTxt.viewPlansAndLog,
      },
      {
        key: "diet",
        title: customerTxt.dietPlans,
        subtitle: customerTxt.assignedNutrition,
      },
      {
        key: "history",
        title: customerTxt.history,
        subtitle: customerTxt.attendancePayments,
      },
      {
        key: "achievements",
        title: customerTxt.achievements,
        subtitle: customerTxt.badgesMilestones,
      },
      {
        key: "qr",
        title: customerTxt.myQrCode,
        subtitle: customerTxt.checkInAccess,
        onPress: () => router.push("/qr"),
      },
      {
        key: "profile",
        title: customerTxt.myProfile,
        subtitle: customerTxt.manageAccount,
        onPress: () => router.push("/profile"),
      },
      {
        key: "subscription",
        title: t("dashboard.nav.subscription"),
        subtitle: t("mobile.subscriptionHeading"),
        onPress: () => router.push("/subscription"),
      },
    ];

    const handleRefresh = async () => {
      setIsRefreshing(true);
      try {
        await refreshProfile();
        await customerQuery.refetch();
      } finally {
        setIsRefreshing(false);
      }
    };

    return (
      <AppScreen>
        <ScrollView
          contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefreshing || customerQuery.isFetching} onRefresh={() => void handleRefresh()} />}
        >
          <ResponsiveContent className="gap-4">
          <View className="gap-3" style={{ alignItems: cardAlign, width: "100%" }}>
            <View className="gap-1" style={{ width: "100%" }}>
              <Text
                style={{
                  width: "100%",
                  color: primaryTextColor,
                  fontSize: 28,
                  lineHeight: 32,
                  textAlign: cardTextAlign,
                  fontFamily: locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.serif.bold,
                  writingDirection: direction,
                }}
              >
                {`${customerTxt.greeting} `}
                <Text style={{ writingDirection: "ltr" }}>{displayName}</Text>
              </Text>
              <AppText variant="subtitle" style={{ textAlign: cardTextAlign, width: "100%" }}>
                {customerTxt.subtitle}
              </AppText>
            </View>

            {streak > 0 ? (
              <View
                className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5"
                style={{ alignSelf: cardAlign }}
              >
                <AppText className="font-mono text-xs font-bold text-orange-500" style={{ textAlign: cardTextAlign }}>
                  {customerTxt.streak} {formattedStreak} {customerTxt.dayStreakSuffix}
                </AppText>
              </View>
            ) : null}
          </View>

          <SectionCard className={`gap-2 ${dashboardCardClass}`}>
            <View className="gap-2" style={{ alignItems: cardAlign, alignSelf: "stretch", width: "100%" }}>
              <SectionChip label={customerTxt.subscription} />
              <Text
                style={{
                  width: "100%",
                  color: primaryTextColor,
                  fontSize: 16,
                  fontFamily: localizedSansRegularFont,
                  textAlign: cardTextAlign,
                  writingDirection: direction,
                }}
              >
                {`${customerTxt.expires} `}
                <Text
                  style={{
                    color: primaryTextColor,
                    fontSize: 17,
                    fontFamily: localizedMonoBoldFont,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {isolatedExpiryDate}
                </Text>
              </Text>
              <Text
                style={{
                  color: mutedTextColor,
                  fontSize: 13,
                  fontFamily: localizedSansRegularFont,
                  textAlign: cardTextAlign,
                  writingDirection: direction,
                  width: "100%",
                }}
              >
                {planLabel}
              </Text>
              <Text
                style={{
                  color: mutedTextColor,
                  fontSize: 13,
                  fontFamily: localizedSansRegularFont,
                  textAlign: cardTextAlign,
                  writingDirection: direction,
                  width: "100%",
                }}
              >
                {`${customerTxt.statusLabel} `}
                <Text
                  style={{
                    color: statusTone,
                    fontSize: 13,
                    fontFamily: localizedMonoBoldFont,
                    writingDirection: direction,
                  }}
                >
                  {isolatedStatusLabel}
                </Text>
              </Text>
            </View>
          </SectionCard>

          <View className="gap-3">
            <SectionCard
              className={`gap-4 ${dashboardCardClass}`}
              style={{
                alignItems: "stretch",
                alignSelf: "stretch",
              }}
            >
              <SectionChip label={customerTxt.weeklyGoal} />
              <View
                style={{
                  width: "100%",
                  flexDirection: cardRowDirection,
                  alignItems: "flex-end",
                  justifyContent: direction === "rtl" ? "flex-start" : "space-between",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    color: primaryTextColor,
                    fontSize: counterValueFontSize,
                    fontFamily: localizedMonoBoldFont,
                    textAlign: cardTextAlign,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formattedWeeklyProgress}
                </Text>
                <View
                  style={{
                    flex: direction === "ltr" ? 1 : undefined,
                    flexShrink: 1,
                    alignItems: direction === "ltr" ? "flex-end" : cardAlign,
                    gap: 4,
                  }}
                >
                  <Text
                    style={{
                      color: mutedTextColor,
                      fontSize: 15,
                      fontFamily: localizedSansRegularFont,
                      width: direction === "ltr" ? "100%" : undefined,
                      textAlign: direction === "ltr" ? "right" : cardTextAlign,
                      writingDirection: direction,
                    }}
                  >
                    {locale === "ar" ? (
                      <>
                        {`${weeklyGoalVisitLabel} `}
                        <Text
                          style={{
                            color: mutedTextColor,
                            fontSize: 15,
                            fontFamily: localizedMonoBoldFont,
                            writingDirection: "ltr",
                          }}
                        >
                          {isolatedWeeklyGoalTarget}
                        </Text>
                      </>
                    ) : `/${formattedWeeklyGoal} ${weeklyGoalVisitLabel}`}
                  </Text>
                </View>
              </View>
              <View
                className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-[#111f31]" : "bg-muted/40"}`}
                style={{
                  alignSelf: "stretch",
                  flexDirection: "row",
                  justifyContent: getMainAxisStart(direction),
                }}
              >
                <View className="h-full rounded-full bg-[#ff6b00]" style={{ width: `${progressPercent}%` }} />
              </View>
            </SectionCard>

            <SectionCard className={`gap-3 ${dashboardCardClass}`} style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <SectionChip label={customerTxt.totalVisits} />
              <View style={standaloneMetricWrapperStyle}>
                <Text
                  style={{
                    color: primaryTextColor,
                    fontSize: counterValueFontSize,
                    fontFamily: localizedMonoBoldFont,
                    textAlign: standaloneMetricTextAlign,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formattedTotalVisits}
                </Text>
              </View>
            </SectionCard>

            <SectionCard className={`gap-3 ${dashboardCardClass}`} style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <SectionChip label={customerTxt.badgesEarned} />
              <View style={standaloneMetricWrapperStyle}>
                <Text
                  style={{
                    color: primaryTextColor,
                    fontSize: counterValueFontSize,
                    fontFamily: localizedMonoBoldFont,
                    textAlign: standaloneMetricTextAlign,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formattedBadges}
                </Text>
              </View>
            </SectionCard>
          </View>

          <View className="gap-3">
            <SectionCard className="gap-2" style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                {customerTxt.latestHeight}
              </AppText>
              <View style={standaloneMetricWrapperStyle}>
                <Text
                  style={{
                    width: "100%",
                    color: primaryTextColor,
                    fontSize: 22,
                    fontFamily: localizedMonoBoldFont,
                    textAlign: cardTextAlign,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formattedHeight}
                </Text>
              </View>
            </SectionCard>
            <SectionCard className="gap-2" style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                {customerTxt.latestWeight}
              </AppText>
              <View style={standaloneMetricWrapperStyle}>
                <Text
                  style={{
                    width: "100%",
                    color: primaryTextColor,
                    fontSize: 22,
                    fontFamily: localizedMonoBoldFont,
                    textAlign: cardTextAlign,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formattedWeight}
                </Text>
              </View>
            </SectionCard>
            <SectionCard className="gap-2" style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <AppText variant="label" style={{ textAlign: cardTextAlign, width: "100%" }}>
                {customerTxt.bodyFat}
              </AppText>
              <View style={standaloneMetricWrapperStyle}>
                <Text
                  style={{
                    width: "100%",
                    color: primaryTextColor,
                    fontSize: 22,
                    fontFamily: localizedMonoBoldFont,
                    textAlign: cardTextAlign,
                    writingDirection: "ltr",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formattedBodyFat}
                </Text>
              </View>
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
                  className={`rounded-lg border p-5 ${isDark ? "border-[#2a2f3a] bg-[#151a21]" : "border-border bg-card"}`}
                >
                  <View
                    className="items-start justify-between gap-3"
                    style={{ flexDirection: cardRowDirection }}
                  >
                    <View className={`mt-1 h-10 min-w-10 items-center justify-center border ${isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-muted/50"}`}>
                      <Feather name={quickAccessGlyphs[item.key]} size={16} color={isDark ? "#e6e2dd" : "#0c0a09"} />
                    </View>
                    <View className="flex-1 gap-1" style={{ alignItems: cardAlign }}>
                      <AppText className="font-mono text-lg font-bold text-foreground" style={{ textAlign: cardTextAlign }}>
                        {item.title}
                      </AppText>
                      <AppText className="text-xs text-muted-foreground" style={{ textAlign: cardTextAlign }}>
                        {item.subtitle}
                      </AppText>
                    </View>
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

  if (isAdmin) {
    const adminOverview = adminQuery.data;
    const primaryTextColor = isDark ? "#e6e2dd" : "#0f172a";
    const secondaryTextColor = isDark ? "#89a1bd" : "#64748b";
    const cardTextAlign = getTextAlign(direction);
    const cardAlign = getCrossAxisAlign(direction);
    const cardRowDirection = getRowDirection(direction);
    const localizedMonoBoldFont = locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.mono.bold;
    const localizedMonoRegularFont = locale === "ar" ? fontFamilies.arabic.regular : fontFamilies.mono.regular;
    const localizedSerifBoldFont = locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.serif.bold;
    const adminCardIconOffset = 60;
    const adminMetricWrapperStyle = {
      width: "100%" as const,
      alignItems: cardAlign,
    };
    const adminValueColor = isDark ? "#f7efe8" : primaryTextColor;
    const adminSubtitleColor = isDark ? "#9ab0c7" : secondaryTextColor;
    const adminRangeEnd = new Date();
    adminRangeEnd.setDate(adminRangeEnd.getDate() - 1);
    adminRangeEnd.setHours(0, 0, 0, 0);
    const adminRangeStart = new Date(adminRangeEnd);
    adminRangeStart.setDate(adminRangeStart.getDate() - (ADMIN_DASHBOARD_DAYS - 1));
    const adminDateRangeLabel = `${formatDate(adminRangeStart, {
      day: "2-digit",
      month: locale === "ar" ? "long" : "short",
      year: "numeric",
    })} - ${formatDate(adminRangeEnd, {
      day: "2-digit",
      month: locale === "ar" ? "long" : "short",
      year: "numeric",
    })}`;
    const isolatedAdminDateRangeLabel = isolateInline(adminDateRangeLabel);
    const isolatedAdminUserLabel = isolateInline(user?.full_name ?? user?.email ?? "-");
    const lowStockCount = adminOverview?.lowStockItems.length ?? 0;
    const attendanceChartData = adminOverview?.attendanceData ?? [];
    const revenueChartData = buildRevenueChartData(
      adminOverview?.revenueData ?? [],
      formatDate,
      adminRevenueViewMode,
    );
    const attendanceValueMax = Math.max(1, ...attendanceChartData.map((point) => point.visits));
    const revenueValueMax = Math.max(
      1,
      ...revenueChartData.flatMap((point) => [point.revenue, point.expenses]),
    );
    const attendanceAxis = buildChartTicks(attendanceValueMax, 4, 1);
    const revenueAxis = buildChartTicks(revenueValueMax, 4, 50);
    const chartFrameHeight = 196;
    const chartGridColor = isDark ? "#1f2d40" : "#e7e5e4";
    const tooltipVisitsLabel = locale === "ar" ? "الزيارات" : "visits";
    const visitsChartWidth = Math.max(
      300,
      attendanceChartData.length * 56 + Math.max(0, attendanceChartData.length - 1) * 28,
    );
    const revenueChartWidth = Math.max(
      320,
      revenueChartData.length * 38 + Math.max(0, revenueChartData.length - 1) * 14,
    );
    const lastDaysLabel = t("dashboard.home.lastDays").replace("{{days}}", String(ADMIN_DASHBOARD_DAYS));
    const adminCards: AdminDashboardCard[] = [
      {
        key: "todayVisitors",
        title: t("dashboard.home.todayVisitors"),
        value: adminOverview?.stats ? formatNumber(adminOverview.stats.today_visitors) : "--",
        subtitle: t("dashboard.home.todayVisitorsSubtitle"),
        icon: adminDashboardGlyphs.todayVisitors,
      },
      {
        key: "todaysRevenue",
        title: t("dashboard.home.todaysRevenue"),
        value: adminOverview?.stats
          ? isolateInline(formatCurrency(adminOverview.stats.todays_revenue, "JOD", { currencyDisplay: "code" }))
          : "--",
        subtitle: t("dashboard.home.todaysRevenueSubtitle"),
        icon: adminDashboardGlyphs.todaysRevenue,
      },
      {
        key: "pendingSalaries",
        title: t("dashboard.home.pendingSalaries"),
        value: adminOverview?.stats
          ? isolateInline(formatCurrency(adminOverview.stats.pending_salaries, "JOD", { currencyDisplay: "code" }))
          : "--",
        subtitle: t("dashboard.home.pendingSalariesSubtitle"),
        icon: adminDashboardGlyphs.pendingSalaries,
      },
      {
        key: "lowStockAlerts",
        title: t("dashboard.home.lowStockAlerts"),
        value: formatNumber(lowStockCount),
        subtitle: t("dashboard.home.lowStockAlertsSubtitle"),
        icon: adminDashboardGlyphs.lowStockAlerts,
        isAlert: lowStockCount > 0,
      },
    ];

    const handleRefresh = async () => {
      setIsRefreshing(true);
      try {
        await refreshProfile();
        await adminQuery.refetch();
      } finally {
        setIsRefreshing(false);
      }
    };

    return (
      <AppScreen>
        <AdminDateRangeCalendar
          visible={isAdminCalendarOpen}
          locale={locale}
          direction={direction}
          anchor={adminCalendarAnchor}
          rangeStart={adminRangeStart}
          rangeEnd={adminRangeEnd}
          onClose={closeAdminCalendar}
        />
        <ScrollView
          contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefreshing || adminQuery.isFetching} onRefresh={() => void handleRefresh()} />}
        >
          <ResponsiveContent className="gap-4">
            <View className="gap-3" style={{ alignItems: cardAlign, width: "100%" }}>
              <View className="gap-1.5" style={{ width: "100%" }}>
                <Text
                  style={{
                    width: "100%",
                    color: primaryTextColor,
                    fontSize: locale === "ar" ? 36 : 32,
                    lineHeight: locale === "ar" ? 40 : 36,
                    textAlign: cardTextAlign,
                    fontFamily: locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.serif.bold,
                    writingDirection: direction,
                  }}
                >
                  {t("dashboard.home.title")}
                </Text>
                <Text
                  style={{
                    width: "100%",
                    color: secondaryTextColor,
                    fontSize: 15,
                    lineHeight: 20,
                    textAlign: cardTextAlign,
                    fontFamily: locale === "ar" ? fontFamilies.arabic.regular : fontFamilies.sans.regular,
                    writingDirection: direction,
                  }}
                >
                  {t("dashboard.home.operationsCenter")} | {isolatedAdminUserLabel}
                </Text>
              </View>
              <View ref={adminDateBarRef} collapsable={false} style={{ width: "100%" }}>
                <Pressable
                  onPress={openAdminCalendar}
                  className={`w-full border px-4 py-3 ${isDark ? "border-[#223047] bg-[#0f1826]" : "border-border bg-card"}`}
                  style={{ flexDirection: cardRowDirection, alignItems: "center", gap: 12 }}
                >
                  <Feather name="calendar" size={16} color={secondaryTextColor} />
                  <Text
                    style={{
                      flex: 1,
                      color: primaryTextColor,
                      fontSize: 14,
                      lineHeight: 20,
                      textAlign: cardTextAlign,
                      fontFamily: locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.sans.bold,
                      writingDirection: direction,
                    }}
                  >
                    {isolatedAdminDateRangeLabel}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-4">
              {adminCards.map((card) => {
                const isFeaturedCard = card.key === "todayVisitors";
                const adminCardSurfaceStyle = isDark
                  ? {
                      backgroundColor: "#141b23",
                      borderColor: isFeaturedCard ? "#ff6b00" : "#253142",
                    }
                  : undefined;
                const adminIconBoxStyle = isDark
                  ? {
                      borderColor: "#273140",
                      backgroundColor: "#171f29",
                    }
                  : undefined;

                return (
                <SectionCard
                  key={card.key}
                  className="gap-4"
                  style={[{ alignItems: cardAlign, alignSelf: "stretch", minHeight: 140 }, adminCardSurfaceStyle]}
                >
                  <View
                    className="w-full"
                    style={{ minHeight: 96, position: "relative" }}
                  >
                    <View
                      className={`h-10 w-10 items-center justify-center border ${isDark ? "" : "border-border bg-muted/50"}`}
                      style={{
                        position: "absolute",
                        top: 2,
                        left: direction === "rtl" ? 0 : undefined,
                        right: direction === "rtl" ? undefined : 0,
                        ...(adminIconBoxStyle ?? {}),
                      }}
                    >
                      <Feather name={card.icon} size={16} color={isDark ? "#e6e2dd" : "#0c0a09"} />
                    </View>
                    <View
                      className="gap-3"
                      style={{
                        ...adminMetricWrapperStyle,
                        paddingLeft: direction === "rtl" ? adminCardIconOffset : 0,
                        paddingRight: direction === "rtl" ? 0 : adminCardIconOffset,
                      }}
                    >
                      <SectionChip label={card.title} />
                      <Text
                        style={{
                          width: "100%",
                          color: adminValueColor,
                          fontSize: locale === "ar" ? 30 : 34,
                          lineHeight: locale === "ar" ? 34 : 38,
                          fontFamily: localizedMonoBoldFont,
                          textAlign: cardTextAlign,
                          writingDirection: "ltr",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {card.value}
                      </Text>
                      <AppText
                        className="text-xs text-muted-foreground"
                        style={{ color: adminSubtitleColor, textAlign: cardTextAlign, width: "100%" }}
                      >
                        {card.subtitle}
                      </AppText>
                    </View>
                  </View>
                  {card.isAlert ? (
                    <View
                      className={`w-full gap-2 border-t pt-2 ${isDark ? "border-red-500/20" : "border-red-500/15"}`}
                      style={{
                        flexDirection: cardRowDirection,
                        alignItems: "center",
                        justifyContent: getMainAxisStart(direction),
                        marginTop: "auto",
                        width: "100%",
                      }}
                    >
                      <View className="h-2 w-2 rounded-sm bg-red-500" />
                      <AppText className="font-mono text-xs font-bold uppercase tracking-[1.4px] text-red-500">
                        {t("dashboard.home.attention")}
                      </AppText>
                    </View>
                  ) : null}
                </SectionCard>
              );
              })}
            </View>

            <SectionCard className="gap-5" style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <SectionChip label={`${t("dashboard.home.visitsByHour")} (${lastDaysLabel})`} />
              {attendanceChartData.length > 0 ? (
                <View className="w-full">
                  <View
                    style={{
                      height: chartFrameHeight + 40,
                      flexDirection: "row",
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: chartFrameHeight,
                        marginTop: 6,
                        justifyContent: "space-between",
                      }}
                    >
                      {[...attendanceAxis.ticks].reverse().map((tick) => (
                        <Text
                          key={`attendance-tick-${tick}`}
                          style={{
                            color: isDark ? "#94a3b8" : "#64748b",
                            fontSize: 11,
                            textAlign: direction === "rtl" ? "left" : "right",
                            fontFamily: localizedMonoRegularFont,
                            writingDirection: "ltr",
                          }}
                        >
                          {formatNumber(tick)}
                        </Text>
                      ))}
                    </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <View style={{ height: chartFrameHeight + 40 }}>
                        <View
                          className="absolute inset-x-0 top-0"
                          style={{ height: chartFrameHeight }}
                        >
                          {attendanceAxis.ticks.map((tick) => {
                            const top = chartFrameHeight - (tick / attendanceAxis.maxTick) * chartFrameHeight;
                            return (
                              <View
                                key={`attendance-grid-${tick}`}
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  top,
                                  borderTopWidth: 1,
                                  borderStyle: "dashed",
                                  borderColor: chartGridColor,
                                }}
                              />
                            );
                          })}
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ direction: "ltr" }}
                          contentContainerStyle={{ direction: "ltr" }}
                        >
                          <View
                            className="items-end"
                            style={{
                              height: chartFrameHeight + 40,
                              width: visitsChartWidth,
                              flexDirection: "row",
                              gap: 28,
                              paddingRight: 8,
                              direction: "ltr",
                            }}
                          >
                            {attendanceChartData.map((point, index) => {
                              const attendanceTooltipOnLeft = index >= attendanceChartData.length - 2;
                              return (
                              <Pressable
                                key={`${point.hour}-${index}`}
                                onPress={() => setSelectedAttendanceIndex((current) => (current === index ? null : index))}
                                className="items-center"
                                style={{
                                  width: 56,
                                  height: chartFrameHeight + 40,
                                  zIndex: selectedAttendanceIndex === index ? 10 : 1,
                                }}
                              >
                                {selectedAttendanceIndex === index ? (
                                  <View
                                    pointerEvents="none"
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      bottom: 30,
                                      left: 0,
                                      right: 0,
                                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
                                    }}
                                  />
                                ) : null}
                                {selectedAttendanceIndex === index ? (
                                  <View
                                    pointerEvents="none"
                                    className={isDark ? "border border-[#2a2f3a] bg-[#111827]" : "border border-border bg-card"}
                                    style={{
                                      position: "absolute",
                                      top: 48,
                                      left: attendanceTooltipOnLeft ? undefined : 38,
                                      right: attendanceTooltipOnLeft ? 38 : undefined,
                                      minWidth: 84,
                                      paddingHorizontal: 10,
                                      paddingVertical: 10,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: primaryTextColor,
                                        fontSize: 12,
                                        fontFamily: localizedSerifBoldFont,
                                        writingDirection: "ltr",
                                      }}
                                    >
                                      {point.hour}
                                    </Text>
                                    <Text
                                      style={{
                                        color: isDark ? "#e6e2dd" : "#0c0a09",
                                        fontSize: 11,
                                        marginTop: 8,
                                        fontFamily: localizedSerifBoldFont,
                                        writingDirection: "ltr",
                                      }}
                                    >
                                      {`${tooltipVisitsLabel}: ${formatNumber(point.visits)}`}
                                    </Text>
                                  </View>
                                ) : null}
                                <View
                                  style={{
                                    width: 56,
                                    height: chartFrameHeight,
                                    justifyContent: "flex-end",
                                    alignItems: "center",
                                  }}
                                >
                                  <View
                                    className="rounded-t-[2px] bg-[#ff6b00]"
                                    style={{
                                      width: 30,
                                      height: Math.max(
                                        6,
                                        Math.round((point.visits / attendanceAxis.maxTick) * chartFrameHeight),
                                      ),
                                    }}
                                  />
                                </View>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    marginTop: 10,
                                    width: 56,
                                    color: isDark ? "#94a3b8" : "#64748b",
                                    fontSize: 11,
                                    textAlign: "center",
                                    fontFamily: localizedMonoBoldFont,
                                    writingDirection: "ltr",
                                  }}
                                >
                                  {point.hour}
                                </Text>
                              </Pressable>
                            );
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <AppText className="font-mono text-xs uppercase tracking-[1.4px] text-muted-foreground">
                  {t("dashboard.home.noData")}
                </AppText>
              )}
            </SectionCard>

            <SectionCard className="gap-5" style={{ alignItems: cardAlign, alignSelf: "stretch" }}>
              <View
                className="w-full items-start justify-between gap-3"
                style={{ flexDirection: cardRowDirection, flexWrap: "wrap" }}
              >
                <SectionChip label={`${t("dashboard.home.revenueVsExpenses")} (${lastDaysLabel})`} />
                <View
                  className={`border ${isDark ? "border-[#2a2f3a] bg-[#111827]" : "border-border bg-background"}`}
                  style={{ flexDirection: "row", alignSelf: cardAlign }}
                >
                  {(["daily", "weekly"] as const).map((mode) => {
                    const active = adminRevenueViewMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => {
                          setAdminRevenueViewMode(mode);
                          setSelectedRevenueIndex(null);
                        }}
                        className={`px-3 py-2 ${active ? "bg-[#ff6b00]" : ""}`}
                      >
                        <Text
                          style={{
                            color: active ? (isDark ? "#e6e2dd" : "#0c0a09") : isDark ? "#94a3b8" : "#64748b",
                            fontSize: 11,
                            fontFamily: fontFamilies.mono.bold,
                            textTransform: "uppercase",
                            writingDirection: "ltr",
                          }}
                        >
                          {mode === "daily" ? t("dashboard.home.daily") : t("dashboard.home.weekly")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="w-full" style={{ flexDirection: cardRowDirection, alignItems: "center", gap: 16 }}>
                <View style={{ flexDirection: cardRowDirection, alignItems: "center", gap: 6 }}>
                  <View className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                  <AppText className="font-mono text-xs text-muted-foreground">
                    {t("dashboard.home.revenue")}
                  </AppText>
                </View>
                <View style={{ flexDirection: cardRowDirection, alignItems: "center", gap: 6 }}>
                  <View className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
                  <AppText className="font-mono text-xs text-muted-foreground">
                    {t("dashboard.home.expenses")}
                  </AppText>
                </View>
              </View>

              {revenueChartData.length > 0 ? (
                <View className="w-full">
                  <View
                    style={{
                      height: chartFrameHeight + 42,
                      flexDirection: "row",
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: chartFrameHeight,
                        marginTop: 6,
                        justifyContent: "space-between",
                      }}
                    >
                      {[...revenueAxis.ticks].reverse().map((tick) => (
                        <Text
                          key={`revenue-tick-${tick}`}
                          style={{
                            color: isDark ? "#94a3b8" : "#64748b",
                            fontSize: 11,
                            textAlign: direction === "rtl" ? "left" : "right",
                            fontFamily: localizedMonoRegularFont,
                            writingDirection: "ltr",
                          }}
                        >
                          {formatNumber(tick)}
                        </Text>
                      ))}
                    </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <View style={{ height: chartFrameHeight + 42 }}>
                        <View
                          className="absolute inset-x-0 top-0"
                          style={{ height: chartFrameHeight }}
                        >
                          {revenueAxis.ticks.map((tick) => {
                            const top = chartFrameHeight - (tick / revenueAxis.maxTick) * chartFrameHeight;
                            return (
                              <View
                                key={`revenue-grid-${tick}`}
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  top,
                                  borderTopWidth: 1,
                                  borderStyle: "dashed",
                                  borderColor: chartGridColor,
                                }}
                              />
                            );
                          })}
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ direction: "ltr" }}
                          contentContainerStyle={{ direction: "ltr" }}
                        >
                          <View
                            className="items-end"
                            style={{
                              height: chartFrameHeight + 42,
                              width: revenueChartWidth,
                              flexDirection: "row",
                              gap: 14,
                              paddingRight: 10,
                              direction: "ltr",
                            }}
                          >
                            {revenueChartData.map((point, index) => {
                              const revenueTooltipOnLeft = index >= revenueChartData.length - 3;
                              return (
                              <Pressable
                                key={`${point.date}-${index}`}
                                onPress={() => setSelectedRevenueIndex((current) => (current === index ? null : index))}
                                className="items-center"
                                style={{
                                  width: 38,
                                  height: chartFrameHeight + 42,
                                  zIndex: selectedRevenueIndex === index ? 10 : 1,
                                }}
                              >
                                {selectedRevenueIndex === index ? (
                                  <View
                                    pointerEvents="none"
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      bottom: 32,
                                      left: -6,
                                      right: -6,
                                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
                                    }}
                                  />
                                ) : null}
                                {selectedRevenueIndex === index ? (
                                  <View
                                    pointerEvents="none"
                                    className={isDark ? "border border-[#2a2f3a] bg-[#111827]" : "border border-border bg-card"}
                                    style={{
                                      position: "absolute",
                                      top: 34,
                                      left: revenueTooltipOnLeft ? undefined : 26,
                                      right: revenueTooltipOnLeft ? 26 : undefined,
                                      minWidth: 152,
                                      paddingHorizontal: 12,
                                      paddingVertical: 10,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: primaryTextColor,
                                        fontSize: 12,
                                        fontFamily: localizedSerifBoldFont,
                                        writingDirection: "ltr",
                                      }}
                                    >
                                      {point.label}
                                    </Text>
                                    <Text
                                      style={{
                                        color: "#ef4444",
                                        fontSize: 11,
                                        marginTop: 10,
                                        fontFamily: localizedSerifBoldFont,
                                        writingDirection: "ltr",
                                      }}
                                    >
                                      {`${t("dashboard.home.expenses")}: ${formatCurrency(point.expenses, "JOD", { currencyDisplay: "code" })}`}
                                    </Text>
                                    <Text
                                      style={{
                                        color: "#22c55e",
                                        fontSize: 11,
                                        marginTop: 8,
                                        fontFamily: localizedSerifBoldFont,
                                        writingDirection: "ltr",
                                      }}
                                    >
                                      {`${t("dashboard.home.revenue")}: ${formatCurrency(point.revenue, "JOD", { currencyDisplay: "code" })}`}
                                    </Text>
                                  </View>
                                ) : null}
                                <View
                                  style={{
                                    height: chartFrameHeight,
                                    flexDirection: "row",
                                    alignItems: "flex-end",
                                    gap: 3,
                                  }}
                                >
                                  <View
                                    className="rounded-t-[2px] bg-[#22c55e]"
                                    style={{
                                      width: 10,
                                      height: Math.max(
                                        4,
                                        Math.round((point.revenue / revenueAxis.maxTick) * chartFrameHeight),
                                      ),
                                    }}
                                  />
                                  <View
                                    className="rounded-t-[2px] bg-[#ef4444]"
                                    style={{
                                      width: 10,
                                      height: Math.max(
                                        4,
                                        Math.round((point.expenses / revenueAxis.maxTick) * chartFrameHeight),
                                      ),
                                    }}
                                  />
                                </View>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    marginTop: 10,
                                    width: 38,
                                    color: isDark ? "#94a3b8" : "#64748b",
                                    fontSize: 11,
                                    textAlign: "center",
                                    fontFamily: localizedMonoRegularFont,
                                    writingDirection: "ltr",
                                  }}
                                >
                                  {point.label}
                                </Text>
                              </Pressable>
                            );
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <AppText className="font-mono text-xs uppercase tracking-[1.4px] text-muted-foreground">
                  {t("dashboard.home.noFinancialData")}
                </AppText>
              )}
            </SectionCard>
          </ResponsiveContent>
        </ScrollView>
      </AppScreen>
    );
  }

  const modules = genericModules[user?.role ?? ""] ?? ["dashboard.nav.dashboard"];
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
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
                className={`rounded-lg border px-4 py-3 ${isDark ? "border-[#2a2f3a] bg-[#1e2329]" : "border-border bg-background"}`}
              >
                <AppText className="font-mono text-base font-bold text-foreground">
                  {t(moduleKey as never)}
                </AppText>
              </View>
            ))
          )}
        </SectionCard>
        </ResponsiveContent>
      </ScrollView>
    </AppScreen>
  );
}
