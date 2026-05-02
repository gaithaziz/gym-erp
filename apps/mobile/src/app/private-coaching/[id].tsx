import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Card, MutedText, PrimaryButton, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseEnvelope } from "@/lib/api";
import { getCurrentRole } from "@/lib/mobile-role";
import { localeTag } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type CoachingPackage = {
  id: string;
  user_id: string;
  coach_id?: string | null;
  coach_name?: string | null;
  member_name?: string | null;
  package_key: string;
  package_label: string;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  start_date?: string | null;
  end_date?: string | null;
  note?: string | null;
  is_active: boolean;
  updated_at?: string | null;
};

type LedgerEntry = {
  id: string;
  session_delta: number;
  note?: string | null;
  performed_at?: string | null;
  performed_by_user_id?: string | null;
};

type LedgerResponse = {
  package: CoachingPackage;
  entries: LedgerEntry[];
};

function shortId(value?: string | null) {
  if (!value) {
    return "--";
  }
  return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

export default function PrivateCoachingLedgerScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const packageId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { authorizedRequest, bootstrap } = useSession();
  const queryClient = useQueryClient();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const role = getCurrentRole(bootstrap);

  const ledgerQuery = useQuery({
    queryKey: ["mobile-private-coaching-ledger", packageId],
    enabled: Boolean(packageId),
    queryFn: async () => parseEnvelope<LedgerResponse>(await authorizedRequest(`/coaching/packages/${packageId}/ledger`)).data,
  });
  const payload = ledgerQuery.data;
  const packageItem = payload?.package;

  const useSessionMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest(`/coaching/packages/${packageId}/use`, {
        method: "POST",
        body: JSON.stringify({ used_sessions: 1, note: null }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-private-coaching-ledger", packageId] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-private-coaching"] });
    },
  });

  if (!packageId) {
    return (
      <Screen title={copy.privateCoachingScreen.detailsTitle} subtitle={copy.privateCoachingScreen.subtitle} showSubtitle>
        <Card>
          <MutedText>{copy.common.noData}</MutedText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={copy.privateCoachingScreen.detailsTitle} subtitle={copy.privateCoachingScreen.subtitle} showSubtitle>
      <QueryState
        loading={ledgerQuery.isLoading}
        error={ledgerQuery.error instanceof Error ? ledgerQuery.error.message : null}
        empty={Boolean(payload && payload.entries.length === 0)}
        emptyMessage={copy.privateCoachingScreen.noLedger}
      />
      {payload && packageItem ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <SectionTitle>{packageItem.package_label}</SectionTitle>
            <View style={[styles.metaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>
                {copy.privateCoachingScreen.packageCode}: {packageItem.package_key}
              </MutedText>
              <MutedText>{packageItem.is_active ? copy.privateCoachingScreen.activeStatus : copy.privateCoachingScreen.inactiveStatus}</MutedText>
            </View>
            <View style={[styles.metaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>
                {copy.privateCoachingScreen.member}: {packageItem.member_name || copy.common.member}
              </MutedText>
              <MutedText>
                {copy.privateCoachingScreen.coach}: {packageItem.coach_name || copy.common.noData}
              </MutedText>
            </View>
            <View style={styles.coachBlock}>
              <SectionTitle>{copy.privateCoachingScreen.coach}</SectionTitle>
              <Text style={[styles.coachName, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                {packageItem.coach_name || copy.common.noData}
              </Text>
              <MutedText>
                {packageItem.coach_id ? `${copy.privateCoachingScreen.coachId}: ${shortId(packageItem.coach_id)}` : copy.common.noData}
              </MutedText>
            </View>
            <MutedText>
              {copy.privateCoachingScreen.remainingLabel}: {packageItem.remaining_sessions} / {packageItem.total_sessions}
            </MutedText>
            {(role === "COACH" || role === "CUSTOMER") && packageItem.is_active ? (
              <PrimaryButton onPress={() => useSessionMutation.mutate()} disabled={useSessionMutation.isPending}>
                {useSessionMutation.isPending ? copy.privateCoachingScreen.usingSession : copy.privateCoachingScreen.useSession}
              </PrimaryButton>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>{copy.privateCoachingScreen.ledgerTitle}</SectionTitle>
            {payload.entries.length === 0 ? (
              <MutedText>{copy.privateCoachingScreen.noLedger}</MutedText>
            ) : (
              <View style={{ gap: 12 }}>
                {payload.entries.map((entry) => {
                  const when = entry.performed_at ? new Date(entry.performed_at).toLocaleString(locale) : copy.common.noData;
                  const absoluteDelta = Math.abs(entry.session_delta);
                  const deltaLabel =
                    entry.session_delta < 0
                      ? `${copy.privateCoachingScreen.sessionUsed} ${absoluteDelta}`
                      : `${copy.privateCoachingScreen.sessionAdded} ${absoluteDelta}`;
                  const chipLabel = entry.session_delta < 0 ? copy.privateCoachingScreen.sessionUsed : copy.privateCoachingScreen.sessionAdded;
                  const chipBackground = entry.session_delta < 0 ? theme.primarySoft : theme.cardAlt;
                  const chipColor = entry.session_delta < 0 ? theme.primary : theme.foreground;
                  return (
                    <View key={entry.id} style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={[styles.deltaText, { color: entry.session_delta < 0 ? theme.primary : theme.foreground, fontFamily: fontSet.body }]}>
                          {deltaLabel}
                        </Text>
                        <View style={[styles.actionChip, { backgroundColor: chipBackground, borderColor: theme.border }]}>
                          <Text style={[styles.actionChipText, { color: chipColor, fontFamily: fontSet.mono }]}>
                            {chipLabel}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.metaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <MutedText>
                          {copy.privateCoachingScreen.performedAt}: {when}
                        </MutedText>
                        <MutedText>
                          {copy.privateCoachingScreen.performedBy}: {shortId(entry.performed_by_user_id)}
                        </MutedText>
                      </View>
                      {entry.note ? (
                        <Text style={[styles.noteText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                          {entry.note}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 10,
  },
  coachBlock: {
    gap: 4,
  },
  coachName: {
    fontSize: 18,
    fontWeight: "800",
  },
  entryCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  metaRow: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  deltaText: {
    fontSize: 24,
    fontWeight: "900",
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
