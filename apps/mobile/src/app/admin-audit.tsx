import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseAdminAuditSummaryEnvelope } from "@/lib/api";
import { localizeAuditAction } from "@/lib/mobile-format";
import { getCurrentRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function AdminAuditScreen() {
  const { authorizedRequest, bootstrap, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, locale, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);

  const auditQuery = useQuery({
    queryKey: ["mobile-admin-audit-summary", role, selectedBranchId ?? "all"],
    enabled: role === "ADMIN",
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseAdminAuditSummaryEnvelope(await authorizedRequest(`/mobile/admin/audit/summary${suffix}`)).data;
    },
  });

  if (role !== "ADMIN") {
    return (
      <Screen title={copy.adminControl.auditSummary} subtitle={copy.adminControl.auditAdminOnly} showSubtitle>
        <Card>
          <MutedText>{copy.adminControl.auditAdminOnly}</MutedText>
        </Card>
      </Screen>
    );
  }

  const audit = auditQuery.data;

  return (
    <Screen title={copy.adminControl.auditSummary} subtitle={copy.adminControl.auditAdminOnly} showSubtitle>
      <QueryState loading={auditQuery.isLoading} loadingVariant="dashboard" error={auditQuery.error instanceof Error ? auditQuery.error.message : null} />
      {audit ? (
        <>
          <Card>
            <SectionTitle>{copy.adminControl.audit}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.events} value={audit.total_events} />
              <InlineStat label={copy.adminControl.actions} value={audit.action_counts.length} />
            </View>
            <MutedText>{audit.security.status === "not_run" ? copy.adminControl.securityAuditWebOnly : audit.security.summary}</MutedText>
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.actions}</SectionTitle>
            {audit.action_counts.length === 0 ? <MutedText>{copy.adminControl.noAuditEvents}</MutedText> : null}
            {audit.action_counts.map((item) => (
              <View key={item.id} style={[styles.row, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Text style={[styles.title, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                  {localizeAuditAction(item.id || item.label, isRTL)}
                </Text>
                <Text style={[styles.value, { color: theme.primary, fontFamily: fontSet.mono }]}>{item.value}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.recentActivity}</SectionTitle>
            {audit.recent_events.length === 0 ? <MutedText>{copy.adminControl.noAuditEvents}</MutedText> : null}
            {audit.recent_events.map((event) => (
              <View key={event.id} style={[styles.eventRow, { borderTopColor: theme.border, alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text style={[styles.eventTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                  {localizeAuditAction(event.action, isRTL)}
                </Text>
                <MutedText>{[event.actor_name || copy.adminControl.system, formatDateTime(event.timestamp, locale)].filter(Boolean).join(" - ")}</MutedText>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return null;
  }
  return new Date(value).toLocaleString(locale);
}

const styles = StyleSheet.create({
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  row: {
    alignItems: "center",
    borderTopWidth: 1,
    gap: 12,
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  value: {
    fontSize: 15,
    fontWeight: "800",
  },
  eventRow: {
    borderTopWidth: 1,
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
});
