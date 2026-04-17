import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseAdminAuditSummaryEnvelope, parseAdminInventorySummaryEnvelope, parseAdminOperationsSummaryEnvelope } from "@/lib/api";
import { getCurrentRole, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type LeaveRequest = {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
  reason?: string | null;
};

type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  payment_method: string;
  member_name?: string | null;
};

export default function OperationsTab() {
  const router = useRouter();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, fontSet, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);

  if (isAdminControlRole(role)) {
    return <AdminOperationsTab />;
  }

  const transactionsQuery = useQuery({
    queryKey: ["mobile-staff-transactions"],
    enabled: role === "CASHIER",
    queryFn: async () => (await authorizedRequest<TransactionRow[]>("/mobile/staff/transactions/recent")).data,
  });

  const leavesQuery = useQuery({
    queryKey: ["mobile-my-leaves"],
    enabled: role !== "CASHIER",
    queryFn: async () => (await authorizedRequest<LeaveRequest[]>("/hr/leaves/me")).data,
  });

  return (
    <Screen title={copy.operationsScreen.title} subtitle={copy.operationsScreen.subtitle}>
      {role === "CASHIER" ? (
        <Card>
          <SectionTitle>{copy.operationsScreen.recentTransactions}</SectionTitle>
          <QueryState
            loading={transactionsQuery.isLoading}
            error={transactionsQuery.error instanceof Error ? transactionsQuery.error.message : null}
            empty={!transactionsQuery.isLoading && (transactionsQuery.data ?? []).length === 0}
            emptyMessage={copy.operationsScreen.noTransactions}
          />
          {(transactionsQuery.data ?? []).map((item) => (
            <View key={item.id} style={[styles.row, { borderTopColor: theme.border }]}>
              <View style={styles.textColumn}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{item.description}</Text>
                <MutedText>{item.member_name || item.payment_method}</MutedText>
              </View>
              <Text style={{ color: theme.primary, fontFamily: fontSet.mono }}>{item.amount}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>{copy.operationsScreen.myLeaves}</SectionTitle>
            <QueryState
              loading={leavesQuery.isLoading}
              error={leavesQuery.error instanceof Error ? leavesQuery.error.message : null}
              empty={!leavesQuery.isLoading && (leavesQuery.data ?? []).length === 0}
              emptyMessage={copy.operationsScreen.noLeaves}
            />
            {(leavesQuery.data ?? []).map((leave) => (
              <View key={leave.id} style={[styles.row, { borderTopColor: theme.border }]}>
                <View style={styles.textColumn}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{leave.leave_type}</Text>
                  <MutedText>{`${leave.start_date} - ${leave.end_date}`}</MutedText>
                </View>
                <Text style={{ color: theme.primary, fontFamily: fontSet.mono }}>{leave.status}</Text>
              </View>
            ))}
          </Card>
          <Card>
            <View style={styles.actionRow}>
              <Pressable onPress={() => router.push("/(tabs)/qr" as never)} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{copy.staffHome.actions.qr}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/leaves")} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{copy.operationsScreen.myLeaves}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/profile")} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{copy.operationsScreen.openProfile}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/lost-found")} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{copy.operationsScreen.openLostFound}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/support")} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{copy.more.support}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/notifications")} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{copy.more.notifications}</Text>
              </Pressable>
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

function AdminOperationsTab() {
  const router = useRouter();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, locale, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const canViewAudit = role === "ADMIN";

  const operationsQuery = useQuery({
    queryKey: ["mobile-admin-operations-summary", role],
    queryFn: async () => parseAdminOperationsSummaryEnvelope(await authorizedRequest("/mobile/admin/operations/summary")).data,
  });

  const auditQuery = useQuery({
    queryKey: ["mobile-admin-audit-summary", role],
    enabled: canViewAudit,
    queryFn: async () => parseAdminAuditSummaryEnvelope(await authorizedRequest("/mobile/admin/audit/summary")).data,
  });

  const inventoryQuery = useQuery({
    queryKey: ["mobile-admin-inventory-summary", role],
    queryFn: async () => parseAdminInventorySummaryEnvelope(await authorizedRequest("/mobile/admin/inventory/summary")).data,
  });

  const operations = operationsQuery.data;
  const audit = auditQuery.data;
  const inventory = inventoryQuery.data;

  return (
    <Screen title={copy.operationsScreen.title} subtitle={copy.adminControl.subtitle} showSubtitle>
      <QueryState loading={operationsQuery.isLoading} error={operationsQuery.error instanceof Error ? operationsQuery.error.message : null} />
      {operations ? (
        <>
          <Card>
            <SectionTitle>{copy.adminControl.today}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.checkIns} value={operations.attendance.checkins_today} />
              <InlineStat label={copy.adminControl.denied} value={operations.attendance.denied_today} />
              <InlineStat label={copy.common.support} value={operations.support.open_tickets} />
              <InlineStat label={copy.adminControl.lostItems} value={operations.support.lost_found_open} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.approvals}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.renewals} value={operations.approvals.pending_renewals} />
              <InlineStat label={copy.adminControl.leaves} value={operations.approvals.pending_leaves} />
            </View>
            <View style={styles.actionRow}>
              <ActionChip label={copy.adminControl.openSupport} onPress={() => router.push("/support")} />
              <ActionChip label={copy.common.lostFound} onPress={() => router.push("/lost-found")} />
              <ActionChip label={copy.more.notifications} onPress={() => router.push("/notifications")} />
              <ActionChip label={copy.adminControl.inventorySummary} onPress={() => router.push("/inventory-summary")} />
              {canViewAudit ? <ActionChip label={copy.adminControl.auditSummary} onPress={() => router.push("/admin-audit")} /> : null}
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.more.notifications}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.adminControl.queuedPush} value={operations.notifications.queued_push} />
              <InlineStat label={copy.adminControl.failedPush} value={operations.notifications.failed_push} />
              <InlineStat label={copy.adminControl.automation} value={operations.notifications.enabled_automation_rules} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.adminControl.recentSupport}</SectionTitle>
            {operations.recent_support_tickets.length === 0 ? <MutedText>{copy.adminControl.noSupportActivity}</MutedText> : null}
            {operations.recent_support_tickets.map((ticket) => (
              <View key={ticket.id} style={[styles.rowBetween, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.textColumn}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {ticket.subject}
                  </Text>
                  <MutedText>{[ticket.customer_name, ticket.status, formatDateTime(ticket.created_at, locale)].filter(Boolean).join(" - ")}</MutedText>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <QueryState loading={inventoryQuery.isLoading} error={inventoryQuery.error instanceof Error ? inventoryQuery.error.message : null} />
      {inventory ? (
        <Card>
          <SectionTitle>{copy.adminControl.inventory}</SectionTitle>
          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <InlineStat label={copy.adminControl.activeSkus} value={inventory.total_active_products} />
            <InlineStat label={copy.adminControl.lowStock} value={inventory.low_stock_count} />
            <InlineStat label={copy.adminControl.outOfStock} value={inventory.out_of_stock_count} />
          </View>
          {inventory.low_stock_products.length === 0 ? <MutedText>{copy.adminControl.stockClear}</MutedText> : null}
          {inventory.low_stock_products.slice(0, 5).map((product) => (
            <View key={product.id} style={[styles.rowBetween, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.textColumn}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                  {product.name}
                </Text>
                <MutedText>{`${product.category} - ${copy.adminControl.threshold} ${product.low_stock_threshold}`}</MutedText>
              </View>
              <Text style={{ color: theme.primary, fontFamily: fontSet.mono }}>{product.stock_quantity}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {canViewAudit ? <QueryState loading={auditQuery.isLoading} error={auditQuery.error instanceof Error ? auditQuery.error.message : null} /> : null}
      {canViewAudit && audit ? (
        <Card>
          <SectionTitle>{copy.adminControl.audit}</SectionTitle>
          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <InlineStat label={copy.adminControl.events} value={audit.total_events} />
            <InlineStat label={copy.adminControl.actions} value={audit.action_counts.length} />
          </View>
          {audit.recent_events.length === 0 ? <MutedText>{copy.adminControl.noAuditEvents}</MutedText> : null}
          {audit.recent_events.slice(0, 5).map((event) => (
            <View key={event.id} style={[styles.rowBetween, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.textColumn}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                  {event.action}
                </Text>
                <MutedText>{[event.actor_name || copy.adminControl.system, formatDateTime(event.timestamp, locale)].filter(Boolean).join(" - ")}</MutedText>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function ActionChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable onPress={onPress} style={[styles.actionChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{label}</Text>
    </Pressable>
  );
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return null;
  }
  return new Date(value).toLocaleString(locale);
}

const styles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  rowBetween: {
    alignItems: "center",
    borderTopWidth: 1,
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
  },
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
