import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MutedText, QueryState, Screen } from "@/components/ui";
import {
  parseMyReservationsEnvelope,
  parseUpcomingClassesEnvelope,
  type ClassReservation,
  type ClassSession,
} from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function spotsLeft(session: ClassSession) {
  return Math.max(0, session.capacity - session.reserved_count);
}

function statusColor(status: string, primary: string, muted: string, warning: string) {
  if (status === "RESERVED") return primary;
  if (status === "PENDING") return warning;
  if (status === "WAITLISTED") return muted;
  return muted;
}

function sessionStatusBadge(session: ClassSession, myStatus: string | null) {
  if (myStatus === "RESERVED") return "✓ Confirmed";
  if (myStatus === "PENDING") return "⏳ Pending";
  if (myStatus === "WAITLISTED") return "Waitlisted";
  if (session.reserved_count >= session.capacity) return "Full";
  return `${spotsLeft(session)} spot${spotsLeft(session) === 1 ? "" : "s"} left`;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ClassesScreen() {
  const { authorizedRequest } = useSession();
  const { copy, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const locale = isRTL ? "ar" : "en";

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
      Alert.alert("Request Sent", "Your reservation request has been submitted and is awaiting approval.");
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      authorizedRequest(`/classes/sessions/${sessionId}/reserve`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
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
        "Cancel Reservation",
        `Cancel your ${myRes.status.toLowerCase()} reservation for ${session.template_name}?`,
        [
          { text: "Keep", style: "cancel" },
          { text: "Cancel Reservation", style: "destructive", onPress: () => cancelMutation.mutate(session.id) },
        ]
      );
    } else {
      Alert.alert(
        "Request Spot",
        `Request a spot in ${session.template_name} on ${formatDate(session.starts_at, locale)}?\n\nYour request will be reviewed by the coach.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Request", onPress: () => reserveMutation.mutate(session.id) },
        ]
      );
    }
  }

  return (
    <Screen title="Classes" subtitle="Browse & reserve group classes">
      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => setTab("upcoming")}
          style={[styles.tab, tab === "upcoming" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: tab === "upcoming" ? theme.primary : theme.muted, fontFamily: fontSet.body }]}>
            Upcoming
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("mine")}
          style={[styles.tab, tab === "mine" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: tab === "mine" ? theme.primary : theme.muted, fontFamily: fontSet.body }]}>
            My Bookings{myReservationsQuery.data?.length ? ` (${myReservationsQuery.data.length})` : ""}
          </Text>
        </Pressable>
      </View>

      <QueryState
        loading={tab === "upcoming" ? upcomingQuery.isLoading : myReservationsQuery.isLoading}
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
        />
      )}
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
}: {
  sessions: ClassSession[];
  myReservationMap: Map<string, ClassReservation>;
  onPress: (session: ClassSession) => void;
  locale: string;
  theme: Record<string, string>;
  fontSet: Record<string, string>;
  isRTL: boolean;
  loading: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <View style={{ marginTop: 24, alignItems: "center" }}>
        <MutedText>No upcoming classes scheduled.</MutedText>
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
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      {[...groups.entries()].map(([date, daySessions]) => (
        <View key={date}>
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
              />
            );
          })}
        </View>
      ))}
    </ScrollView>
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
}) {
  const accentColor = session.template_name ? (session as any).color ?? theme.primary : theme.primary;
  const badgeLabel = sessionStatusBadge(session, myStatus);
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
            {session.template_name}
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
        </View>
        <View style={styles.sessionRight}>
          <View style={[styles.statusBadge, { backgroundColor: `${badgeColor}22`, borderColor: `${badgeColor}44` }]}>
            <Text style={[styles.statusBadgeText, { color: badgeColor, fontFamily: fontSet.mono }]}>{badgeLabel}</Text>
          </View>
          <Text style={[styles.sessionAction, { color: hasBooking ? "#EF4444" : isFull ? theme.muted : theme.primary, fontFamily: fontSet.body }]}>
            {hasBooking ? "Cancel" : isFull ? "Full" : "Request"}
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
}: {
  reservations: ClassReservation[];
  onCancel: (sessionId: string) => void;
  locale: string;
  theme: Record<string, string>;
  fontSet: Record<string, string>;
  isRTL: boolean;
  loading: boolean;
}) {
  if (reservations.length === 0) {
    return (
      <View style={{ marginTop: 24, alignItems: "center" }}>
        <MutedText>You have no upcoming class bookings.</MutedText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      {reservations.map((r) => {
        const statusLabel =
          r.status === "RESERVED" ? "Confirmed" :
          r.status === "PENDING" ? "Pending Approval" :
          r.status === "WAITLISTED" ? "Waitlisted" : r.status;
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
                  {r.session.template_name}
                </Text>
                <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>
                  {formatDate(r.session.starts_at, locale)} · {formatTime(r.session.starts_at, locale)}
                </Text>
                {r.session.coach_name ? (
                  <Text style={[styles.metaText, { color: theme.muted, fontFamily: fontSet.body }]}>
                    Coach: {r.session.coach_name}
                  </Text>
                ) : null}
              </View>
              <View style={styles.sessionRight}>
                <View style={[styles.statusBadge, { backgroundColor: `${badgeColor}22`, borderColor: `${badgeColor}44` }]}>
                  <Text style={[styles.statusBadgeText, { color: badgeColor, fontFamily: fontSet.mono }]}>{statusLabel}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Alert.alert("Cancel Booking", `Cancel your reservation for ${r.session.template_name}?`, [
                      { text: "Keep", style: "cancel" },
                      { text: "Cancel", style: "destructive", onPress: () => onCancel(r.session.id) },
                    ]);
                  }}
                  disabled={loading}
                >
                  <Text style={[styles.sessionAction, { color: "#EF4444", fontFamily: fontSet.body }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
});
