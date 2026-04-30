import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, Input, MutedText, QueryState, Screen, SecondaryButton, SectionTitle } from "@/components/ui";
import { parseAdminPeopleSummaryEnvelope, parseStaffMemberDetailEnvelope } from "@/lib/api";
import { localeTag, localizeAccessStatus, localizePlanStatus, localizeRole, localizeSubscriptionStatus } from "@/lib/mobile-format";
import { getCurrentRole, hasCapability, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";
import type { MobileStaffMemberDetail } from "@gym-erp/contracts";

type StaffMemberSummary = {
  id: string;
  full_name?: string | null;
  email: string;
  phone_number?: string | null;
  subscription: {
    status: string;
    end_date?: string | null;
    plan_name?: string | null;
  };
};

type PlanSummary = {
  id: string;
  name: string;
  status: string;
};

type Notice = { kind: "success" | "error"; message: string };
const SECTION_PREVIEW_LIMIT = 3;
const MEMBER_DROPDOWN_LIMIT = 8;
const PROGRESS_RANGES = [
  { id: "7d", days: 7, labelKey: "range7Days" as const },
  { id: "30d", days: 30, labelKey: "range30Days" as const },
  { id: "90d", days: 90, labelKey: "range90Days" as const },
  { id: "all", days: null, labelKey: "rangeAll" as const },
] as const;

function visibleItems<T>(items: T[], expanded?: boolean, limit = SECTION_PREVIEW_LIMIT) {
  return expanded ? items : items.slice(0, limit);
}

export default function MembersTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { authorizedRequest, bootstrap, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const role = getCurrentRole(bootstrap);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const adminControl = isAdminControlRole(role);
  const canChat = hasCapability(bootstrap, "view_chat") && !adminControl;
  const canCheckIn = hasCapability(bootstrap, "scan_member_qr") || hasCapability(bootstrap, "lookup_members");
  const canSupport = hasCapability(bootstrap, "view_support");
  const canAssignWorkout = hasCapability(bootstrap, "manage_member_plans");
  const canAssignDiet = hasCapability(bootstrap, "manage_member_diets");
  const canRegister = role === "ADMIN" || role === "MANAGER" || role === "RECEPTION" || role === "FRONT_DESK";

  const adminSummaryQuery = useQuery({
    queryKey: ["mobile-admin-people-summary", role, selectedBranchId ?? "all"],
    enabled: adminControl,
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseAdminPeopleSummaryEnvelope(await authorizedRequest(`/mobile/admin/people/summary${suffix}`)).data;
    },
  });

  const membersQuery = useQuery({
    queryKey: ["mobile-staff-members", search, selectedBranchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("q", search.trim());
      }
      if (selectedBranchId) {
        params.set("branch_id", selectedBranchId);
      }
      const suffix = params.toString();
      return (await authorizedRequest<StaffMemberSummary[]>(suffix ? `/mobile/staff/members?${suffix}` : "/mobile/staff/members")).data;
    },
  });
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const dropdownMembers = members.slice(0, MEMBER_DROPDOWN_LIMIT);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["mobile-staff-members"] });
      if (selectedMemberId) {
        void queryClient.invalidateQueries({ queryKey: ["mobile-staff-member-detail", selectedMemberId] });
      }
    }, [queryClient, selectedMemberId]),
  );

  useEffect(() => {
    if (params.memberId && typeof params.memberId === "string") {
      setSelectedMemberId(params.memberId);
    }
  }, [params.memberId]);

  useEffect(() => {
    if (!params.memberId && !selectedMemberId && members[0]?.id) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, params.memberId, selectedMemberId]);

  const selectedMemberFromList = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const detailQuery = useQuery({
    queryKey: ["mobile-staff-member-detail", selectedMemberId, selectedBranchId],
    enabled: Boolean(selectedMemberId),
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseStaffMemberDetailEnvelope(await authorizedRequest(`/mobile/staff/members/${selectedMemberId}${suffix}`)).data;
    },
  });

  const selectedMember = detailQuery.data?.member
    ? { id: detailQuery.data.member.id, email: detailQuery.data.member.email, full_name: detailQuery.data.member.full_name }
    : selectedMemberFromList;
  const selectedMemberSummary =
    selectedMemberFromList ??
    (selectedMember
      ? {
          id: selectedMember.id,
          email: selectedMember.email,
          full_name: selectedMember.full_name,
          phone_number: null,
          subscription: {
            status: detailQuery.data?.subscription.status ?? "NONE",
            end_date: detailQuery.data?.subscription.end_date,
            plan_name: detailQuery.data?.subscription.plan_name,
          },
        }
      : null);
  const selectedSubscription = detailQuery.data?.subscription ?? selectedMemberSummary?.subscription ?? null;

  const workoutPlansQuery = useQuery({
    queryKey: ["mobile-coach-plan-summaries", role, selectedBranchId ?? "all"],
    enabled: canAssignWorkout,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (role !== "COACH") {
        params.set("include_all_creators", "true");
        params.set("templates_only", "true");
      }
      if (selectedBranchId) {
        params.set("branch_id", selectedBranchId);
      }
      const suffix = params.toString();
      return (await authorizedRequest<PlanSummary[]>(suffix ? `/fitness/plan-summaries?${suffix}` : "/fitness/plan-summaries")).data;
    },
  });

  const dietPlansQuery = useQuery({
    queryKey: ["mobile-coach-diet-summaries", role, selectedBranchId ?? "all"],
    enabled: canAssignDiet,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (role !== "COACH") {
        params.set("include_all_creators", "true");
        params.set("templates_only", "true");
      }
      if (selectedBranchId) {
        params.set("branch_id", selectedBranchId);
      }
      const suffix = params.toString();
      return (await authorizedRequest<PlanSummary[]>(suffix ? `/fitness/diet-summaries?${suffix}` : "/fitness/diet-summaries")).data;
    },
  });

  const assignWorkoutMutation = useMutation({
    onMutate: () => setNotice(null),
    mutationFn: async (planId: string) => {
      if (!selectedMemberId) {
        throw new Error(copy.membersScreen.noMembers);
      }
      return authorizedRequest(`/fitness/plans/${planId}/bulk-assign`, {
        method: "POST",
        body: JSON.stringify({ member_ids: [selectedMemberId], replace_active: true }),
      });
    },
    onSuccess: async (payload) => {
      setNotice({ kind: "success", message: payload.message || copy.common.successUpdated });
      await queryClient.invalidateQueries({ queryKey: ["mobile-staff-member-detail", selectedMemberId] });
    },
    onError: (error) => setNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain }),
  });

  const assignDietMutation = useMutation({
    onMutate: () => setNotice(null),
    mutationFn: async (dietId: string) => {
      if (!selectedMemberId) {
        throw new Error(copy.membersScreen.noMembers);
      }
      return authorizedRequest(`/fitness/diets/${dietId}/bulk-assign`, {
        method: "POST",
        body: JSON.stringify({ member_ids: [selectedMemberId], replace_active: true }),
      });
    },
    onSuccess: async (payload) => {
      setNotice({ kind: "success", message: payload.message || copy.common.successUpdated });
      await queryClient.invalidateQueries({ queryKey: ["mobile-staff-member-detail", selectedMemberId] });
    },
    onError: (error) => setNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain }),
  });

  const openCheckIn = () => {
    if (!selectedMemberId) return;
    router.push({ pathname: "/(tabs)/qr", params: { memberId: selectedMemberId } });
  };

  const openSupport = () => {
    if (!selectedMemberId) return;
    router.push({ pathname: "/ticket", params: { type: "support", memberId: selectedMemberId } });
  };

  return (
    <Screen title={copy.membersScreen.title} subtitle={copy.membersScreen.subtitle} showSubtitle={role === "COACH"}>
      {adminControl ? (
        <>
          <QueryState loading={adminSummaryQuery.isLoading} loadingVariant="stats" skeletonCount={4} error={adminSummaryQuery.error instanceof Error ? adminSummaryQuery.error.message : null} />
          {adminSummaryQuery.data ? (
            <Card style={styles.adminSummaryCard}>
              <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <SectionTitle>{copy.adminControl.peopleSnapshot}</SectionTitle>
                <StatusPill label={localizeRole(role || "ADMIN", isRTL)} />
              </View>
              <View style={[styles.adminStatGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <InlineStat label={copy.adminControl.members} value={adminSummaryQuery.data.members.total} />
                <InlineStat label={copy.adminControl.active} value={adminSummaryQuery.data.members.active} />
                <InlineStat label={copy.adminControl.blocked} value={adminSummaryQuery.data.members.blocked_or_inactive} />
                <InlineStat label={copy.adminControl.staff} value={adminSummaryQuery.data.staff.total} />
              </View>
              <View style={[styles.metricGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <MiniMetric label={copy.adminControl.staffInToday} value={adminSummaryQuery.data.attendance.staff_checked_in_today} />
                <MiniMetric label={copy.adminControl.memberScans} value={adminSummaryQuery.data.attendance.member_scans_today} />
              </View>
              <SecondaryButton onPress={() => router.push("/staff-operations")}>{copy.adminControl.openEmployeeOperations}</SecondaryButton>
              {adminSummaryQuery.data.staff.by_role.length ? (
                <View style={styles.roleList}>
                  {adminSummaryQuery.data.staff.by_role.map((item) => (
                    <SimpleRow key={item.id} title={localizeRole(item.id || item.label, isRTL)} subtitle={`${item.value}`} />
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      <Card style={styles.searchCard}>
        <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <SectionTitle>{copy.staffTabs.members}</SectionTitle>
          <StatusPill label={String(members.length)} />
        </View>
        <View style={[styles.searchHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={{ flex: 1 }}>
            <Input
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setMemberDropdownOpen(true);
              }}
              onFocus={() => setMemberDropdownOpen(true)}
              placeholder={copy.membersScreen.search}
            />
          </View>
          {canRegister ? (
            <SecondaryButton onPress={() => router.push("/member-register")}>{copy.membersScreen.quickRegister}</SecondaryButton>
          ) : null}
        </View>
        {selectedMember ? (
          <Pressable
            onPress={() => setMemberDropdownOpen((current) => !current)}
            style={[
              styles.selectedMemberTrigger,
              {
                backgroundColor: theme.cardAlt,
                borderColor: memberDropdownOpen ? theme.primary : theme.border,
                flexDirection: isRTL ? "row-reverse" : "row",
              },
            ]}
          >
            <Avatar name={selectedMember.full_name} email={selectedMember.email} compact />
            <View style={styles.selectedMemberText}>
              <Text
                style={{ color: theme.foreground, fontFamily: fontSet.body, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: direction }}
                numberOfLines={1}
              >
                {selectedMember.full_name || selectedMember.email}
              </Text>
              <MutedText>
                {formatSubscriptionSummary(selectedSubscription, locale, isRTL, copy)}
              </MutedText>
            </View>
            <Ionicons name={memberDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} />
          </Pressable>
        ) : null}
      </Card>

      <QueryState
        loading={membersQuery.isLoading}
        loadingVariant="list"
        error={membersQuery.error instanceof Error ? membersQuery.error.message : null}
        empty={!membersQuery.isLoading && members.length === 0 && !selectedMemberId}
        emptyMessage={copy.membersScreen.noMembers}
      />

      {memberDropdownOpen ? (
        <Card style={styles.memberDropdown}>
          <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MutedText>{search.trim() ? copy.membersScreen.search : copy.membersScreen.pickMember}</MutedText>
            <Pressable onPress={() => setMemberDropdownOpen(false)}>
              <Text style={[styles.dropdownCloseText, { color: theme.primary, fontFamily: fontSet.body }]}>{copy.common.cancel}</Text>
            </Pressable>
          </View>
          {members.length >= 50 ? <MutedText>{copy.membersScreen.searchMoreHint}</MutedText> : null}
          {dropdownMembers.map((member) => {
            const active = member.id === selectedMemberId;
            return (
              <MemberListItem
                key={member.id}
                member={member}
                active={active}
                subscriptionLabel={member.subscription.plan_name || localizeSubscriptionStatus(member.subscription.status, isRTL)}
                onPress={() => {
                  setNotice(null);
                  setExpandedSections({});
                  setSelectedMemberId(member.id);
                  setMemberDropdownOpen(false);
                  setSearch("");
                }}
              />
            );
          })}
          {members.length > MEMBER_DROPDOWN_LIMIT ? <MutedText>{copy.membersScreen.searchMoreHint}</MutedText> : null}
        </Card>
      ) : null}

      <QueryState loading={detailQuery.isLoading} loadingVariant="detail" error={detailQuery.error instanceof Error ? detailQuery.error.message : null} />
      {detailQuery.data ? (
        <>
          <Card style={styles.heroCard}>
            <View style={[styles.heroHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Avatar name={detailQuery.data.member.full_name} email={detailQuery.data.member.email} />
              <View style={styles.heroCopy}>
                <SectionTitle>{detailQuery.data.member.full_name || detailQuery.data.member.email}</SectionTitle>
                <MutedText>{detailQuery.data.member.email}</MutedText>
                <StatusPill label={detailQuery.data.subscription.plan_name || localizeSubscriptionStatus(detailQuery.data.subscription.status, isRTL)} />
              </View>
            </View>
            <View style={[styles.metricGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MiniMetric label={copy.membersScreen.workoutPlans} value={detailQuery.data.active_workout_plans.length} />
              <MiniMetric label={copy.membersScreen.dietPlans} value={detailQuery.data.active_diet_plans.length} />
              <MiniMetric label={copy.membersScreen.attendance} value={detailQuery.data.recent_attendance.length} />
            </View>
            {notice ? <InlineNotice notice={notice} /> : null}
            <View style={[styles.actionWrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {canChat ? (
                <ActionPill icon="chatbubble-ellipses-outline" label={copy.membersScreen.openChat} primary onPress={() => router.push({ pathname: "/chat", params: { contactId: detailQuery.data?.member.id, memberId: detailQuery.data?.member.id } })} />
              ) : null}
              {canCheckIn ? <ActionPill icon="scan-outline" label={copy.membersScreen.checkInMember} onPress={openCheckIn} /> : null}
              {canSupport ? <ActionPill icon="help-buoy-outline" label={copy.membersScreen.openSupport} onPress={openSupport} /> : null}
              {role === "COACH" ? <ActionPill icon="clipboard-outline" label={copy.membersScreen.viewFeedbackQueue} onPress={() => router.push("/coach-feedback")} /> : null}
            </View>
          </Card>

          <ProgressSnapshotCard detail={detailQuery.data} locale={locale} />

          <DataCard title={copy.membersScreen.workoutPlans}>
            {detailQuery.data.active_workout_plans.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.active_workout_plans, expandedSections.workouts).map((plan) => (
                <SimpleRow key={plan.id} title={plan.name} subtitle={localizePlanStatus(plan.status, isRTL)} />
              ))
            )}
            <OverflowToggle total={detailQuery.data.active_workout_plans.length} expanded={!!expandedSections.workouts} onPress={() => setExpandedSections((current) => ({ ...current, workouts: !current.workouts }))} />
          </DataCard>

          <DataCard title={copy.membersScreen.dietPlans}>
            {detailQuery.data.active_diet_plans.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.active_diet_plans, expandedSections.diets).map((plan) => (
                <SimpleRow key={plan.id} title={plan.name} subtitle={localizePlanStatus(plan.status, isRTL)} />
              ))
            )}
            <OverflowToggle total={detailQuery.data.active_diet_plans.length} expanded={!!expandedSections.diets} onPress={() => setExpandedSections((current) => ({ ...current, diets: !current.diets }))} />
          </DataCard>

          <DataCard title={copy.membersScreen.attendance}>
            {detailQuery.data.recent_attendance.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.recent_attendance, expandedSections.attendance).map((item) => (
                <SimpleRow key={item.id} title={localizeAccessStatus(item.status, isRTL)} subtitle={new Date(item.scan_time).toLocaleString(locale)} />
              ))
            )}
            <OverflowToggle total={detailQuery.data.recent_attendance.length} expanded={!!expandedSections.attendance} onPress={() => setExpandedSections((current) => ({ ...current, attendance: !current.attendance }))} />
          </DataCard>

          <DataCard title={copy.membersScreen.biometrics}>
            {detailQuery.data.biometrics.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.biometrics, expandedSections.biometrics).map((item) => (
                <SimpleRow
                  key={item.id}
                  title={`${item.weight_kg ?? "--"} kg • ${item.body_fat_pct ?? "--"}%`}
                  subtitle={new Date(item.date).toLocaleDateString(locale)}
                />
              ))
            )}
            <OverflowToggle total={detailQuery.data.biometrics.length} expanded={!!expandedSections.biometrics} onPress={() => setExpandedSections((current) => ({ ...current, biometrics: !current.biometrics }))} />
          </DataCard>

          <DataCard title={copy.membersScreen.progressHistory}>
            {detailQuery.data.recent_workout_sessions.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.recent_workout_sessions, expandedSections.progress).map((session) => (
                <SimpleRow
                  key={session.id}
                  title={session.plan_name || copy.common.noCurrentPlan}
                  subtitle={`${new Date(session.performed_at).toLocaleString(locale)} • ${session.duration_minutes ?? 0} ${copy.common.minutesShort} • ${copy.progress.sessionVolume}: ${session.session_volume ?? 0} kg`}
                  note={session.notes}
                />
              ))
            )}
            <OverflowToggle total={detailQuery.data.recent_workout_sessions.length} expanded={!!expandedSections.progress} onPress={() => setExpandedSections((current) => ({ ...current, progress: !current.progress }))} />
          </DataCard>

          <DataCard title={copy.membersScreen.feedback}>
            {(() => {
              const feedbackItems = [...detailQuery.data.workout_feedback, ...detailQuery.data.diet_feedback, ...detailQuery.data.gym_feedback];
              if (feedbackItems.length === 0) {
                return <MutedText>{copy.common.noData}</MutedText>;
              }
              return (
                <>
                  {visibleItems(feedbackItems, expandedSections.feedback).map((item) => "plan_id" in item ? (
                    <SimpleRow
                      key={item.id}
                      title={item.plan_name || copy.feedbackScreen.workout}
                      subtitle={`${item.difficulty_rating ?? "--"}/5 • ${new Date(item.date).toLocaleDateString(locale)}`}
                      note={item.comment}
                    />
                  ) : "diet_plan_id" in item ? (
                    <SimpleRow
                      key={item.id}
                      title={item.diet_plan_name || copy.feedbackScreen.dietPlan}
                      subtitle={`${item.rating}/5 • ${new Date(item.created_at).toLocaleDateString(locale)}`}
                      note={item.comment}
                    />
                  ) : (
                    <SimpleRow
                      key={item.id}
                      title={feedbackCategoryLabel(item.category, copy)}
                      subtitle={`${item.rating}/5 • ${new Date(item.created_at).toLocaleDateString(locale)}`}
                      note={item.comment}
                    />
                  ))}
                  <OverflowToggle total={feedbackItems.length} expanded={!!expandedSections.feedback} onPress={() => setExpandedSections((current) => ({ ...current, feedback: !current.feedback }))} />
                </>
              );
            })()}
          </DataCard>

          {canAssignWorkout ? (
            <AssignmentCard
              title={copy.membersScreen.assignWorkout}
              hint={copy.membersScreen.pickWorkout}
              searchPlaceholder={copy.membersScreen.searchWorkoutPlans}
              selectLabel={copy.membersScreen.selectWorkoutPlan}
              plans={workoutPlansQuery.data ?? []}
              loading={workoutPlansQuery.isLoading}
              error={workoutPlansQuery.error instanceof Error ? workoutPlansQuery.error.message : null}
              emptyMessage={copy.membersScreen.noAssignablePlans}
              noResultsMessage={copy.membersScreen.noMatchingPlans}
              pending={assignWorkoutMutation.isPending}
              onAssign={(planId) => assignWorkoutMutation.mutate(planId)}
            />
          ) : null}

          {canAssignDiet ? (
            <AssignmentCard
              title={copy.membersScreen.assignDiet}
              hint={copy.membersScreen.pickDiet}
              searchPlaceholder={copy.membersScreen.searchDietPlans}
              selectLabel={copy.membersScreen.selectDietPlan}
              plans={dietPlansQuery.data ?? []}
              loading={dietPlansQuery.isLoading}
              error={dietPlansQuery.error instanceof Error ? dietPlansQuery.error.message : null}
              emptyMessage={copy.membersScreen.noAssignableDiets}
              noResultsMessage={copy.membersScreen.noMatchingPlans}
              pending={assignDietMutation.isPending}
              onAssign={(planId) => assignDietMutation.mutate(planId)}
            />
          ) : null}
        </>
      ) : selectedMember ? null : (
        <MutedText>{copy.membersScreen.pickMember}</MutedText>
      )}
    </Screen>
  );
}

function DataCard({ title, children }: { title: string; children: ReactNode }) {
  const { isRTL } = usePreferences();
  return (
    <Card style={styles.dataCard}>
      <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <SectionTitle>{title}</SectionTitle>
      </View>
      {children}
    </Card>
  );
}

function AssignmentCard({
  title,
  hint,
  searchPlaceholder,
  selectLabel,
  plans,
  loading,
  error,
  emptyMessage,
  noResultsMessage,
  pending,
  onAssign,
}: {
  title: string;
  hint: string;
  searchPlaceholder: string;
  selectLabel: string;
  plans: PlanSummary[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  noResultsMessage: string;
  pending: boolean;
  onAssign: (planId: string) => void;
}) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredPlans = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return plans;
    return plans.filter((plan) => [plan.name, plan.status].some((value) => value.toLowerCase().includes(needle)));
  }, [plans, search]);
  const visiblePlans = filteredPlans.slice(0, 8);

  return (
    <Card style={styles.assignmentCard}>
      <SectionTitle>{title}</SectionTitle>
      <MutedText>{hint}</MutedText>
      <QueryState loading={loading} loadingVariant="list" error={error} empty={!loading && plans.length === 0} emptyMessage={emptyMessage} />
      {plans.length > 0 ? (
        <>
          <Pressable
            onPress={() => setOpen((current) => !current)}
            style={[
              styles.assignmentTrigger,
              {
                borderColor: open ? theme.primary : theme.border,
                backgroundColor: theme.cardAlt,
                flexDirection: isRTL ? "row-reverse" : "row",
              },
            ]}
          >
            <View style={styles.memberCardText}>
              <Text
                style={{ color: theme.foreground, fontFamily: fontSet.body, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: direction }}
                numberOfLines={1}
              >
                {selectLabel}
              </Text>
              <MutedText>{searchPlaceholder}</MutedText>
            </View>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={theme.primary} />
          </Pressable>

          {open ? (
            <View style={styles.assignmentDropdown}>
              <Input value={search} onChangeText={setSearch} placeholder={searchPlaceholder} />
              {visiblePlans.length === 0 ? <MutedText>{noResultsMessage}</MutedText> : null}
              {visiblePlans.map((plan) => (
                <PlanAssignRow
                  key={plan.id}
                  plan={plan}
                  disabled={pending}
                  onPress={() => {
                    onAssign(plan.id);
                    setOpen(false);
                    setSearch("");
                  }}
                />
              ))}
              {filteredPlans.length > visiblePlans.length ? <MutedText>{`${visiblePlans.length}/${filteredPlans.length}`}</MutedText> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function MemberListItem({ member, active, subscriptionLabel, onPress }: { member: StaffMemberSummary; active: boolean; subscriptionLabel: string; onPress: () => void }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.memberCard,
        {
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? theme.primarySoft : theme.cardAlt,
          flexDirection: isRTL ? "row-reverse" : "row",
        },
      ]}
    >
      <Avatar name={member.full_name} email={member.email} compact />
      <View style={styles.memberCardText}>
        <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.body, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: direction }} numberOfLines={1}>
          {member.full_name || member.email}
        </Text>
        <MutedText>{subscriptionLabel}</MutedText>
      </View>
      <Ionicons name={active ? "checkmark-circle" : "chevron-forward"} size={20} color={active ? theme.primary : theme.muted} />
    </Pressable>
  );
}

function Avatar({ name, email, compact }: { name?: string | null; email?: string | null; compact?: boolean }) {
  const { fontSet, theme } = usePreferences();
  const source = name || email || "?";
  const initials = source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
  return (
    <View style={[compact ? styles.avatarCompact : styles.avatar, { backgroundColor: theme.primary }]}>
      <Text style={{ color: "#FFFFFF", fontFamily: fontSet.display, fontSize: compact ? 15 : 22, fontWeight: "800" }}>{initials}</Text>
    </View>
  );
}

function StatusPill({ label }: { label: string }) {
  const { fontSet, theme } = usePreferences();
  return (
    <View style={[styles.statusPill, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
      <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 11, fontWeight: "800" }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.miniMetric, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text
        style={[styles.miniMetricLabel, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text
        style={[styles.miniMetricValue, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.74}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionPill({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionPill,
        {
          backgroundColor: primary ? theme.primary : theme.cardAlt,
          borderColor: primary ? theme.primary : theme.border,
        },
        pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] },
      ]}
    >
      <Ionicons name={icon} size={16} color={primary ? "#FFFFFF" : theme.primary} />
      <Text style={{ color: primary ? "#FFFFFF" : theme.foreground, fontFamily: fontSet.body, fontSize: 13, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function PlanAssignRow({ plan, disabled, onPress }: { plan: PlanSummary; disabled: boolean; onPress: () => void }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.planAssignRow,
        {
          borderColor: theme.border,
          backgroundColor: theme.cardAlt,
          flexDirection: isRTL ? "row-reverse" : "row",
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.memberCardText}>
        <Text style={{ color: theme.foreground, fontFamily: fontSet.body, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: direction }} numberOfLines={1}>
          {plan.name}
        </Text>
        <MutedText>{localizePlanStatus(plan.status, isRTL)}</MutedText>
      </View>
      <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
    </Pressable>
  );
}

function ProgressSnapshotCard({ detail, locale }: { detail: MobileStaffMemberDetail; locale: string }) {
  const { copy, fontSet, isRTL, theme } = usePreferences();
  const [rangeId, setRangeId] = useState<(typeof PROGRESS_RANGES)[number]["id"]>("30d");
  const selectedRange = PROGRESS_RANGES.find((item) => item.id === rangeId) ?? PROGRESS_RANGES[1];
  const selectedRangeLabel = copy.progress[selectedRange.labelKey];
  const allBiometrics = [...detail.biometrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const allSessions = [...detail.recent_workout_sessions].sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());
  const rangeStart = useMemo(() => {
    if (selectedRange.days == null) {
      return null;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - selectedRange.days + 1);
    return start;
  }, [selectedRange.days]);
  const filteredBiometrics = useMemo(
    () => (rangeStart ? allBiometrics.filter((entry) => new Date(entry.date) >= rangeStart) : allBiometrics),
    [allBiometrics, rangeStart],
  );
  const filteredSessions = useMemo(
    () => (rangeStart ? allSessions.filter((session) => new Date(session.performed_at) >= rangeStart) : allSessions),
    [allSessions, rangeStart],
  );
  const latest = detail.latest_biometric ?? filteredBiometrics.at(-1) ?? null;
  const age = calculateAge(detail.member.date_of_birth);
  const workoutTrend = buildSessionCountTrend(filteredSessions, locale);
  const sessionLoadTrend = buildSessionVolumeTrend(filteredSessions, locale);

  return (
    <Card style={styles.progressCard}>
      <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <SectionTitle>{copy.progress.title}</SectionTitle>
        <StatusPill label={detail.subscription.plan_name || localizeSubscriptionStatus(detail.subscription.status, isRTL)} />
      </View>
      <MutedText>{copy.progress.subtitle}</MutedText>

      <View style={[styles.rangeCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <MutedText>{copy.progress.selectedRangeSummary}</MutedText>
          <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 12, fontWeight: "800" }}>{selectedRangeLabel}</Text>
        </View>
        <View style={[styles.rangeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {PROGRESS_RANGES.map((range) => {
            const active = range.id === rangeId;
            const label = copy.progress[range.labelKey];
            return (
              <Pressable
                key={range.id}
                onPress={() => setRangeId(range.id)}
                style={[
                  styles.rangeChip,
                  {
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primarySoft : theme.background,
                  },
                ]}
              >
                <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.mono, fontSize: 11, fontWeight: "900" }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.metricGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <MiniMetric label={copy.progress.age} value={age ?? "--"} />
        <MiniMetric label={copy.progress.lastHeight} value={latest?.height_cm != null ? `${latest.height_cm} cm` : "--"} />
        <MiniMetric label={copy.progress.lastWeight} value={latest?.weight_kg != null ? `${latest.weight_kg} kg` : "--"} />
        <MiniMetric label={copy.progress.lastBodyFat} value={latest?.body_fat_pct != null ? `${latest.body_fat_pct}%` : "--"} />
      </View>
      <View style={[styles.metricGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <MiniMetric label={copy.progress.workoutsInRange} value={filteredSessions.length} />
        <MiniMetric label={copy.membersScreen.biometrics} value={filteredBiometrics.length} />
      </View>

      <SparklineChart
        title={copy.progress.weightTrend}
        points={filteredBiometrics.map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.weight_kg }))}
        unit=" kg"
        emptyMessage={copy.progress.graphNoData}
      />
      <SparklineChart
        title={copy.progress.bodyFatTrend}
        points={filteredBiometrics.map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.body_fat_pct }))}
        unit="%"
        emptyMessage={copy.progress.graphNoData}
      />
      <SparklineChart
        title={copy.progress.muscleTrend}
        points={filteredBiometrics.map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.muscle_mass_kg }))}
        unit=" kg"
        emptyMessage={copy.progress.graphNoData}
      />
      <CountBarChart title={copy.progress.workoutTrend} points={workoutTrend} unit="" emptyMessage={copy.progress.noTrend} />
      <CountBarChart title={copy.progress.sessionLoad} points={sessionLoadTrend} unit=" kg" emptyMessage={copy.progress.noSessionVolume} />
    </Card>
  );
}

function ChartSummary({
  title,
  latest,
  min,
  max,
  delta,
  unit,
  singlePoint = false,
}: {
  title: string;
  latest: number;
  min: number;
  max: number;
  delta?: number | null;
  unit: string;
  singlePoint?: boolean;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const formattedLatest = `${formatChartNumber(latest)}${unit}`;
  const formattedDelta = typeof delta === "number" ? (delta === 0 ? copy.progress.noChange : `${delta > 0 ? "+" : ""}${formatChartNumber(delta)}${unit}`) : "--";
  const isFlatSeries = min === max;
  return (
    <>
      <View style={[styles.chartHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{title}</Text>
        <Text style={[styles.chartLatest, { color: theme.primary, fontFamily: fontSet.mono }]}>{formattedLatest}</Text>
      </View>
      {!singlePoint ? (
        <View style={[styles.chartMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <MutedText>{isFlatSeries ? `${copy.progress.steadyAt}: ${formattedLatest}` : `${copy.progress.range}: ${formatChartNumber(min)}${unit} - ${formatChartNumber(max)}${unit}`}</MutedText>
          <Text style={[styles.chartDelta, { color: delta === 0 ? theme.muted : theme.primary, fontFamily: fontSet.mono }]}>
            {copy.progress.change}: {formattedDelta}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function SparklineChart({
  title,
  points,
  unit,
  emptyMessage,
}: {
  title: string;
  points: { label: string; value?: number | null }[];
  unit: string;
  emptyMessage: string;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const visiblePoints = points.filter((point): point is { label: string; value: number } => typeof point.value === "number");
  if (visiblePoints.length === 0) {
    return <MutedText>{emptyMessage}</MutedText>;
  }
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const range = rawRange || 1;
  const singlePoint = visiblePoints.length === 1;
  const latest = visiblePoints[visiblePoints.length - 1];
  const delta = visiblePoints.length > 1 ? latest.value - visiblePoints[0].value : null;
  const chartHeight = 118;
  const paddingX = 12;
  const paddingY = 14;
  const usableWidth = Math.max(chartWidth - paddingX * 2, 1);
  const usableHeight = chartHeight - paddingY * 2;
  const selectedPoint = selectedIndex == null ? null : visiblePoints[Math.min(selectedIndex, visiblePoints.length - 1)] ?? null;
  const coordinates = visiblePoints.map((point, index) => {
    const x = paddingX + (visiblePoints.length === 1 ? usableWidth / 2 : (index / (visiblePoints.length - 1)) * usableWidth);
    const y = paddingY + (1 - (rawRange === 0 ? 0.5 : (point.value - min) / range)) * usableHeight;
    return { ...point, x, y };
  });

  return (
    <View style={[styles.chartBlock, { borderTopColor: theme.border }]}>
      <ChartSummary title={title} latest={latest.value} min={min} max={max} delta={delta} unit={unit} singlePoint={singlePoint} />
      <View onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)} style={[styles.sparklineFrame, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <View style={[styles.sparklineGuide, { top: chartHeight / 2, backgroundColor: theme.border }]} />
        {chartWidth > 0
          ? coordinates.slice(0, -1).map((point, index) => {
              const next = coordinates[index + 1];
              const dx = next.x - point.x;
              const dy = next.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = `${Math.atan2(dy, dx)}rad`;
              return (
                <View
                  key={`segment-${index}`}
                  style={[
                    styles.sparklineSegment,
                    {
                      width: length,
                      left: point.x,
                      top: point.y,
                      backgroundColor: theme.primary,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            })
          : null}
        {chartWidth > 0
          ? coordinates.map((point, index) => (
              <Pressable
                key={`dot-${index}`}
                onPress={() => setSelectedIndex((current) => (current === index ? null : index))}
                hitSlop={10}
                style={[
                  styles.sparklineDot,
                  {
                    left: point.x - 4,
                    top: point.y - 4,
                    backgroundColor: index === selectedIndex ? theme.primary : theme.background,
                    borderColor: theme.primary,
                  },
                ]}
              />
            ))
          : null}
      </View>
      {!singlePoint ? (
        <View style={[styles.chartEdgeLabels, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {visiblePoints[0].label}
          </Text>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {latest.label}
          </Text>
        </View>
      ) : null}
      <View style={[styles.chartInspector, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        {selectedPoint ? (
          <>
            <View style={[styles.inspectorHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>{copy.progress.selectedPoint}</MutedText>
              <Pressable onPress={() => setSelectedIndex(null)} hitSlop={8}>
                <Text style={[styles.inspectorClear, { color: theme.primary, fontFamily: fontSet.body }]}>{copy.progress.clearPoint}</Text>
              </Pressable>
            </View>
            <Text style={[styles.inspectorLabel, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {selectedPoint.label}
            </Text>
            <Text style={[styles.inspectorValue, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {formatChartNumber(selectedPoint.value)}{unit}
            </Text>
          </>
        ) : (
          <MutedText>{copy.progress.tapPointToInspect}</MutedText>
        )}
      </View>
    </View>
  );
}

function CountBarChart({
  title,
  points,
  unit,
  emptyMessage,
}: {
  title: string;
  points: { label: string; value?: number | null }[];
  unit: string;
  emptyMessage: string;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const visiblePoints = points.filter((point): point is { label: string; value: number } => typeof point.value === "number");
  if (visiblePoints.length === 0) {
    return <MutedText>{emptyMessage}</MutedText>;
  }
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const range = rawRange || 1;
  const singlePoint = visiblePoints.length === 1;
  const latest = visiblePoints[visiblePoints.length - 1];
  const delta = visiblePoints.length > 1 ? latest.value - visiblePoints[0].value : null;
  const chartHeight = 118;
  const paddingX = 12;
  const paddingY = 14;
  const usableWidth = Math.max(chartWidth - paddingX * 2, 1);
  const usableHeight = chartHeight - paddingY * 2;
  const selectedPoint = selectedIndex == null ? null : visiblePoints[Math.min(selectedIndex, visiblePoints.length - 1)] ?? null;
  const previousPoint = selectedIndex != null && selectedIndex > 0 ? visiblePoints[selectedIndex - 1] : null;
  const selectedDelta = selectedPoint && previousPoint ? selectedPoint.value - previousPoint.value : null;
  const coordinates = visiblePoints.map((point, index) => {
    const x = paddingX + (visiblePoints.length === 1 ? usableWidth / 2 : (index / (visiblePoints.length - 1)) * usableWidth);
    const y = paddingY + (1 - (rawRange === 0 ? 0.5 : (point.value - min) / range)) * usableHeight;
    return { ...point, x, y };
  });

  return (
    <View style={[styles.chartBlock, { borderTopColor: theme.border }]}>
      <ChartSummary title={title} latest={latest.value} min={min} max={max} delta={delta} unit={unit} singlePoint={singlePoint} />
      <View
        onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
        style={[styles.sparklineFrame, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}
      >
        <View style={[styles.sparklineGuide, { top: chartHeight / 2, backgroundColor: theme.border }]} />
        {chartWidth > 0
          ? coordinates.slice(0, -1).map((point, index) => {
              const next = coordinates[index + 1];
              const dx = next.x - point.x;
              const dy = next.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = `${Math.atan2(dy, dx)}rad`;
              return (
                <View
                  key={`segment-${index}`}
                  style={[
                    styles.sparklineSegment,
                    {
                      width: length,
                      left: point.x,
                      top: point.y,
                      backgroundColor: theme.primary,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            })
          : null}
        {chartWidth > 0
          ? coordinates.map((point, index) => (
              <Pressable
                key={`dot-${index}`}
                onPress={() => setSelectedIndex((current) => (current === index ? null : index))}
                hitSlop={10}
                style={[
                  styles.sparklineDot,
                  {
                    left: point.x - 4,
                    top: point.y - 4,
                    backgroundColor: index === selectedIndex ? theme.primary : theme.background,
                    borderColor: theme.primary,
                  },
                ]}
              />
            ))
          : null}
      </View>
      {!singlePoint ? (
        <View style={[styles.chartEdgeLabels, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {visiblePoints[0].label}
          </Text>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {latest.label}
          </Text>
        </View>
      ) : null}
      <View style={[styles.chartInspector, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        {selectedPoint ? (
          <>
            <View style={[styles.inspectorHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>{copy.progress.selectedPoint}</MutedText>
              <Pressable onPress={() => setSelectedIndex(null)} hitSlop={8}>
                <Text style={[styles.inspectorClear, { color: theme.primary, fontFamily: fontSet.body }]}>{copy.progress.clearPoint}</Text>
              </Pressable>
            </View>
            <Text style={[styles.inspectorLabel, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {selectedPoint.label}
            </Text>
            <Text style={[styles.inspectorValue, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {formatChartNumber(selectedPoint.value)}{unit}
            </Text>
            {previousPoint ? (
              <>
                <MutedText>{`${copy.progress.previousPoint}: ${previousPoint.label} · ${formatChartNumber(previousPoint.value)}${unit}`}</MutedText>
                <MutedText>{`${copy.progress.change}: ${selectedDelta === 0 ? copy.progress.noChange : `${selectedDelta && selectedDelta > 0 ? "+" : ""}${formatChartNumber(selectedDelta ?? 0)}${unit}`}`}</MutedText>
              </>
            ) : null}
          </>
        ) : (
          <MutedText>{copy.progress.tapPointToInspect}</MutedText>
        )}
      </View>
    </View>
  );
}

function buildSessionCountTrend(sessions: MobileStaffMemberDetail["recent_workout_sessions"], locale: string) {
  const byDate = new Map<string, number>();
  for (const session of sessions) {
    const key = session.performed_at.slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([date, value]) => ({ label: new Date(date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value }));
}

function buildSessionVolumeTrend(sessions: MobileStaffMemberDetail["recent_workout_sessions"], locale: string) {
  const byDate = new Map<string, number>();
  for (const session of sessions) {
    const key = session.performed_at.slice(0, 10);
    const value = typeof session.session_volume === "number" && Number.isFinite(session.session_volume) ? session.session_volume : 0;
    byDate.set(key, (byDate.get(key) ?? 0) + value);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([date, value]) => ({ label: new Date(date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value }));
}

function calculateAge(dateOfBirth?: string | null) {
  if (!dateOfBirth) {
    return null;
  }
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function formatChartNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSubscriptionSummary(
  subscription: { status?: string | null; end_date?: string | null; plan_name?: string | null } | null,
  locale: string,
  isRTL: boolean,
  copy: ReturnType<typeof usePreferences>["copy"],
) {
  const status = localizeSubscriptionStatus(subscription?.status ?? undefined, isRTL);
  const plan = subscription?.plan_name || copy.common.noCurrentPlan;
  const endDate = subscription?.end_date ? new Date(subscription.end_date) : null;
  const validEndDate = endDate && !Number.isNaN(endDate.getTime()) ? endDate.toLocaleDateString(locale) : null;
  if (!validEndDate) {
    return isRTL ? `${plan} · ${status}` : `${plan} · ${status}`;
  }
  return `${plan} · ${status} · ${copy.common.ends} ${validEndDate}`;
}

function feedbackCategoryLabel(category: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  const normalized = category.toUpperCase();
  if (normalized === "WORKOUT" || normalized === "GYM" || normalized === "SERVICE") {
    return copy.feedbackScreen.gym;
  }
  if (normalized === "EQUIPMENT") {
    return copy.feedbackScreen.equipment;
  }
  if (normalized === "CLEANLINESS") {
    return copy.feedbackScreen.cleanliness;
  }
  if (normalized === "STAFF") {
    return copy.feedbackScreen.staff;
  }
  if (normalized === "CLASSES") {
    return copy.feedbackScreen.classes;
  }
  if (normalized === "GENERAL") {
    return copy.feedbackScreen.general;
  }
  return category;
}

function OverflowToggle({ total, expanded, onPress, previewLimit = SECTION_PREVIEW_LIMIT }: { total: number; expanded: boolean; onPress: () => void; previewLimit?: number }) {
  const { copy, fontSet, theme } = usePreferences();
  const hiddenCount = total - previewLimit;
  if (hiddenCount <= 0) {
    return null;
  }
  return (
    <Pressable onPress={onPress} style={[styles.overflowHint, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 12, fontWeight: "700" }}>
        {expanded ? copy.membersScreen.showLess : `+${hiddenCount} ${copy.membersScreen.showMore}`}
      </Text>
    </Pressable>
  );
}

function InlineNotice({ notice }: { notice: Notice }) {
  const { fontSet, theme } = usePreferences();
  const isError = notice.kind === "error";
  const color = isError ? "#B42318" : theme.primary;
  return (
    <View style={{ borderWidth: 1, borderColor: color, backgroundColor: isError ? "#FEF3F2" : theme.primarySoft, borderRadius: 14, padding: 10, marginTop: 12 }}>
      <Text style={{ color, fontFamily: fontSet.body, fontWeight: "700" }}>{notice.message}</Text>
    </View>
  );
}

function SimpleRow({ title, subtitle, note }: { title: string; subtitle: string; note?: string | null }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.row, { borderTopColor: theme.border }]}>
      <View style={styles.rowText}>
        <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>{title}</Text>
        <MutedText>{subtitle}</MutedText>
        {note ? <MutedText>{note}</MutedText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  adminSummaryCard: {
    gap: 12,
    borderRadius: 24,
  },
  adminStatGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  roleList: {
    gap: 2,
  },
  searchCard: {
    borderRadius: 24,
    gap: 12,
  },
  sectionHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroCard: {
    gap: 14,
    borderRadius: 28,
  },
  progressCard: {
    gap: 14,
    borderRadius: 28,
  },
  rangeCard: {
    borderWidth: 1,
    borderRadius: 20,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  heroHeader: {
    alignItems: "center",
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCompact: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  memberCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    gap: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  memberCardText: {
    flex: 1,
    gap: 3,
  },
  selectedMemberTrigger: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  selectedMemberText: {
    flex: 1,
    gap: 3,
  },
  memberDropdown: {
    gap: 8,
    borderRadius: 22,
    marginTop: -4,
  },
  dropdownCloseText: {
    fontSize: 12,
    fontWeight: "800",
  },
  metricGrid: {
    gap: 8,
    flexWrap: "wrap",
  },
  rangeRow: {
    flexWrap: "wrap",
    gap: 8,
  },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  miniMetric: {
    width: "48%",
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "space-between",
    gap: 8,
  },
  miniMetricValue: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 20,
    width: "100%",
  },
  miniMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    width: "100%",
  },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dataCard: {
    gap: 2,
  },
  assignmentCard: {
    gap: 10,
  },
  assignmentTrigger: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  assignmentDropdown: {
    gap: 8,
  },
  actionPill: {
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  chartBlock: {
    borderTopWidth: 1,
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
  },
  chartHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  chartLatest: {
    fontSize: 13,
    fontWeight: "800",
  },
  chartMeta: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chartDelta: {
    fontSize: 11,
    fontWeight: "800",
  },
  chartRow: {
    alignItems: "flex-end",
    gap: 8,
  },
  chartColumn: {
    flex: 1,
    minWidth: 36,
    alignItems: "center",
    gap: 5,
  },
  chartColumnSingle: {
    flex: 0,
    width: 72,
  },
  chartTrack: {
    width: "100%",
    height: 90,
    borderRadius: 999,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartTrackSingle: {
    width: 48,
  },
  chartBar: {
    width: "100%",
    borderRadius: 999,
  },
  chartLabel: {
    fontSize: 10,
    maxWidth: 58,
  },
  sparklineFrame: {
    height: 118,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  sparklineGuide: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 1,
    opacity: 0.7,
  },
  sparklineSegment: {
    position: "absolute",
    height: 3,
    borderRadius: 999,
    transformOrigin: "left center",
  },
  sparklineDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 2,
  },
  chartEdgeLabels: {
    justifyContent: "space-between",
    gap: 12,
  },
  chartInspector: {
    borderWidth: 1,
    borderRadius: 14,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inspectorHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inspectorClear: {
    fontSize: 12,
    fontWeight: "800",
  },
  inspectorLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  inspectorValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  planAssignRow: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  overflowHint: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  row: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  rowText: {
    gap: 4,
  },
  searchHeader: {
    alignItems: "center",
    gap: 10,
  },
  actionWrap: {
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
});
