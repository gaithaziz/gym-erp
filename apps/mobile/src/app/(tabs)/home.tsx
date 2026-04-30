import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, PrimaryButton, QueryState, Screen, SecondaryButton, SecondaryLink, SectionTitle, SkeletonBlock, ValueText } from "@/components/ui";
import { parseAdminHomeEnvelope, parseEnvelope, parseHomeEnvelope, parseMyReservationsEnvelope, parseStaffHomeEnvelope, type ClassReservation, type MobileGamificationStats } from "@/lib/api";
import { localeTag, localizeAuditAction, localizeFinanceCategory, localizeFinanceTransactionType, localizePaymentMethod, localizeRole, localizeSubscriptionStatus, localizeTicketStatus } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole, isCustomerRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const COACH_HOME_ACTIONS = [
  { id: "shift_qr", route: "/(tabs)/qr" },
  { id: "feedback", route: "/coach-feedback" },
  { id: "leaves", route: "/leaves" },
  { id: "profile", route: "/profile" },
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
  const classesQuery = useQuery({
    queryKey: ["my-reservations-home"],
    queryFn: async () => parseMyReservationsEnvelope(await authorizedRequest("/classes/my-reservations")).data,
  });

  const home = homeQuery.data;
  const gamification = gamificationQuery.data;
  const upcomingClasses = (classesQuery.data ?? []).slice(0, 2);
  const classesCopy = copy.classesScreen;
  const nextClass = (home as typeof home & { next_class?: { name: string; starts_at: string; coach_name?: string | null } })?.next_class;
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
      <QueryState loading={homeQuery.isLoading} loadingVariant="dashboard" error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
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
                {home.subscription.end_date ? (
                  <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 13, textAlign: isRTL ? "right" : "left", writingDirection: direction, marginTop: 4 }}>
                    {copy.home.validUntil}: {new Date(home.subscription.end_date).toLocaleDateString(locale)}
                  </Text>
                ) : null}
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

          {nextClass && (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.primary, marginBottom: 16 }}>
               <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <SectionTitle>{copy.home.nextClass}</SectionTitle>
                  </View>
                  <View style={{ backgroundColor: theme.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                     <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', fontFamily: fontSet.mono }}>{copy.home.confirmed}</Text>
                  </View>
               </View>
              <View style={{ gap: 4, marginTop: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? 'right' : 'left' }}>
                  {nextClass.name}
                </Text>
                <MutedText>
                  {new Date(nextClass.starts_at).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })} at {new Date(nextClass.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </MutedText>
                {nextClass.coach_name && (
                   <MutedText>{`${copy.home.coach}: ${nextClass.coach_name}`}</MutedText>
                )}
              </View>
              <SecondaryButton style={{ marginTop: 12 }} onPress={() => router.push("/classes")}>
                {copy.home.viewDetails}
              </SecondaryButton>
            </Card>
          )}

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
              <HomeAction label={copy.home.requestSupport} onPress={() => router.push("/ticket")} />
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
            {gamificationQuery.isLoading ? (
              <View style={[styles.badgeGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <View key={index} style={[styles.achievementBadge, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
                    <SkeletonBlock height={24} width={24} style={{ alignSelf: "center", borderRadius: 999 }} />
                    <SkeletonBlock height={12} width="80%" style={{ marginTop: 12, alignSelf: "center" }} />
                    <SkeletonBlock height={12} width="58%" style={{ marginTop: 8, alignSelf: "center" }} />
                  </View>
                ))}
              </View>
            ) : null}
            {gamification?.badges.length ? (
              <View style={[styles.badgeGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {gamification.badges.slice(0, 4).map((badge) => (
                  <View key={badge.id} style={[styles.achievementBadge, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
                    <Ionicons name={badgeIcon(badge.badge_type)} size={24} color={theme.primary} />
                    <Text style={[styles.achievementText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: "center" }]} numberOfLines={2}>
                      {localizeBadgeName(badge.badge_type, badge.badge_name, isRTL)}
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

          <Card>
            <SectionTitle>{classesCopy.upcoming}</SectionTitle>
            {classesQuery.isLoading ? (
              Array.from({ length: 2 }).map((_, index) => (
                <View key={index} style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={styles.listTextBlock}>
                    <SkeletonBlock height={16} width="62%" />
                    <SkeletonBlock height={12} width="78%" style={{ marginTop: 8 }} />
                  </View>
                  <SkeletonBlock height={16} width={58} />
                </View>
              ))
            ) : upcomingClasses.length === 0 ? (
              <MutedText>{classesCopy.noBookings}</MutedText>
            ) : (
              upcomingClasses.map((r: ClassReservation) => {
                const statusColor =
                  r.status === "RESERVED" ? theme.primary :
                  r.status === "PENDING" ? "#F59E0B" : theme.muted;
                const statusLabel =
                  r.status === "RESERVED" ? classesCopy.confirmed :
                  r.status === "PENDING" ? classesCopy.pending : r.status === "WAITLISTED" ? classesCopy.waitlisted : r.status;
                return (
                  <View key={r.reservation_id} style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.listTextBlock}>
                      <Text style={[styles.listTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>
                        {r.session.template_name}
                      </Text>
                      <MutedText>
                        {new Date(r.session.starts_at).toLocaleDateString(localeTag(isRTL), { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(r.session.starts_at).toLocaleTimeString(localeTag(isRTL), { hour: "2-digit", minute: "2-digit" })}
                      </MutedText>
                    </View>
                    <Text style={[styles.amountText, { color: statusColor, fontFamily: fontSet.mono, fontSize: 12 }]}>{statusLabel}</Text>
                  </View>
                );
              })
            )}
            <SecondaryButton onPress={() => router.push("/classes" as never)}>{copy.home.viewDetails}</SecondaryButton>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function StaffHomeTab() {
  const router = useRouter();
  const { bootstrap, authorizedRequest, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const homeQuery = useQuery({
    queryKey: ["mobile-staff-home", bootstrap?.role, selectedBranchId ?? "all"],
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseStaffHomeEnvelope(await authorizedRequest(`/mobile/staff/home${suffix}`)).data;
    },
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
      <QueryState loading={homeQuery.isLoading} loadingVariant="dashboard" error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <SectionTitle>{localizedHeadline}</SectionTitle>
            <MutedText>{bootstrap?.user.full_name || copy.common.noData}</MutedText>
            <View style={[styles.actionGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {quickActions.map((action) => (
                <HomeAction key={action.id} label={actionLabels[action.id] || action.id} onPress={() => action.route && router.push(action.route as never)} />
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
                      <MutedText>{formatStaffHomeItemSubtitle(item, itemLabels, locale, isRTL)}</MutedText>
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
  const { bootstrap, authorizedRequest, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, locale, theme } = usePreferences();
  const homeQuery = useQuery({
    queryKey: ["mobile-admin-home", bootstrap?.role, selectedBranchId ?? "all"],
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseAdminHomeEnvelope(await authorizedRequest(`/mobile/admin/home${suffix}`)).data;
    },
  });
  const home = homeQuery.data;

  return (
    <Screen title={copy.adminControl.title} subtitle={bootstrap?.gym.gym_name || copy.adminControl.admin} showSubtitle>
      <QueryState loading={homeQuery.isLoading} loadingVariant="dashboard" error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <SectionTitle>{copy.adminControl.title}</SectionTitle>
            <MutedText>{bootstrap?.user.full_name || localizeRole(bootstrap?.role || "ADMIN", isRTL)}</MutedText>
            <View style={[styles.actionGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <HomeAction label={copy.adminControl.peopleSummary} onPress={() => router.push("/(tabs)/members" as never)} />
              <HomeAction label={copy.adminControl.employeeOperations} onPress={() => router.push("/staff-operations")} />
              <HomeAction label={copy.adminControl.operationsSummary} onPress={() => router.push("/(tabs)/operations" as never)} />
              <HomeAction label={copy.adminControl.financeSummary} onPress={() => router.push("/(tabs)/finance" as never)} />
              <HomeAction label={copy.adminControl.approvalQueue} onPress={() => router.push("/approvals")} />
              <HomeAction label={copy.more.support} onPress={() => router.push("/ticket")} />
            </View>
          </Card>

          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {home.metrics.map((metric) => (
              <InlineStat key={metric.id} label={adminMetricLabel(metric.id, metric.label, copy)} value={formatAdminMetric(metric.value, locale)} />
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
                    {adminAlertTitle(alert.id, alert.title, copy)}
                  </Text>
                  <MutedText>{adminAlertBody(alert.id, alert.body, alert.count, copy)}</MutedText>
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
                    {adminApprovalTitle(approval.id, approval.title, copy)}
                  </Text>
                  <MutedText>{adminApprovalSubtitle(approval.id, approval.subtitle, copy)}</MutedText>
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
                    {adminActivityTitle(item, isRTL, copy)}
                  </Text>
                  <MutedText>{formatAdminActivitySubtitle(item, isRTL, locale, copy)}</MutedText>
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

function adminMetricLabel(id: string, fallback: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (id === "members") return copy.adminControl.members;
  if (id === "active_members") return copy.adminControl.active;
  if (id === "today_checkins") return copy.adminControl.checkIns;
  if (id === "month_net") return copy.adminControl.monthNet;
  if (id === "open_support") return copy.common.support;
  return fallback;
}

function adminAlertTitle(id: string, fallback: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (id === "low_stock") return copy.adminControl.lowStock;
  if (id === "support_queue") return copy.adminControl.openSupport;
  return fallback;
}

function adminAlertBody(id: string, fallback: string, count: number, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (id === "low_stock") return `${count} ${copy.adminControl.lowStock}`;
  if (id === "support_queue") return `${count} ${copy.adminControl.openSupport}`;
  return fallback;
}

function adminApprovalTitle(id: string, fallback: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (id === "renewals") return copy.adminControl.renewalRequests;
  if (id === "leave_requests") return copy.adminControl.leaveRequests;
  return fallback;
}

function adminApprovalSubtitle(id: string, fallback: string | null | undefined, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (id === "renewals") return copy.billingScreen.requestHelp;
  if (id === "leave_requests") return copy.adminControl.noPendingAction;
  return fallback || copy.adminControl.noPendingAction;
}

function adminActivityTitle(item: { kind: string; title: string; subtitle?: string | null }, isRTL: boolean, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (item.kind === "audit") return localizeAuditAction(item.title, isRTL);
  if (item.kind === "finance") return financeActivityTitle(item.title, item.subtitle, isRTL);
  if (item.kind === "support") return copy.common.support;
  return item.title;
}

function formatAdminActivitySubtitle(item: { kind: string; subtitle?: string | null; timestamp?: string | null }, isRTL: boolean, locale: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  let subtitle = item.subtitle;
  if (item.kind === "finance" && subtitle) {
    const [type, ...rest] = subtitle.split(" ");
    subtitle = [localizeFinanceTransactionType(type, isRTL), rest.join(" ")].filter(Boolean).join(" ");
  } else if (item.kind === "support") {
    subtitle = localizeTicketStatus(subtitle ?? undefined, isRTL);
  } else if (item.kind === "audit" && subtitle === "System") {
    subtitle = copy.adminControl.system;
  }
  const parts = [
    subtitle,
    item.timestamp ? new Date(item.timestamp).toLocaleString(locale) : null,
  ].filter(Boolean);
  return parts.join(" - ");
}

function financeActivityTitle(title: string, subtitle: string | null | undefined, isRTL: boolean) {
  const normalizedTitle = title.toUpperCase();
  if (normalizedTitle.includes("POS")) {
    return localizeFinanceCategory("POS_SALE", isRTL);
  }
  if (normalizedTitle.includes("MEMBERSHIP") || normalizedTitle.includes("SUBSCRIPTION") || normalizedTitle.includes("RENEWAL")) {
    return localizeFinanceCategory("SUBSCRIPTION", isRTL);
  }
  if (normalizedTitle.includes("SALARY")) {
    return localizeFinanceCategory("SALARY", isRTL);
  }
  if (normalizedTitle.includes("OPERATING EXPENSE")) {
    return localizeFinanceTransactionType("EXPENSE", isRTL);
  }
  const [type] = (subtitle ?? "").split(" ");
  return localizeFinanceTransactionType(type || undefined, isRTL);
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

function formatStaffHomeItemSubtitle(item: Record<string, unknown>, labels: { clockedIn: string; notClockedIn: string }, locale: string, isRTL: boolean) {
  const paymentMethod = typeof item.payment_method === "string" ? localizePaymentMethod(item.payment_method, isRTL) : null;
  const status = typeof item.status === "string" ? localizeTicketStatus(item.status, isRTL) : null;
  const parts = [
    localizeStaffHomeItemSubtitle(item.id, item.subtitle, labels) || item.subtitle || status || item.member_name || paymentMethod,
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

function localizeBadgeName(type: string, fallback: string, isRTL: boolean) {
  const localized = isRTL ? badgeNameAr(type) : badgeNameEn(type);
  return localized || cleanBadgeName(fallback);
}

function badgeNameEn(type: string) {
  switch (type) {
    case "STREAK_3":
      return "3-Day Streak";
    case "STREAK_7":
      return "Weekly Warrior";
    case "STREAK_14":
      return "Fortnight Force";
    case "STREAK_30":
      return "Monthly Machine";
    case "VISITS_10":
      return "10 Club Visits";
    case "VISITS_25":
      return "25 Club Visits";
    case "VISITS_50":
      return "50 Club Visits";
    case "VISITS_100":
      return "100 Club";
    case "VISITS_250":
      return "250 Club Legend";
    case "EARLY_BIRD":
      return "Early Bird";
    case "NIGHT_OWL":
      return "Night Owl";
    default:
      return null;
  }
}

function badgeNameAr(type: string) {
  switch (type) {
    case "STREAK_3":
      return "سلسلة 3 أيام";
    case "STREAK_7":
      return "مقاتل الأسبوع";
    case "STREAK_14":
      return "قوة الأسبوعين";
    case "STREAK_30":
      return "آلة الشهر";
    case "VISITS_10":
      return "10 زيارات للنادي";
    case "VISITS_25":
      return "25 زيارة للنادي";
    case "VISITS_50":
      return "50 زيارة للنادي";
    case "VISITS_100":
      return "نادي الـ100";
    case "VISITS_250":
      return "أسطورة الـ250";
    case "EARLY_BIRD":
      return "الطائر المبكر";
    case "NIGHT_OWL":
      return "بومة الليل";
    default:
      return null;
  }
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
