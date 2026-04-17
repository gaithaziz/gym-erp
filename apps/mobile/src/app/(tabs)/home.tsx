import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, PrimaryButton, QueryState, Screen, SecondaryButton, SecondaryLink, SectionTitle, ValueText } from "@/components/ui";
import { parseAdminHomeEnvelope, parseEnvelope, parseHomeEnvelope, parseStaffHomeEnvelope, type MobileGamificationStats } from "@/lib/api";
import { localeTag, localizeSubscriptionStatus } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole, isCustomerRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const COACH_HOME_ACTIONS = [
  { id: "shift_qr", label: "Shift QR", route: "/(tabs)/qr" },
  { id: "feedback", label: "Feedback", route: "/coach-feedback" },
  { id: "leaves", label: "Leaves", route: "/leaves" },
  { id: "profile", label: "Profile", route: "/profile" },
];

export default function HomeTab() {
  const { bootstrap } = useSession();
  const role = getCurrentRole(bootstrap);
  if (isCustomerRole(role)) {
    return <CustomerHomeTab />;
  }
  if (isAdminControlRole(role)) {
    return <AdminHomeTab />;
  }
  return <StaffHomeTab />;
}

function CustomerHomeTab() {
  const router = useRouter();
  const { bootstrap, authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const homeQuery = useQuery({
    queryKey: ["mobile-home"],
    queryFn: async () => parseHomeEnvelope(await authorizedRequest("/mobile/customer/home")).data,
  });
  const gamificationQuery = useQuery({
    queryKey: ["mobile-gamification"],
    queryFn: async () => parseEnvelope<MobileGamificationStats>(await authorizedRequest("/gamification/stats")).data,
  });

  const home = homeQuery.data;
  const gamification = gamificationQuery.data;
  const firstName = bootstrap?.user.full_name ? bootstrap.user.full_name.split(" ")[0] : "";
  const title = isRTL ? `${copy.home.greeting}${firstName ? `، ${firstName}` : ""}` : `${copy.home.greeting}${firstName ? `, ${firstName}` : ""}`;
  const locale = localeTag(isRTL);
  const localizedSubscriptionStatus = localizeSubscriptionStatus(home?.subscription.status, isRTL);

  return (
    <Screen
      title={title}
      subtitle={bootstrap?.gym.gym_name || copy.home.subtitle}
      action={
        <Pressable onPress={() => router.push("/billing")} style={[styles.badge, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.badgeText, { color: theme.foreground, fontFamily: fontSet.mono, textTransform: isRTL ? "none" : "uppercase" }]}>
            {copy.home.billingBadge}
          </Text>
        </Pressable>
      }
    >
      <QueryState loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <View style={[styles.heroHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.heroTextBlock}>
                <Text
                  style={[
                    styles.heroKicker,
                    {
                      color: theme.primary,
                      fontFamily: fontSet.mono,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                      letterSpacing: isRTL ? 0 : 1,
                      textTransform: isRTL ? "none" : "uppercase",
                    },
                  ]}
                >
                  {copy.home.subscription}
                </Text>
                <Text
                  style={[
                    styles.heroStatus,
                    { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                  ]}
                >
                  {localizedSubscriptionStatus}
                </Text>
              </View>
              <Pressable onPress={() => router.push("/billing")} style={[styles.compactBadge, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
                <Text style={[styles.compactBadgeText, { color: theme.primary, fontFamily: fontSet.mono, textTransform: isRTL ? "none" : "uppercase" }]}>
                  {copy.home.billingBadge}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.heroMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.heroMetaBlock}>
                <MutedText>{copy.home.plan}</MutedText>
                <Text
                  style={[
                    styles.heroPlan,
                    { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                  ]}
                >
                  {home.subscription.plan_name || copy.common.noActivePlan}
                </Text>
              </View>
              <View style={styles.heroMetaBlock}>
                <MutedText>{copy.home.status}</MutedText>
                <Text
                  style={[
                    styles.heroStatusTag,
                    {
                      color: theme.primary,
                      fontFamily: fontSet.mono,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                      textTransform: isRTL ? "none" : "uppercase",
                    },
                  ]}
                >
                  {localizedSubscriptionStatus}
                </Text>
              </View>
            </View>

            <PrimaryButton onPress={() => router.push("/billing")}>{copy.home.renew}</PrimaryButton>
          </Card>

          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <InlineStat label={copy.home.workoutPlans} value={home.quick_stats.active_workout_plans} />
            <InlineStat label={copy.home.dietPlans} value={home.quick_stats.active_diet_plans} />
            <InlineStat label={copy.home.checkIns} value={home.quick_stats.recent_check_ins} />
            <InlineStat label={copy.home.unreadChat} value={home.quick_stats.unread_chat_messages} />
          </View>

          <Card>
            <SectionTitle>{copy.home.quickActions}</SectionTitle>
            <View style={[styles.actionGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <HomeAction label={copy.home.logBodyMetrics} onPress={() => router.push("/(tabs)/progress" as never)} />
              <HomeAction label={copy.home.requestSupport} onPress={() => router.push("/support")} />
              <HomeAction label={copy.home.reportLostItem} onPress={() => router.push("/lost-found")} />
              <HomeAction label={copy.home.leaveFeedback} onPress={() => router.push("/feedback")} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.home.achievements}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.home.currentStreak} value={gamification?.streak.current_streak ?? "--"} />
              <InlineStat label={copy.home.totalVisits} value={gamification?.total_visits ?? "--"} />
              <InlineStat label={copy.home.unlocked} value={`${gamification?.badges.length ?? 0}/11`} />
            </View>
            {gamificationQuery.isLoading ? <MutedText>{copy.common.loading}</MutedText> : null}
            {gamification?.badges.length ? (
              <View style={[styles.badgeGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {gamification.badges.slice(0, 4).map((badge) => (
                  <View key={badge.id} style={[styles.achievementBadge, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
                    <Ionicons name={badgeIcon(badge.badge_type)} size={24} color={theme.primary} />
                    <Text style={[styles.achievementText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: "center" }]} numberOfLines={2}>
                      {cleanBadgeName(badge.badge_name)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : gamificationQuery.isLoading ? null : (
              <MutedText>{copy.home.noBadges}</MutedText>
            )}
            <SecondaryButton onPress={() => router.push("/badges")}>{copy.home.viewAllBadges}</SecondaryButton>
          </Card>

          <Card>
            <SectionTitle>{copy.home.latestBiometric}</SectionTitle>
            {home.latest_biometric ? (
              <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View>
                  <MutedText>{copy.home.weight}</MutedText>
                  <ValueText>{home.latest_biometric.weight_kg ?? "--"} kg</ValueText>
                </View>
                <View>
                  <MutedText>{copy.home.bodyFat}</MutedText>
                  <ValueText>{home.latest_biometric.body_fat_pct ?? "--"}%</ValueText>
                </View>
              </View>
            ) : (
              <MutedText>{copy.home.noBiometrics}</MutedText>
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.home.recentReceipts}</SectionTitle>
            {home.recent_receipts.length === 0 ? (
              <MutedText>{copy.home.noReceipts}</MutedText>
            ) : (
              home.recent_receipts.map((receipt) => (
                <View key={receipt.id} style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={styles.listTextBlock}>
                    <Text
                      style={[
                        styles.listTitle,
                        { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                      ]}
                    >
                      {receipt.description}
                    </Text>
                    <MutedText>{new Date(receipt.date).toLocaleDateString(locale)}</MutedText>
                  </View>
                  <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{receipt.amount}</Text>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function StaffHomeTab() {
  const router = useRouter();
  const { bootstrap, authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const homeQuery = useQuery({
    queryKey: ["mobile-staff-home", bootstrap?.role],
    queryFn: async () => parseStaffHomeEnvelope(await authorizedRequest("/mobile/staff/home")).data,
  });
  const home = homeQuery.data;
  const statLabels = copy.staffHome.stats as Record<string, string>;
  const headlineLabels = copy.staffHome.headlines as Record<string, string>;
  const actionLabels = copy.staffHome.actions as Record<string, string>;
  const itemLabels = copy.staffHome.items;
  const localizedHeadline = home ? headlineLabels[home.role] || home.headline : copy.staffHome.subtitle;
  const quickActions = home?.role === "COACH" ? COACH_HOME_ACTIONS : home?.quick_actions ?? [];
  const attendanceItem = home?.items.find((item) => item.id === "attendance");
  const activityItems = home?.items.filter((item) => item.id !== "attendance") ?? [];
  const activityTitle = getStaffActivityTitle(home?.role, copy);
  const showActivityCard = home?.role !== "EMPLOYEE" || activityItems.length > 0;
  const shiftTimestamp = typeof attendanceItem?.meta === "string" && attendanceItem.meta ? new Date(attendanceItem.meta) : null;
  const locale = localeTag(isRTL);

  return (
    <Screen title={copy.staffHome.title} subtitle={bootstrap?.gym.gym_name || copy.staffHome.subtitle}>
      <QueryState loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <SectionTitle>{localizedHeadline}</SectionTitle>
            <MutedText>{bootstrap?.user.full_name || copy.common.noData}</MutedText>
            <View style={[styles.actionGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {quickActions.map((action) => (
                <HomeAction key={action.id} label={actionLabels[action.id] || action.label} onPress={() => action.route && router.push(action.route as never)} />
              ))}
            </View>
          </Card>

          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {Object.entries(home.stats).map(([key, value]) => (
              <InlineStat key={key} label={statLabels[key] || key} value={typeof value === "number" ? value : String(value)} />
            ))}
          </View>

          <Card>
            <SectionTitle>{copy.staffHome.shiftStatus}</SectionTitle>
            <MutedText>{localizeStaffHomeItemSubtitle("attendance", attendanceItem?.subtitle, itemLabels) || copy.staffHome.shiftNotStarted}</MutedText>
            {shiftTimestamp ? (
              <MutedText>{`${copy.staffHome.shiftStartedAt}: ${shiftTimestamp.toLocaleString(locale)}`}</MutedText>
            ) : null}
            <SecondaryButton onPress={() => router.push("/(tabs)/qr" as never)}>{copy.qr.staffShiftTitle}</SecondaryButton>
          </Card>

          {showActivityCard ? (
            <Card>
              <SectionTitle>{activityTitle}</SectionTitle>
              {activityItems.length === 0 ? (
                <MutedText>{copy.common.noData}</MutedText>
              ) : (
                activityItems.map((item, index) => (
                  <View key={String(item.id || index)} style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.listTextBlock}>
                      <Text
                        style={[
                          styles.listTitle,
                          { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                        ]}
                      >
                        {formatStaffHomeItemTitle(item, itemLabels, copy.common.noData)}
                      </Text>
                      <MutedText>{formatStaffHomeItemSubtitle(item, itemLabels, locale)}</MutedText>
                    </View>
                  </View>
                ))
              )}
            </Card>
          ) : null}

          <SecondaryLink href="/profile">{copy.common.profile}</SecondaryLink>
        </>
      ) : null}
    </Screen>
  );
}

function AdminHomeTab() {
  const router = useRouter();
  const { bootstrap, authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, locale, theme } = usePreferences();
  const homeQuery = useQuery({
    queryKey: ["mobile-admin-home", bootstrap?.role],
    queryFn: async () => parseAdminHomeEnvelope(await authorizedRequest("/mobile/admin/home")).data,
  });
  const home = homeQuery.data;

  return (
    <Screen title={copy.adminControl.title} subtitle={bootstrap?.gym.gym_name || copy.adminControl.admin} showSubtitle>
      <QueryState loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <SectionTitle>{home.headline}</SectionTitle>
            <MutedText>{bootstrap?.user.full_name || bootstrap?.role || "Admin"}</MutedText>
            <View style={[styles.actionGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <HomeAction label={copy.adminControl.peopleSummary} onPress={() => router.push("/(tabs)/members" as never)} />
              <HomeAction label={copy.adminControl.operationsSummary} onPress={() => router.push("/(tabs)/operations" as never)} />
              <HomeAction label={copy.adminControl.financeSummary} onPress={() => router.push("/(tabs)/finance" as never)} />
              <HomeAction label={copy.more.support} onPress={() => router.push("/support")} />
            </View>
          </Card>

          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {home.metrics.map((metric) => (
              <InlineStat key={metric.id} label={metric.label} value={formatAdminMetric(metric.value, locale)} />
            ))}
          </View>

          <Card>
            <SectionTitle>{copy.adminControl.alerts}</SectionTitle>
            {home.alerts.length === 0 ? <MutedText>{copy.adminControl.noAlerts}</MutedText> : null}
            {home.alerts.map((alert) => (
              <Pressable
                key={alert.id}
                onPress={() => alert.route && router.push(alert.route as never)}
                style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}
              >
                <View style={styles.listTextBlock}>
                  <Text
                    style={[
                      styles.listTitle,
                      { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                    ]}
                  >
                    {alert.title}
                  </Text>
                  <MutedText>{alert.body}</MutedText>
                </View>
                <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{alert.count}</Text>
              </Pressable>
            ))}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.approvals}</SectionTitle>
            {home.approvals.map((approval) => (
              <Pressable
                key={approval.id}
                onPress={() => approval.route && router.push(approval.route as never)}
                style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}
              >
                <View style={styles.listTextBlock}>
                  <Text
                    style={[
                      styles.listTitle,
                      { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                    ]}
                  >
                    {approval.title}
                  </Text>
                  <MutedText>{approval.subtitle || copy.adminControl.noPendingAction}</MutedText>
                </View>
                <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{approval.count}</Text>
              </Pressable>
            ))}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.recentActivity}</SectionTitle>
            {home.recent_activity.length === 0 ? <MutedText>{copy.adminControl.noRecentActivity}</MutedText> : null}
            {home.recent_activity.map((item) => (
              <Pressable
                key={`${item.kind}-${item.id}`}
                onPress={() => item.route && router.push(item.route as never)}
                style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}
              >
                <View style={styles.listTextBlock}>
                  <Text
                    style={[
                      styles.listTitle,
                      { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <MutedText>{formatAdminActivitySubtitle(item.subtitle, item.timestamp, locale)}</MutedText>
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function localizeStaffHomeItem(id: unknown, title: unknown, labels: { attendance: string; member: string }) {
  if (id === "attendance") {
    return labels.attendance;
  }
  if (title === "Member") {
    return labels.member;
  }
  return typeof title === "string" ? title : null;
}

function formatAdminMetric(value: number | string, locale: string) {
  if (typeof value === "number") {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
  return value;
}

function formatAdminActivitySubtitle(subtitle: string | null | undefined, timestamp: string | null | undefined, locale: string) {
  const parts = [
    subtitle,
    timestamp ? new Date(timestamp).toLocaleString(locale) : null,
  ].filter(Boolean);
  return parts.join(" - ");
}

function localizeStaffHomeItemSubtitle(id: unknown, subtitle: unknown, labels: { clockedIn: string; notClockedIn: string }) {
  if (id === "attendance" && subtitle === "Clocked in") {
    return labels.clockedIn;
  }
  if (id === "attendance" && subtitle === "Not clocked in") {
    return labels.notClockedIn;
  }
  return typeof subtitle === "string" ? subtitle : null;
}

function getStaffActivityTitle(role: string | undefined, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (role === "COACH") return copy.staffHome.coachActivity;
  if (role === "CASHIER") return copy.financeScreen.recentTransactions;
  if (role === "RECEPTION" || role === "FRONT_DESK") return copy.staffHome.receptionActivity;
  return copy.staffHome.activity;
}

function formatStaffHomeItemTitle(item: Record<string, unknown>, labels: { attendance: string; member: string }, fallback: string) {
  if (typeof item.description === "string" && item.kind === "pos_transaction") {
    return item.description;
  }
  return String(item.full_name || localizeStaffHomeItem(item.id, item.title, labels) || item.title || fallback);
}

function formatStaffHomeItemSubtitle(item: Record<string, unknown>, labels: { clockedIn: string; notClockedIn: string }, locale: string) {
  const parts = [
    localizeStaffHomeItemSubtitle(item.id, item.subtitle, labels) || item.subtitle || item.status || item.member_name || item.payment_method,
    typeof item.amount === "number" ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.amount) : null,
    typeof item.meta === "string" ? new Date(item.meta).toLocaleString(locale) : typeof item.date === "string" ? new Date(item.date).toLocaleString(locale) : null,
  ].filter(Boolean);
  return parts.join(" - ");
}

function badgeIcon(type: string) {
  if (type.startsWith("STREAK")) {
    return "flame-outline";
  }
  if (type.startsWith("VISITS")) {
    return "medal-outline";
  }
  if (type === "EARLY_BIRD") {
    return "sunny-outline";
  }
  if (type === "NIGHT_OWL") {
    return "moon-outline";
  }
  return "star-outline";
}

function cleanBadgeName(name: string) {
  return name.replace(/[^\p{L}\p{N}\s-]/gu, "").trim() || name;
}

function HomeAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }, pressed && styles.pressed]}>
      <Text style={[styles.actionText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    fontWeight: "700",
    fontSize: 12,
  },
  heroCard: {
    paddingVertical: 14,
  },
  heroHeader: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  heroTextBlock: {
    flex: 1,
    gap: 4,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroStatus: {
    fontSize: 22,
    fontWeight: "800",
  },
  heroMeta: {
    justifyContent: "space-between",
    gap: 12,
  },
  heroMetaBlock: {
    flex: 1,
    gap: 2,
  },
  heroPlan: {
    fontSize: 15,
    fontWeight: "600",
  },
  heroStatusTag: {
    fontSize: 13,
    fontWeight: "700",
  },
  compactBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactBadgeText: {
    fontWeight: "700",
    fontSize: 11,
  },
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  actionGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minWidth: 132,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  badgeGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  achievementBadge: {
    width: "47%",
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  achievementText: {
    fontSize: 12,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.85,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  listRow: {
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  listTextBlock: {
    flex: 1,
  },
  amountText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
