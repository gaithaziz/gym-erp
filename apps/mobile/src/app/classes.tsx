import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SecondaryButton, SkeletonBlock } from "@/components/ui";
import {
  parseClassSessionsEnvelope,
  parseMyReservationsEnvelope,
  parseUpcomingClassesEnvelope,
  type ClassReservation,
  type ClassSession,
} from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { canManageClasses, getCurrentRole, isCoachRole, isCustomerRole } from "@/lib/mobile-role";
import { useSession } from "@/lib/session";

type StaffUser = {
  id: string;
  full_name: string;
  role: string;
};

type PendingReservation = {
  id: string;
  session_id: string;
  member_id: string;
  member_name: string | null;
  status: string;
  attended: boolean;
  reserved_at: string;
  cancelled_at: string | null;
  session_name: string;
  starts_at: string;
  coach_name: string | null;
};

type SessionReservation = {
  id: string;
  session_id: string;
  member_id: string;
  member_name: string | null;
  status: string;
  attended: boolean;
  reserved_at: string;
  cancelled_at: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function createDefaultSessionStart() {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(18, 0, 0, 0);
  return startsAt;
}

function mergeDateParts(base: Date, datePart: Date) {
  const next = new Date(base);
  next.setFullYear(datePart.getFullYear(), datePart.getMonth(), datePart.getDate());
  return next;
}

function mergeTimeParts(base: Date, timePart: Date) {
  const next = new Date(base);
  next.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return next;
}

function formatPickerDate(value: Date, locale: string) {
  return value.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatPickerTime(value: Date, locale: string) {
  return value.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function spotsLeft(session: ClassSession) {
  return Math.max(0, session.capacity - session.reserved_count);
}

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

function localizeReservationStatus(status: string, copy: ReturnType<typeof usePreferences>["copy"]["classesScreen"]) {
  if (status === "RESERVED") return copy.confirmed;
  if (status === "PENDING") return copy.pending;
  if (status === "WAITLISTED") return copy.waitlisted;
  return status;
}

function statusColor(status: string, primary: string, muted: string, warning: string) {
  if (status === "RESERVED") return primary;
  if (status === "PENDING") return warning;
  if (status === "WAITLISTED") return muted;
  return muted;
}

function sessionStatusBadge(
  session: ClassSession,
  myStatus: string | null,
  copy: ReturnType<typeof usePreferences>["copy"]["classesScreen"]
) {
  if (myStatus === "RESERVED") return `✓ ${copy.confirmed}`;
  if (myStatus === "PENDING") return `⏳ ${copy.pending}`;
  if (myStatus === "WAITLISTED") return copy.waitlisted;
  if (session.reserved_count >= session.capacity) return copy.full;
  const remaining = spotsLeft(session);
  return remaining === 1
    ? fillTemplate(copy.spotsLeft, { count: remaining })
    : fillTemplate(copy.spotsLeftPlural, { count: remaining });
}

function localizeSessionStatus(status: ClassSession["status"], copy: ReturnType<typeof usePreferences>["copy"]["coachClasses"]) {
  if (status === "SCHEDULED") return copy.scheduled;
  if (status === "CANCELLED") return copy.cancelled;
  if (status === "COMPLETED") return copy.completed;
  return status;
}

function localizeCoachReservationStatus(status: string, copy: ReturnType<typeof usePreferences>["copy"]["coachClasses"]) {
  if (status === "RESERVED") return copy.reserved;
  if (status === "PENDING") return copy.pending;
  if (status === "WAITLISTED") return copy.waitlist;
  return status;
}

function isActiveEnrollment(status: string) {
  return status === "RESERVED" || status === "PENDING" || status === "WAITLISTED";
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ClassesScreen() {
  const { bootstrap } = useSession();
  const { copy } = usePreferences();
  const role = getCurrentRole(bootstrap);

  if (isCustomerRole(role)) {
    return <CustomerClassesScreen />;
  }

  if (canManageClasses(role)) {
    return <StaffClassesScreen />;
  }

  return (
    <Screen title={copy.classesScreen.title} subtitle={copy.classesScreen.subtitle}>
      <Card>
        <MutedText>{copy.common.noData}</MutedText>
      </Card>
    </Screen>
  );
}

function CustomerClassesScreen() {
  const { authorizedRequest } = useSession();
  const { copy, fontSet, isRTL, theme } = usePreferences();
  const classesCopy = copy.classesScreen;
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView | null>(null);
  const locale = isRTL ? "ar" : "en";

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  const upcomingQuery = useQuery({
    queryKey: ["classes-upcoming"],
    queryFn: async () => parseUpcomingClassesEnvelope(await authorizedRequest("/classes/public/upcoming?days=14")).data,
  });

  const myReservationsQuery = useQuery({
    queryKey: ["my-reservations"],
    queryFn: async () => parseMyReservationsEnvelope(await authorizedRequest("/classes/my-reservations")).data,
  });

  const reserveMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      authorizedRequest(`/classes/sessions/${sessionId}/reserve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
      Alert.alert(classesCopy.requestSentTitle, classesCopy.requestSentMessage);
    },
    onError: (err: Error) => Alert.alert(classesCopy.errorTitle, err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      authorizedRequest(`/classes/sessions/${sessionId}/reserve`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    },
    onError: (err: Error) => Alert.alert(classesCopy.errorTitle, err.message),
  });

  // Build a map of sessionId → my reservation status for quick lookup
  const myReservationMap = new Map<string, ClassReservation>(
    (myReservationsQuery.data ?? []).map((r) => [r.session.id, r])
  );

  const [tab, setTab] = useState<"upcoming" | "mine">("upcoming");

  function handleReserve(session: ClassSession) {
    const myRes = myReservationMap.get(session.id);
    if (myRes) {
      Alert.alert(
        classesCopy.cancelReservationTitle,
        fillTemplate(classesCopy.cancelReservationMessage, {
          status: localizeReservationStatus(myRes.status, classesCopy).toLowerCase(),
          name: session.display_name,
        }),
        [
          { text: classesCopy.keep, style: "cancel" },
          { text: classesCopy.cancelReservationAction, style: "destructive", onPress: () => cancelMutation.mutate(session.id) },
        ]
      );
    } else {
      Alert.alert(
        classesCopy.requestSpotTitle,
        fillTemplate(classesCopy.requestSpotMessage, {
          name: session.display_name,
          date: formatDate(session.starts_at, locale),
        }),
        [
          { text: classesCopy.cancel, style: "cancel" },
          { text: classesCopy.request, onPress: () => reserveMutation.mutate(session.id) },
        ]
      );
    }
  }

  return (
    <Screen title={classesCopy.title} subtitle={classesCopy.subtitle} scrollable scrollRef={scrollRef}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => setTab("upcoming")}
          style={[styles.tab, tab === "upcoming" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: tab === "upcoming" ? theme.primary : theme.muted, fontFamily: fontSet.body }]}>
            {classesCopy.upcoming}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("mine")}
          style={[styles.tab, tab === "mine" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: tab === "mine" ? theme.primary : theme.muted, fontFamily: fontSet.body }]}>
            {classesCopy.myBookings}{myReservationsQuery.data?.length ? ` (${myReservationsQuery.data.length})` : ""}
          </Text>
        </Pressable>
      </View>

      <QueryState
        loading={tab === "upcoming" ? upcomingQuery.isLoading : myReservationsQuery.isLoading}
        loadingVariant="list"
        error={
          tab === "upcoming"
            ? upcomingQuery.error instanceof Error ? upcomingQuery.error.message : null
            : myReservationsQuery.error instanceof Error ? myReservationsQuery.error.message : null
        }
      />

      {tab === "upcoming" ? (
        <SessionList
          sessions={upcomingQuery.data ?? []}
          myReservationMap={myReservationMap}
          onPress={handleReserve}
          locale={locale}
          theme={theme}
          fontSet={fontSet}
          isRTL={isRTL}
          loading={reserveMutation.isPending || cancelMutation.isPending}
          copy={classesCopy}
        />
      ) : (
        <MyBookingsList
          reservations={myReservationsQuery.data ?? []}
          onCancel={(sessionId) => cancelMutation.mutate(sessionId)}
          locale={locale}
          theme={theme}
          fontSet={fontSet}
          isRTL={isRTL}
          loading={cancelMutation.isPending}
          copy={classesCopy}
        />
      )}
    </Screen>
  );
}

function StaffClassesScreen() {
  const { authorizedRequest, bootstrap, selectedBranchId } = useSession();
  const { copy, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const role = getCurrentRole(bootstrap);
  const isCoach = isCoachRole(role);
  const canAssignCoach = !isCoachRole(role);
  const classesCopy = copy.coachClasses;
  const locale = isRTL ? "ar" : "en";
  const scrollRef = useRef<ScrollView | null>(null);
  const [coaches, setCoaches] = useState<StaffUser[]>([]);
  const [coachPickerOpen, setCoachPickerOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["staff-class-sessions", role, selectedBranchId ?? "all"],
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseClassSessionsEnvelope(await authorizedRequest(`/classes/sessions${suffix}`)).data;
    },
  });

  const pendingReservationsQuery = useQuery({
    queryKey: ["staff-class-pending-reservations", role, sessionsQuery.data?.map((session) => session.id).join("|") ?? "none"],
    enabled: Boolean(sessionsQuery.data?.length),
    queryFn: async () => {
      const sessions = sessionsQuery.data ?? [];
      const rows = await Promise.all(
        sessions.map(async (session) => {
          const response = await authorizedRequest<PendingReservation[]>(`/classes/sessions/${session.id}/reservations?status=PENDING`);
          return response.data.map((reservation) => ({
            ...reservation,
            session_name: session.display_name,
            starts_at: session.starts_at,
            coach_name: session.coach_name,
          }));
        }),
      );
      return rows.flat();
    },
  });

  const sessionReservationsQuery = useQuery({
    queryKey: ["staff-class-attendees", selectedSession?.id ?? "none"],
    enabled: Boolean(selectedSession?.id),
    queryFn: async () => {
      const response = await authorizedRequest<SessionReservation[]>(`/classes/sessions/${selectedSession?.id}/reservations`);
      return response.data.filter((reservation) => isActiveEnrollment(reservation.status));
    },
  });

  const [sessionForm, setSessionForm] = useState({
    session_name: "",
    duration_minutes: "60",
    capacity: "20",
    coach_id: "",
    recur_weekly_count: "0",
  });
  const [sessionStart, setSessionStart] = useState(() => createDefaultSessionStart());
  const [activePicker, setActivePicker] = useState<"date" | "time" | null>(null);
  const [pickerDraft, setPickerDraft] = useState(() => createDefaultSessionStart());

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff-class-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["staff-class-sessions", role] }),
      queryClient.invalidateQueries({ queryKey: ["staff-class-pending-reservations"] }),
    ]);
  };

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    const currentSessions = sessionsQuery.data ?? [];
    if (!currentSessions.some((session) => session.id === selectedSession.id)) {
      setSelectedSession(null);
    }
  }, [selectedSession, sessionsQuery.data]);

  useEffect(() => {
    let cancelled = false;

    const loadCoaches = async () => {
      if (!canAssignCoach) {
        if (bootstrap?.user.id) {
          setSessionForm((current) => (current.coach_id ? current : { ...current, coach_id: bootstrap.user.id }));
        }
        return;
      }

      try {
        const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
        const response = await authorizedRequest(`/hr/staff${suffix}`);
        const payload = response.data as { data?: StaffUser[] } | StaffUser[] | undefined;
        const staff = Array.isArray(payload) ? payload : payload?.data ?? [];
        if (!cancelled) {
          setCoaches(staff.filter((candidate) => ["ADMIN", "MANAGER", "COACH"].includes(candidate.role)));
          if (bootstrap?.user.id) {
            setSessionForm((current) => (current.coach_id ? current : { ...current, coach_id: bootstrap.user.id }));
          }
        }
      } catch (error) {
        console.error("Failed to load staff directory", error);
      }
    };

    void loadCoaches();

    return () => {
      cancelled = true;
    };
  }, [authorizedRequest, bootstrap?.user.id, canAssignCoach, selectedBranchId]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionForm.session_name.trim()) {
        throw new Error(classesCopy.classNameRequired);
      }

      const durationMinutes = Number(sessionForm.duration_minutes || 0);
      const capacity = Number(sessionForm.capacity || 0);
      if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
        throw new Error(classesCopy.invalidDuration);
      }

      if (!Number.isFinite(capacity) || capacity < 1) {
        throw new Error(classesCopy.invalidCapacity);
      }

      if (Number.isNaN(sessionStart.getTime())) {
        throw new Error(classesCopy.invalidDateTime);
      }

      return authorizedRequest("/classes/sessions", {
        method: "POST",
        body: JSON.stringify({
          template_name: sessionForm.session_name.trim(),
          template_duration_minutes: durationMinutes,
          template_capacity: capacity,
          session_name: sessionForm.session_name.trim() || null,
          coach_id: sessionForm.coach_id || bootstrap?.user.id || "",
          starts_at: sessionStart.toISOString(),
          recur_weekly_count: Number(sessionForm.recur_weekly_count || 0) > 0 ? Number(sessionForm.recur_weekly_count) : null,
          ...(selectedBranchId ? { branch_id: selectedBranchId } : {}),
        }),
      });
    },
    onSuccess: async () => {
      setSessionForm((current) => ({
        ...current,
        session_name: "",
        duration_minutes: "60",
        capacity: "20",
        recur_weekly_count: "0",
      }));
      setSessionStart(createDefaultSessionStart());
      await refreshData();
      Alert.alert(classesCopy.title, classesCopy.sessionScheduled);
    },
    onError: (error: Error) => Alert.alert(classesCopy.title, error.message),
  });

  const reviewReservationMutation = useMutation({
    mutationFn: async ({ sessionId, reservationId, action }: { sessionId: string; reservationId: string; action: "approve" | "reject" }) =>
      authorizedRequest(`/classes/sessions/${sessionId}/reservations/${action}`, {
        method: "POST",
        body: JSON.stringify({ reservation_ids: [reservationId] }),
      }),
    onSuccess: async () => {
      await refreshData();
      Alert.alert(classesCopy.title, copy.common.successUpdated);
    },
    onError: (error: Error) => Alert.alert(classesCopy.title, error.message),
  });

  const totalReserved = (sessionsQuery.data ?? []).reduce((sum, session) => sum + session.reserved_count, 0);
  const capacity = parsePositiveInteger(sessionForm.capacity);
  const templateDuration = parsePositiveInteger(sessionForm.duration_minutes);
  const sessionEnd = templateDuration ? new Date(sessionStart.getTime() + templateDuration * 60_000) : null;
  const pendingRequestsSection = (
    <View style={{ gap: 10 }}>
      <Text style={[styles.sectionHeader, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.pendingRequests}</Text>
      {(pendingReservationsQuery.data ?? []).length === 0 ? (
        <MutedText>{classesCopy.noPendingRequests}</MutedText>
      ) : (
        (pendingReservationsQuery.data ?? []).map((reservation) => {
          const startsAt = new Date(reservation.starts_at);
          return (
            <View
              key={reservation.id}
              style={[styles.sessionCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: theme.primary }]}
            >
              <View style={[styles.sessionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.sessionInfo}>
                  <Text style={[styles.sessionName, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
                    {reservation.member_name ?? copy.common.member}
                  </Text>
                  <MutedText>
                    {reservation.session_name} · {startsAt.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                    {startsAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </MutedText>
                  {reservation.coach_name ? <MutedText>{reservation.coach_name}</MutedText> : null}
                </View>
                  <View style={styles.sessionRight}>
                    <View style={[styles.statusBadge, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
                      <Text style={[styles.statusBadgeText, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.pending}</Text>
                    </View>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                    <Pressable
                      onPress={() => reviewReservationMutation.mutate({ sessionId: reservation.session_id, reservationId: reservation.id, action: "approve" })}
                      style={[styles.smallActionButton, { backgroundColor: theme.primary }]}
                      disabled={reviewReservationMutation.isPending}
                    >
                      <Text style={[styles.smallActionText, { color: "#FFFFFF", fontFamily: fontSet.body }]}>{copy.adminControl.approve}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => reviewReservationMutation.mutate({ sessionId: reservation.session_id, reservationId: reservation.id, action: "reject" })}
                      style={[styles.smallActionButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                      disabled={reviewReservationMutation.isPending}
                    >
                      <Text style={[styles.smallActionText, { color: theme.foreground, fontFamily: fontSet.body }]}>{copy.adminControl.reject}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  const openPicker = (mode: "date" | "time") => {
    setPickerDraft(sessionStart);
    setActivePicker(mode);
  };

  return (
    <Screen title={classesCopy.title} subtitle={classesCopy.subtitle} scrollable scrollRef={scrollRef}>
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        <View style={[styles.tab, { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}>
          <Text style={[styles.tabText, { color: theme.primary, fontFamily: fontSet.body }]}>{classesCopy.label}</Text>
        </View>
      </View>

      <QueryState loading={sessionsQuery.isLoading} loadingVariant="dashboard" error={sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null} />

      <View style={{ gap: 12, paddingBottom: 32 }}>
        {!isCoach ? (
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 12 }}>
            <View style={[styles.summaryCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.summaryLabel, { color: theme.muted, fontFamily: fontSet.mono }]}>{classesCopy.label}</Text>
              <Text style={[styles.summaryValue, { color: theme.foreground, fontFamily: fontSet.display }]}>{sessionsQuery.data?.length ?? 0}</Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.summaryLabel, { color: theme.muted, fontFamily: fontSet.mono }]}>{classesCopy.upcomingCount}</Text>
              <Text style={[styles.summaryValue, { color: theme.foreground, fontFamily: fontSet.display }]}>{totalReserved}</Text>
            </View>
          </View>
        ) : null}

        {isCoach ? pendingRequestsSection : null}

        <View style={[styles.formCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.sectionHeader, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
            {isCoach ? classesCopy.scheduleClass : classesCopy.createSession}
          </Text>
          <View style={{ gap: 12 }}>
            <View style={{ gap: 10 }}>
              <Text style={[styles.formLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.className}</Text>
              <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.classNameHint}</Text>
              <Input
                value={sessionForm.session_name}
                onChangeText={(value) => setSessionForm((current) => ({ ...current, session_name: value }))}
                placeholder={classesCopy.classNamePlaceholder}
              />
            </View>
            {canAssignCoach ? (
              <View style={{ gap: 10 }}>
                <Text style={[styles.formLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.selectCoach}</Text>
                <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.coachHint}</Text>
                <Pressable
                  onPress={() => setCoachPickerOpen(true)}
                  style={[styles.pickField, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                >
                  <Text style={[styles.pickFieldLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.selectCoach}</Text>
                  <Text style={[styles.pickFieldValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>
                    {coaches.find((coach) => coach.id === sessionForm.coach_id)?.full_name ?? classesCopy.selectCoach}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View style={{ gap: 10 }}>
              <Text style={[styles.formLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.whenLabel}</Text>
              <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.whenHint}</Text>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10 }}>
                <Pressable
                  onPress={() => openPicker("date")}
                  style={[styles.pickField, { borderColor: theme.border, backgroundColor: theme.cardAlt, flex: 1 }]}
                >
                  <Text style={[styles.pickFieldLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.date}</Text>
                  <Text style={[styles.pickFieldValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{formatPickerDate(sessionStart, locale)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => openPicker("time")}
                  style={[styles.pickField, { borderColor: theme.border, backgroundColor: theme.cardAlt, flex: 1 }]}
                >
                  <Text style={[styles.pickFieldLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.time}</Text>
                  <Text style={[styles.pickFieldValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{formatPickerTime(sessionStart, locale)}</Text>
                </Pressable>
              </View>
              {templateDuration && sessionEnd ? (
                <View style={[styles.scheduleSummaryCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <View style={[styles.scheduleSummaryRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.scheduleSummaryStat}>
                      <Text style={[styles.capacityStatLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>
                        {classesCopy.durationLabel}
                      </Text>
                      <Text style={[styles.scheduleSummaryValue, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
                        {templateDuration} {copy.common.minutesShort}
                      </Text>
                    </View>
                    <View style={styles.scheduleSummaryStat}>
                      <Text style={[styles.capacityStatLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>
                        {classesCopy.endsAtLabel}
                      </Text>
                      <Text style={[styles.scheduleSummaryValue, { color: theme.primary, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
                        {formatPickerTime(sessionEnd, locale)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>
                    {classesCopy.conflictHint}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.formLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.duration}</Text>
                  <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.durationHint}</Text>
                  <Input
                    value={sessionForm.duration_minutes}
                    onChangeText={(value) => setSessionForm((current) => ({ ...current, duration_minutes: value }))}
                    placeholder={classesCopy.duration}
                    keyboardType="number-pad"
                    style={{ flex: 1 }}
                  />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.formLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.capacity}</Text>
                  <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.capacityHintSimple}</Text>
                  <Input
                    value={sessionForm.capacity}
                    onChangeText={(value) => setSessionForm((current) => ({ ...current, capacity: value }))}
                    placeholder={classesCopy.capacity}
                    keyboardType="number-pad"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.formLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.repeatWeeks}</Text>
              <Text style={[styles.helperText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.repeatWeeksHint}</Text>
              <Input
                value={sessionForm.recur_weekly_count}
                onChangeText={(value) => setSessionForm((current) => ({ ...current, recur_weekly_count: value }))}
                placeholder={classesCopy.repeatWeeks}
                keyboardType="number-pad"
              />
            </View>
            <PrimaryButton
              onPress={() => createSessionMutation.mutate()}
              disabled={createSessionMutation.isPending || !sessionForm.session_name.trim() || !sessionStart || !templateDuration || !capacity}
            >
              {createSessionMutation.isPending ? classesCopy.saving : classesCopy.saveSession}
            </PrimaryButton>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[styles.sectionHeader, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.upcomingSessions}</Text>
          {(sessionsQuery.data ?? []).length === 0 ? (
            <MutedText>{classesCopy.empty}</MutedText>
          ) : (
            (sessionsQuery.data ?? []).map((session) => (
              <View
                key={session.id}
                style={[
                  styles.sessionCard,
                  { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: theme.primary },
                ]}
              >
                <Pressable onPress={() => setSelectedSession(session)}>
                  <View style={[styles.sessionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.sessionInfo}>
                      <Text style={[styles.sessionName, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
                        {session.display_name}
                      </Text>
                      <MutedText>
                        {new Date(session.starts_at).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                        {new Date(session.starts_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </MutedText>
                      {session.session_name && session.session_name !== session.template_name ? (
                        <MutedText>{fillTemplate(classesCopy.templateReference, { name: session.template_name })}</MutedText>
                      ) : null}
                      {session.coach_name ? <MutedText>{session.coach_name}</MutedText> : null}
                    </View>
                    <View style={styles.sessionRight}>
                      <View style={[styles.statusBadge, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
                        <Text style={[styles.statusBadgeText, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{localizeSessionStatus(session.status, classesCopy)}</Text>
                      </View>
                      <MutedText>
                        {session.reserved_count} {classesCopy.reserved} · {session.pending_count} {classesCopy.pending} · {session.waitlist_count} {classesCopy.waitlist}
                      </MutedText>
                      <Text style={[styles.sessionAction, { color: theme.primary, fontFamily: fontSet.body }]}>{classesCopy.viewAttendees}</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>

      <Modal visible={activePicker !== null} transparent animationType="fade" onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setActivePicker(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.sectionHeader, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
              {activePicker === "date" ? classesCopy.pickDateTitle : classesCopy.pickTimeTitle}
            </Text>
            <View style={styles.pickerSummary}>
              <Text style={[styles.pickerSummaryLabel, { color: theme.muted, fontFamily: fontSet.mono }]}>
                {activePicker === "date" ? classesCopy.date : classesCopy.time}
              </Text>
              <Text style={[styles.pickerSummaryValue, { color: theme.foreground, fontFamily: fontSet.body }]}>
                {activePicker === "date" ? formatPickerDate(pickerDraft, locale) : formatPickerTime(pickerDraft, locale)}
              </Text>
            </View>
            {activePicker === "date" ? (
              <View style={{ gap: 10 }}>
                <StepperRow
                  label={copy.common.year}
                  value={String(pickerDraft.getFullYear())}
                  onDecrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setFullYear(next.getFullYear() - 1);
                    return next;
                  })}
                  onIncrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setFullYear(next.getFullYear() + 1);
                    return next;
                  })}
                  theme={theme}
                  fontSet={fontSet}
                />
                <StepperRow
                  label={copy.common.month}
                  value={pickerDraft.toLocaleDateString(locale, { month: "long" })}
                  onDecrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setMonth(next.getMonth() - 1);
                    return next;
                  })}
                  onIncrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setMonth(next.getMonth() + 1);
                    return next;
                  })}
                  theme={theme}
                  fontSet={fontSet}
                />
                <StepperRow
                  label={copy.common.day}
                  value={String(pickerDraft.getDate())}
                  onDecrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setDate(next.getDate() - 1);
                    return next;
                  })}
                  onIncrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setDate(next.getDate() + 1);
                    return next;
                  })}
                  theme={theme}
                  fontSet={fontSet}
                />
                <Pressable
                  onPress={() => {
                    const today = new Date();
                    setPickerDraft((current) => {
                      const next = new Date(current);
                      next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
                      return next;
                    });
                  }}
                  style={[styles.quickAction, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                >
                  <Text style={[styles.quickActionText, { color: theme.foreground, fontFamily: fontSet.body }]}>{copy.common.today}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <StepperRow
                  label={copy.common.hour}
                  value={String(pickerDraft.getHours()).padStart(2, "0")}
                  onDecrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setHours(next.getHours() - 1);
                    return next;
                  })}
                  onIncrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setHours(next.getHours() + 1);
                    return next;
                  })}
                  theme={theme}
                  fontSet={fontSet}
                />
                <StepperRow
                  label={copy.common.minute}
                  value={String(pickerDraft.getMinutes()).padStart(2, "0")}
                  onDecrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setMinutes(next.getMinutes() - 5);
                    return next;
                  })}
                  onIncrement={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    next.setMinutes(next.getMinutes() + 5);
                    return next;
                  })}
                  theme={theme}
                  fontSet={fontSet}
                />
                <Pressable
                  onPress={() => setPickerDraft((current) => {
                    const next = new Date(current);
                    const now = new Date();
                    next.setHours(now.getHours(), now.getMinutes(), 0, 0);
                    return next;
                  })}
                  style={[styles.quickAction, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                >
                  <Text style={[styles.quickActionText, { color: theme.foreground, fontFamily: fontSet.body }]}>{copy.common.now}</Text>
                </Pressable>
              </View>
            )}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10 }}>
              <SecondaryButton onPress={() => setActivePicker(null)} style={{ flex: 1 }}>
                {copy.common.cancel}
              </SecondaryButton>
              <PrimaryButton
                onPress={() => {
                  if (!activePicker) {
                    setActivePicker(null);
                    return;
                  }
                  setSessionStart((current) => (activePicker === "date" ? mergeDateParts(current, pickerDraft) : mergeTimeParts(current, pickerDraft)));
                  setActivePicker(null);
                }}
                style={{ flex: 1 }}
              >
                {copy.common.save}
              </PrimaryButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={coachPickerOpen} transparent animationType="fade" onRequestClose={() => setCoachPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCoachPickerOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border, gap: 10 }]} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.sectionHeader, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>{classesCopy.selectCoach}</Text>
            <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ maxHeight: 320 }}>
              {coaches.map((coach) => {
                const selected = sessionForm.coach_id === coach.id;
                return (
                  <Pressable
                    key={coach.id}
                    onPress={() => {
                      setSessionForm((current) => ({ ...current, coach_id: coach.id }));
                      setCoachPickerOpen(false);
                    }}
                    style={[
                      styles.coachRow,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? theme.primarySoft : theme.cardAlt,
                      },
                    ]}
                  >
                    <Text style={[styles.coachName, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>{coach.full_name}</Text>
                    <Text style={[styles.coachRole, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left" }]}>{coach.role}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <SecondaryButton onPress={() => setCoachPickerOpen(false)}>{copy.common.cancel}</SecondaryButton>
          </Pressable>
        </Pressable>
      </Modal>

      {!isCoach ? pendingRequestsSection : null}

      <Modal visible={Boolean(selectedSession)} transparent animationType="fade" onRequestClose={() => setSelectedSession(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedSession(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border, gap: 12, maxHeight: "80%" }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[styles.sectionHeader, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
              {selectedSession ? `${classesCopy.attendeesTitle}: ${selectedSession.display_name}` : classesCopy.attendeesTitle}
            </Text>
            {sessionReservationsQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <View key={index} style={[styles.attendeeCard, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
                    <SkeletonBlock height={16} width="54%" />
                    <SkeletonBlock height={12} width="72%" style={{ marginTop: 8 }} />
                  </View>
                ))}
              </View>
            ) : sessionReservationsQuery.error ? (
              <MutedText>{classesCopy.attendeesFailed}</MutedText>
            ) : (sessionReservationsQuery.data?.length ?? 0) === 0 ? (
              <MutedText>{classesCopy.attendeesEmpty}</MutedText>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 10 }} style={{ maxHeight: 360 }}>
                {sessionReservationsQuery.data?.map((reservation) => {
                  const badgeColor = statusColor(reservation.status, theme.primary, theme.muted, "#F59E0B");
                  return (
                    <View
                      key={reservation.id}
                      style={[styles.attendeeCard, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                    >
                      <View style={[styles.sessionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <View style={styles.sessionInfo}>
                          <Text style={[styles.sessionName, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
                            {reservation.member_name ?? copy.common.member}
                          </Text>
                          <MutedText>
                            {new Date(reservation.reserved_at).toLocaleString(locale, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </MutedText>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: `${badgeColor}22`, borderColor: `${badgeColor}44` }]}>
                          <Text style={[styles.statusBadgeText, { color: badgeColor, fontFamily: fontSet.mono }]}>
                            {localizeCoachReservationStatus(reservation.status, classesCopy)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <SecondaryButton onPress={() => setSelectedSession(null)}>{copy.common.cancel}</SecondaryButton>
          </Pressable>
        </Pressable>
      </Modal>

    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SessionList({
  sessions,
  myReservationMap,
  onPress,
  locale,
  theme,
  fontSet,
  isRTL,
  loading,
  copy,
}: {
  sessions: ClassSession[];
  myReservationMap: Map<string, ClassReservation>;
  onPress: (session: ClassSession) => void;
  locale: string;
  theme: Record<string, string>;
  fontSet: Record<string, string>;
  isRTL: boolean;
  loading: boolean;
  copy: ReturnType<typeof usePreferences>["copy"]["classesScreen"];
}) {
  if (sessions.length === 0) {
    return (
      <View style={{ marginTop: 24, alignItems: "center" }}>
        <MutedText>{copy.noUpcoming}</MutedText>
      </View>
    );
  }

  // Group by date
  const groups = new Map<string, ClassSession[]>();
  for (const s of sessions) {
    const key = formatDate(s.starts_at, locale);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <View style={{ gap: 12, paddingBottom: 32 }}>
      {[...groups.entries()].map(([date, daySessions]) => (
        <View key={date} style={{ gap: 10 }}>
          <Text style={[styles.dateHeader, { color: theme.muted, fontFamily: fontSet.mono }]}>{date.toUpperCase()}</Text>
          {daySessions.map((session) => {
            const myRes = myReservationMap.get(session.id);
            const hasBooking = !!myRes;
            const isFull = session.reserved_count >= session.capacity && !hasBooking;
            return (
              <SessionCard
                key={session.id}
                session={session}
                myStatus={myRes?.status ?? null}
                hasBooking={hasBooking}
                isFull={isFull}
                onPress={() => onPress(session)}
                locale={locale}
                theme={theme}
                fontSet={fontSet}
                isRTL={isRTL}
                loading={loading}
                copy={copy}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function SessionCard({
  session,
  myStatus,
  hasBooking,
  isFull,
  onPress,
  locale,
  theme,
  fontSet,
  isRTL,
  loading,
  copy,
}: {
  session: ClassSession;
  myStatus: string | null;
  hasBooking: boolean;
  isFull: boolean;
  onPress: () => void;
  locale: string;
  theme: Record<string, string>;
  fontSet: Record<string, string>;
  isRTL: boolean;
  loading: boolean;
  copy: ReturnType<typeof usePreferences>["copy"]["classesScreen"];
}) {
  const accentColor = session.template_name ? (session as any).color ?? theme.primary : theme.primary;
  const badgeLabel = sessionStatusBadge(session, myStatus, copy);
  const badgeColor = myStatus
    ? statusColor(myStatus, theme.primary, theme.muted, "#F59E0B")
    : isFull
    ? theme.muted
    : theme.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.sessionCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderLeftColor: accentColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.sessionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.sessionInfo}>
          <Text style={[styles.sessionName, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
            {session.display_name}
          </Text>
          <View style={[styles.sessionMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name="time-outline" size={13} color={theme.muted} />
            <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>
              {formatTime(session.starts_at, locale)} – {formatTime(session.ends_at, locale)}
            </Text>
          </View>
          {session.coach_name ? (
              <View style={[styles.sessionMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Ionicons name="person-outline" size={13} color={theme.muted} />
                <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>{session.coach_name}</Text>
              </View>
            ) : null}
          {session.session_name && session.session_name !== session.template_name ? (
            <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>
              {fillTemplate(copy.templateReference, { name: session.template_name })}
            </Text>
          ) : null}
        </View>
        <View style={styles.sessionRight}>
          <View style={[styles.statusBadge, { backgroundColor: `${badgeColor}22`, borderColor: `${badgeColor}44` }]}>
            <Text style={[styles.statusBadgeText, { color: badgeColor, fontFamily: fontSet.mono }]}>{badgeLabel}</Text>
          </View>
          <Text style={[styles.sessionAction, { color: hasBooking ? "#EF4444" : isFull ? theme.muted : theme.primary, fontFamily: fontSet.body }]}>
            {hasBooking ? copy.cancel : isFull ? copy.full : copy.request}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function MyBookingsList({
  reservations,
  onCancel,
  locale,
  theme,
  fontSet,
  isRTL,
  loading,
  copy,
}: {
  reservations: ClassReservation[];
  onCancel: (sessionId: string) => void;
  locale: string;
  theme: Record<string, string>;
  fontSet: Record<string, string>;
  isRTL: boolean;
  loading: boolean;
  copy: ReturnType<typeof usePreferences>["copy"]["classesScreen"];
}) {
  if (reservations.length === 0) {
    return (
      <View style={{ marginTop: 24, alignItems: "center" }}>
        <MutedText>{copy.noBookings}</MutedText>
      </View>
    );
  }

  return (
    <View style={{ gap: 12, paddingBottom: 32 }}>
      {reservations.map((r) => {
        const statusLabel =
          r.status === "RESERVED" ? copy.confirmed :
          r.status === "PENDING" ? copy.pendingApproval :
          r.status === "WAITLISTED" ? copy.waitlisted : r.status;
        const badgeColor =
          r.status === "RESERVED" ? theme.primary :
          r.status === "PENDING" ? "#F59E0B" :
          theme.muted;

        return (
          <View
            key={r.reservation_id}
            style={[styles.sessionCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: badgeColor }]}
          >
            <View style={[styles.sessionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.sessionInfo}>
                <Text style={[styles.sessionName, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left" }]}>
                  {r.session.display_name}
                </Text>
                <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>
                  {formatDate(r.session.starts_at, locale)} · {formatTime(r.session.starts_at, locale)}
                </Text>
                {r.session.session_name && r.session.session_name !== r.session.template_name ? (
                  <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>
                    {fillTemplate(copy.templateReference, { name: r.session.template_name })}
                  </Text>
                ) : null}
                {r.session.coach_name ? (
                  <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>
                    {copy.coachPrefix}: {r.session.coach_name}
                  </Text>
                ) : null}
              </View>
              <View style={styles.sessionRight}>
                <View style={[styles.statusBadge, { backgroundColor: `${badgeColor}22`, borderColor: `${badgeColor}44` }]}>
                  <Text style={[styles.statusBadgeText, { color: badgeColor, fontFamily: fontSet.mono }]}>{statusLabel}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Alert.alert(copy.cancelBookingTitle, fillTemplate(copy.cancelBookingMessage, { name: r.session.display_name }), [
                      { text: copy.keep, style: "cancel" },
                      { text: copy.cancel, style: "destructive", onPress: () => onCancel(r.session.id) },
                    ]);
                  }}
                  disabled={loading}
                >
                  <Text style={[styles.sessionAction, { color: "#EF4444", fontFamily: fontSet.body }]}>{copy.cancel}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  templateChip: {
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  templateTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  templateMeta: {
    fontSize: 10,
    marginTop: 4,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  templateSummaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  templateSummaryHeader: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  templateSummaryInfo: {
    flex: 1,
    gap: 6,
  },
  templateBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  capacityStatsRow: {
    gap: 10,
  },
  capacityStatCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  capacityStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  capacityStatValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  scheduleSummaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  scheduleSummaryRow: {
    gap: 10,
  },
  scheduleSummaryStat: {
    flex: 1,
    gap: 4,
  },
  scheduleSummaryValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  formLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  pickField: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  pickFieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pickFieldValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    width: "100%",
    gap: 12,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dateHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sessionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },
  sessionRow: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sessionInfo: {
    flex: 1,
    gap: 4,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: "700",
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
  },
  sessionRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  sessionAction: {
    fontSize: 13,
    fontWeight: "700",
  },
  coachRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  coachName: {
    fontSize: 14,
    fontWeight: "700",
  },
  coachRole: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  attendeeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  smallActionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  pickerSummary: {
    gap: 4,
  },
  pickerSummaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pickerSummaryValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  stepperRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  stepperHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  stepperControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  stepperButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  stepperButtonText: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  quickAction: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
});

function StepperRow({
  label,
  value,
  onDecrement,
  onIncrement,
  theme,
  fontSet,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  theme: Record<string, string>;
  fontSet: Record<string, string>;
}) {
  return (
    <View style={[styles.stepperRow, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
      <View style={styles.stepperHeader}>
        <Text style={[styles.stepperLabel, { color: theme.muted, fontFamily: fontSet.mono }]}>{label}</Text>
        <Text style={[styles.stepperValue, { color: theme.foreground, fontFamily: fontSet.display }]}>{value}</Text>
      </View>
      <View style={styles.stepperControls}>
        <Pressable onPress={onDecrement} style={[styles.stepperButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.stepperButtonText, { color: theme.foreground, fontFamily: fontSet.display }]}>−</Text>
        </Pressable>
        <Pressable onPress={onIncrement} style={[styles.stepperButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.stepperButtonText, { color: theme.foreground, fontFamily: fontSet.display }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
