import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SecondaryButton, SectionTitle } from "@/components/ui";
import { parseStaffMemberDetailEnvelope } from "@/lib/api";
import { localeTag, localizeAccessStatus, localizeSubscriptionStatus } from "@/lib/mobile-format";
import { getCurrentRole, hasCapability } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

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

function visibleItems<T>(items: T[], expanded?: boolean) {
  return expanded ? items : items.slice(0, SECTION_PREVIEW_LIMIT);
}

export default function MembersTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, isRTL } = usePreferences();
  const locale = localeTag(isRTL);
  const role = getCurrentRole(bootstrap);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const canChat = hasCapability(bootstrap, "view_chat");
  const canCheckIn = hasCapability(bootstrap, "scan_member_qr") || hasCapability(bootstrap, "lookup_members");
  const canSupport = hasCapability(bootstrap, "view_support");
  const canAssignWorkout = hasCapability(bootstrap, "manage_member_plans");
  const canAssignDiet = hasCapability(bootstrap, "manage_member_diets");
  const canRegister = role === "ADMIN" || role === "MANAGER" || role === "RECEPTION" || role === "FRONT_DESK";

  const membersQuery = useQuery({
    queryKey: ["mobile-staff-members", search],
    queryFn: async () =>
      (await authorizedRequest<StaffMemberSummary[]>(`/mobile/staff/members${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`)).data,
  });
  const members = membersQuery.data ?? [];

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
    queryKey: ["mobile-staff-member-detail", selectedMemberId],
    enabled: Boolean(selectedMemberId),
    queryFn: async () => parseStaffMemberDetailEnvelope(await authorizedRequest(`/mobile/staff/members/${selectedMemberId}`)).data,
  });

  const selectedMember = detailQuery.data?.member
    ? { id: detailQuery.data.member.id, email: detailQuery.data.member.email, full_name: detailQuery.data.member.full_name }
    : selectedMemberFromList;

  const workoutPlansQuery = useQuery({
    queryKey: ["mobile-coach-plan-summaries", role],
    enabled: canAssignWorkout,
    queryFn: async () =>
      (await authorizedRequest<PlanSummary[]>(role === "COACH" ? "/fitness/plan-summaries" : "/fitness/plan-summaries?include_all_creators=true&templates_only=true")).data,
  });

  const dietPlansQuery = useQuery({
    queryKey: ["mobile-coach-diet-summaries", role],
    enabled: canAssignDiet,
    queryFn: async () =>
      (await authorizedRequest<PlanSummary[]>(role === "COACH" ? "/fitness/diet-summaries" : "/fitness/diet-summaries?include_all_creators=true&templates_only=true")).data,
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
    router.push({ pathname: "/support", params: { type: "support", memberId: selectedMemberId } });
  };

  return (
    <Screen title={copy.membersScreen.title} subtitle={copy.membersScreen.subtitle} showSubtitle={role === "COACH"}>
      <Card style={styles.searchCard}>
        <View style={[styles.searchHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={{ flex: 1 }}>
            <Input value={search} onChangeText={setSearch} placeholder={copy.membersScreen.search} />
          </View>
          {canRegister ? (
            <SecondaryButton onPress={() => router.push("/member-register")}>{copy.membersScreen.quickRegister}</SecondaryButton>
          ) : null}
        </View>
      </Card>

      <QueryState
        loading={membersQuery.isLoading}
        error={membersQuery.error instanceof Error ? membersQuery.error.message : null}
        empty={!membersQuery.isLoading && members.length === 0 && !selectedMemberId}
        emptyMessage={copy.membersScreen.noMembers}
      />

      {members.length > 0 ? (
        <Card>
          <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <SectionTitle>{copy.staffTabs.members}</SectionTitle>
            <StatusPill label={String(members.length)} />
          </View>
          {members.length >= 50 ? <MutedText>{copy.membersScreen.searchMoreHint}</MutedText> : null}
          {members.map((member) => {
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
                }}
              />
            );
          })}
        </Card>
      ) : null}

      <QueryState loading={detailQuery.isLoading} error={detailQuery.error instanceof Error ? detailQuery.error.message : null} />
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

          <DataCard title={copy.membersScreen.workoutPlans}>
            {detailQuery.data.active_workout_plans.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.active_workout_plans, expandedSections.workouts).map((plan) => (
                <SimpleRow key={plan.id} title={plan.name} subtitle={plan.status} />
              ))
            )}
            <OverflowToggle total={detailQuery.data.active_workout_plans.length} expanded={!!expandedSections.workouts} onPress={() => setExpandedSections((current) => ({ ...current, workouts: !current.workouts }))} />
          </DataCard>

          <DataCard title={copy.membersScreen.dietPlans}>
            {detailQuery.data.active_diet_plans.length === 0 ? (
              <MutedText>{copy.common.noData}</MutedText>
            ) : (
              visibleItems(detailQuery.data.active_diet_plans, expandedSections.diets).map((plan) => (
                <SimpleRow key={plan.id} title={plan.name} subtitle={plan.status} />
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
                  subtitle={`${new Date(session.performed_at).toLocaleString(locale)} • ${session.duration_minutes ?? 0} ${copy.common.minutesShort}`}
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
                      title={item.category}
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
              plans={workoutPlansQuery.data ?? []}
              loading={workoutPlansQuery.isLoading}
              error={workoutPlansQuery.error instanceof Error ? workoutPlansQuery.error.message : null}
              emptyMessage={copy.membersScreen.noAssignablePlans}
              pending={assignWorkoutMutation.isPending}
              onAssign={(planId) => assignWorkoutMutation.mutate(planId)}
            />
          ) : null}

          {canAssignDiet ? (
            <AssignmentCard
              title={copy.membersScreen.assignDiet}
              hint={copy.membersScreen.pickDiet}
              plans={dietPlansQuery.data ?? []}
              loading={dietPlansQuery.isLoading}
              error={dietPlansQuery.error instanceof Error ? dietPlansQuery.error.message : null}
              emptyMessage={copy.membersScreen.noAssignableDiets}
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
  plans,
  loading,
  error,
  emptyMessage,
  pending,
  onAssign,
}: {
  title: string;
  hint: string;
  plans: PlanSummary[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  pending: boolean;
  onAssign: (planId: string) => void;
}) {
  return (
    <Card style={styles.assignmentCard}>
      <SectionTitle>{title}</SectionTitle>
      <MutedText>{hint}</MutedText>
      <QueryState loading={loading} error={error} empty={!loading && plans.length === 0} emptyMessage={emptyMessage} />
      {plans.map((plan) => (
        <PlanAssignRow key={plan.id} plan={plan} disabled={pending} onPress={() => onAssign(plan.id)} />
      ))}
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
  const { fontSet, theme } = usePreferences();
  return (
    <View style={[styles.miniMetric, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={{ color: theme.foreground, fontFamily: fontSet.display, fontSize: 20, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 11 }} numberOfLines={1}>
        {label}
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
        <MutedText>{plan.status}</MutedText>
      </View>
      <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
    </Pressable>
  );
}

function OverflowToggle({ total, expanded, onPress }: { total: number; expanded: boolean; onPress: () => void }) {
  const { copy, fontSet, theme } = usePreferences();
  const hiddenCount = total - SECTION_PREVIEW_LIMIT;
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
  searchCard: {
    borderRadius: 24,
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
  metricGrid: {
    gap: 8,
  },
  miniMetric: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
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
  actionPill: {
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
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
