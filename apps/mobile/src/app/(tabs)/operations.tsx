import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { getCurrentRole } from "@/lib/mobile-role";
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

const styles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  textColumn: {
    gap: 4,
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
