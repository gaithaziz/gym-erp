import { Redirect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle, SecondaryButton } from "@/components/ui";
import { localizeTicketCategory, localizeTicketStatus } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole, isCustomerRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type SupportTicket = {
  id: string;
  subject: string;
  status: string;
  category: string;
  messages?: { id: string }[];
  customer?: { full_name?: string | null; email?: string | null } | null;
};

export default function SupportTab() {
  const router = useRouter();
  const { authorizedRequest, bootstrap, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const customer = isCustomerRole(role);
  const supportStaff = role === "RECEPTION" || role === "FRONT_DESK" || isAdminControlRole(role);

  const ticketsQuery = useQuery({
    queryKey: ["mobile-support-tab", role, selectedBranchId],
    enabled: customer || supportStaff,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBranchId) {
        params.set("branch_id", selectedBranchId);
      }
      const suffix = params.toString();
      return (await authorizedRequest<SupportTicket[]>(suffix ? `/mobile/support/tickets?${suffix}` : "/mobile/support/tickets")).data;
    },
  });

  if (role === "COACH") {
    return <Redirect href="/chat" />;
  }

  if (!customer) {
    return (
      <Screen title={copy.common.support} subtitle={copy.supportScreen.subtitle}>
        <Card>
          <SectionTitle>{copy.common.support}</SectionTitle>
          <QueryState
            loading={ticketsQuery.isLoading}
            error={ticketsQuery.error instanceof Error ? ticketsQuery.error.message : null}
            empty={!ticketsQuery.isLoading && (ticketsQuery.data ?? []).length === 0}
            emptyMessage={copy.common.noData}
          />
          {(ticketsQuery.data ?? []).map((ticket) => (
            <View key={ticket.id} style={[styles.row, { borderTopColor: theme.border }]}>
              <View style={styles.textColumn}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body }}>{ticket.subject}</Text>
                <MutedText>{ticket.customer?.full_name || localizeTicketCategory(ticket.category, isRTL)}</MutedText>
              </View>
              <Text style={{ color: theme.primary, fontFamily: fontSet.mono }}>{localizeTicketStatus(ticket.status, isRTL)}</Text>
            </View>
          ))}
        </Card>
      </Screen>
    );
  }

  const tickets = ticketsQuery.data ?? [];
  const recentTickets = tickets.slice(0, 3);

  return (
    <Screen title={copy.common.support} subtitle={copy.supportScreen.subtitle}>
      <Card>
        <SectionTitle>{copy.home.quickActions}</SectionTitle>
        <View style={styles.actionGrid}>
          <SecondaryButton onPress={() => router.push("/ticket")}>{copy.supportScreen.newTicket}</SecondaryButton>
          <SecondaryButton onPress={() => router.push({ pathname: "/ticket", params: { type: "support" } })}>{copy.billingScreen.contactSupport}</SecondaryButton>
          <SecondaryButton onPress={() => router.push({ pathname: "/ticket", params: { type: "extend" } })}>{copy.billingScreen.requestExtension}</SecondaryButton>
        </View>
      </Card>

      <Card>
        <SectionTitle>{copy.common.support}</SectionTitle>
        <QueryState
          loading={ticketsQuery.isLoading}
          error={ticketsQuery.error instanceof Error ? ticketsQuery.error.message : null}
          empty={!ticketsQuery.isLoading && tickets.length === 0}
          emptyMessage={copy.supportScreen.noTickets}
        />
        {recentTickets.map((ticket) => (
          <Pressable
            key={ticket.id}
            onPress={() => router.push({ pathname: "/ticket", params: { ticketId: ticket.id } })}
            style={[styles.ticketCard, { borderColor: theme.border, backgroundColor: theme.cardAlt, flexDirection: isRTL ? "row-reverse" : "row" }]}
          >
            <View style={styles.ticketText}>
              <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                {ticket.subject}
              </Text>
              <MutedText>{localizeTicketCategory(ticket.category, isRTL)}</MutedText>
            </View>
            <View style={styles.ticketMeta}>
              <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 11 }}>
                {localizeTicketStatus(ticket.status, isRTL)}
              </Text>
              <MutedText>{ticket.messages?.length ?? 0}</MutedText>
            </View>
          </Pressable>
        ))}
        {tickets.length > 0 ? (
          <SecondaryButton onPress={() => router.push("/ticket")}>{copy.chatScreen.openThread}</SecondaryButton>
        ) : null}
      </Card>
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
  actionGrid: {
    flexDirection: "column",
    gap: 10,
  },
  ticketCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  ticketText: {
    flex: 1,
    gap: 4,
  },
  ticketMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
});
