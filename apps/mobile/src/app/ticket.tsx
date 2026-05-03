import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MediaPreview, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { pickImagesFromLibrary } from "@/lib/media-picker";
import { localizeTicketCategory, localizeTicketStatus, localeTag } from "@/lib/mobile-format";
import { getCurrentRole, isCustomerRole, isSupportStaffRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type SupportMessage = {
  id: string;
  message: string;
  created_at: string;
  media_url?: string | null;
  media_mime?: string | null;
};

type SupportTicket = {
  id: string;
  subject: string;
  status: string;
  category: string;
  messages: SupportMessage[];
};

const CATEGORIES = ["GENERAL", "TECHNICAL", "BILLING", "SUBSCRIPTION"] as const;
const QUEUE_FILTERS = ["all", "active", "resolvedClosed"] as const;
const STAFF_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

function subscriptionSupportSubject(type: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (type === "freeze") {
    return copy.supportScreen.subscriptionFreezeSubject;
  }
  if (type === "unfreeze") {
    return copy.supportScreen.subscriptionUnfreezeSubject;
  }
  if (type === "extend") {
    return copy.supportScreen.subscriptionExtendSubject;
  }
  return copy.supportScreen.subscriptionSupportSubject;
}

function subscriptionSupportMessage(type: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (type === "freeze") {
    return copy.supportScreen.subscriptionFreezeMessage;
  }
  if (type === "unfreeze") {
    return copy.supportScreen.subscriptionUnfreezeMessage;
  }
  if (type === "extend") {
    return copy.supportScreen.subscriptionExtendMessage;
  }
  return copy.supportScreen.subscriptionSupportMessage;
}

export default function SupportScreen() {
  const params = useLocalSearchParams<{ type?: string; ticketId?: string }>();
  const { authorizedRequest, bootstrap, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const customer = isCustomerRole(role);
  const canHandleSupport = isSupportStaffRole(role);
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("GENERAL");
  const [queueFilter, setQueueFilter] = useState<(typeof QUEUE_FILTERS)[number]>("active");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | (typeof CATEGORIES)[number]>("ALL");
  const [message, setMessage] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!params.type || subject || message) {
      return;
    }
    const requestType = String(params.type);
    setCategory("SUBSCRIPTION");
    setSubject(subscriptionSupportSubject(requestType, copy));
    setMessage(subscriptionSupportMessage(requestType, copy));
  }, [copy, message, params.type, subject]);

  const ticketQueryString = useMemo(() => {
    const search = new URLSearchParams();
    if (queueFilter === "active") {
      search.set("is_active", "true");
    }
    if (queueFilter === "resolvedClosed") {
      search.set("is_active", "false");
    }
    if (categoryFilter !== "ALL") {
      search.set("category", categoryFilter);
    }
    if (selectedBranchId) {
      search.set("branch_id", selectedBranchId);
    }
    return search.toString();
  }, [categoryFilter, queueFilter, selectedBranchId]);

  const supportPath = ticketQueryString ? `/mobile/support/tickets?${ticketQueryString}` : "/mobile/support/tickets";

  const supportQuery = useQuery({
    queryKey: ["mobile-support", ticketQueryString],
    retry: 1,
    queryFn: async () => (await authorizedRequest<SupportTicket[]>(supportPath)).data,
  });
  const tickets = useMemo(() => supportQuery.data ?? [], [supportQuery.data]);
  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null, [selectedTicketId, tickets]);

  useEffect(() => {
    setSelectedTicketId(null);
    setReplyMessage("");
    setFeedback(null);
  }, [selectedBranchId]);

  useEffect(() => {
    if (params.ticketId && typeof params.ticketId === "string") {
      setSelectedTicketId(params.ticketId);
    }
  }, [params.ticketId]);

  const createTicketMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/mobile/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject,
          category,
          message,
        }),
      }),
    onSuccess: async (payload) => {
      setSubject("");
      setMessage("");
      setFeedback(copy.common.successUpdated);
      const data = payload.data as { id?: string };
      if (data.id) {
        setSelectedTicketId(data.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["mobile-support"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-support-tab"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, ticketId }: { status: (typeof STAFF_STATUSES)[number]; ticketId: string }) =>
      authorizedRequest(`/mobile/support/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-support"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-support-tab"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-admin-operations-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-admin-home"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicket) {
        throw new Error(copy.supportScreen.pickTicket);
      }
      return authorizedRequest(`/mobile/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: replyMessage }),
      });
    },
    onSuccess: async () => {
      setReplyMessage("");
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-support"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-support-tab"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const attachmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicket) {
        throw new Error(copy.supportScreen.pickTicket);
      }
      const [asset] = await pickImagesFromLibrary({ permissionDeniedMessage: copy.common.photoPermissionDenied });
      if (!asset) {
        return null;
      }
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType,
      } as never);
      if (replyMessage.trim()) {
        formData.append("message", replyMessage.trim());
      }
      return authorizedRequest(`/mobile/support/tickets/${selectedTicket.id}/attachments`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async (payload) => {
      if (!payload) {
        return;
      }
      setReplyMessage("");
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-support"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-support-tab"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  return (
    <Screen title={copy.common.support} subtitle={copy.supportScreen.subtitle}>
      {customer ? (
        <Card>
          <SectionTitle>{copy.supportScreen.newTicket}</SectionTitle>
          <Input value={subject} onChangeText={setSubject} placeholder={copy.supportScreen.subjectPlaceholder} accessibilityLabel={copy.supportScreen.subjectPlaceholder} />
          <View style={[styles.categoryList, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {CATEGORIES.map((item) => {
              const active = item === category;
              return (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.cardAlt, borderColor: theme.border }]}
                >
                  <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.mono }}>
                    {localizeTicketCategory(item, isRTL)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextArea value={message} onChangeText={setMessage} placeholder={copy.supportScreen.messagePlaceholder} accessibilityLabel={copy.supportScreen.messagePlaceholder} />
          <PrimaryButton onPress={() => createTicketMutation.mutate()} disabled={createTicketMutation.isPending || !subject.trim() || !message.trim()}>
            {createTicketMutation.isPending ? copy.supportScreen.creatingTicket : copy.supportScreen.newTicket}
          </PrimaryButton>
        </Card>
      ) : null}

      {!customer ? (
        <Card>
          <SectionTitle>{copy.supportScreen.filters}</SectionTitle>
          <ChipRow
            items={QUEUE_FILTERS.map((item) => ({ id: item, label: queueFilterLabel(item, copy) }))}
            activeId={queueFilter}
            onSelect={(id) => setQueueFilter(id as typeof queueFilter)}
          />
          <ChipRow
            items={["ALL", ...CATEGORIES].map((item) => ({ id: item, label: item === "ALL" ? copy.supportScreen.all : localizeTicketCategory(item, isRTL) }))}
            activeId={categoryFilter}
            onSelect={(id) => setCategoryFilter(id as typeof categoryFilter)}
          />
        </Card>
      ) : null}

      <QueryState
        loading={supportQuery.isLoading && !supportQuery.data}
        loadingVariant="list"
        error={supportQuery.error instanceof Error ? supportQuery.error.message : null}
        empty={!supportQuery.isLoading && tickets.length === 0}
        emptyMessage={copy.supportScreen.noTickets}
      />

      {tickets.length > 0 ? (
        <>
          <Card>
            <SectionTitle>{copy.common.support}</SectionTitle>
            {tickets.map((ticket) => {
              const active = selectedTicket?.id === ticket.id;
              return (
                <Pressable
                  key={ticket.id}
                  onPress={() => setSelectedTicketId(ticket.id)}
                  style={[styles.ticketItem, { borderTopColor: theme.border, backgroundColor: active ? theme.cardAlt : "transparent", borderColor: active ? theme.primary : theme.border }]}
                >
                  <View style={[styles.ticketHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.ticketTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {ticket.subject}
                    </Text>
                    <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 11, fontWeight: "800" }}>
                      {localizeTicketStatus(ticket.status, isRTL)}
                    </Text>
                  </View>
                  <MutedText>{localizeTicketCategory(ticket.category, isRTL)}</MutedText>
                </Pressable>
              );
            })}
          </Card>

          {selectedTicket ? (
            <Card>
              <SectionTitle>{selectedTicket.subject}</SectionTitle>
              {canHandleSupport ? (
                <>
                  <MutedText>{copy.supportScreen.setStatus}</MutedText>
                  <ChipRow
                    items={STAFF_STATUSES.map((status) => ({ id: status, label: supportStatusActionLabel(status, copy) }))}
                    activeId={selectedTicket.status}
                    onSelect={(status) => statusMutation.mutate({ ticketId: selectedTicket.id, status: status as (typeof STAFF_STATUSES)[number] })}
                    disabled={statusMutation.isPending}
                  />
                </>
              ) : null}
              {selectedTicket.messages.length === 0 ? (
                <MutedText>{copy.common.noMessagesYet}</MutedText>
              ) : (
                selectedTicket.messages.map((item) => (
                  <View key={item.id} style={[styles.messageRow, { borderTopColor: theme.border, backgroundColor: theme.cardAlt }]}>
                    <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                      {item.message}
                    </Text>
                    <MediaPreview uri={item.media_url} mime={item.media_mime} label={item.media_url ? copy.common.attachPhoto : item.media_mime} />
                    <MutedText>{new Date(item.created_at).toLocaleString(locale)}</MutedText>
                  </View>
                ))
              )}
              <TextArea value={replyMessage} onChangeText={setReplyMessage} placeholder={copy.supportScreen.messagePlaceholder} accessibilityLabel={copy.supportScreen.messagePlaceholder} />
              <View style={styles.actionRow}>
                <PrimaryButton onPress={() => replyMutation.mutate()} disabled={replyMutation.isPending || !replyMessage.trim()}>
                  {replyMutation.isPending ? copy.supportScreen.sendingReply : copy.supportScreen.sendReply}
                </PrimaryButton>
                <SecondaryButton onPress={() => attachmentMutation.mutate()} disabled={attachmentMutation.isPending}>
                  {attachmentMutation.isPending ? copy.common.uploading : copy.common.attachPhoto}
                </SecondaryButton>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      {feedback ? (
        <Card>
          <MutedText>{feedback}</MutedText>
        </Card>
      ) : null}
    </Screen>
  );
}

function ChipRow({
  activeId,
  disabled,
  items,
  onSelect,
}: {
  activeId: string;
  disabled?: boolean;
  items: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  const { fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={[styles.categoryList, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Pressable
            key={item.id}
            disabled={disabled}
            onPress={() => onSelect(item.id)}
            style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.cardAlt, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }]}
          >
            <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.mono }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function queueFilterLabel(filter: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (filter === "active") {
    return copy.supportScreen.active;
  }
  if (filter === "resolvedClosed") {
    return copy.supportScreen.resolvedClosed;
  }
  return copy.supportScreen.all;
}

function supportStatusActionLabel(status: string, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (status === "IN_PROGRESS") {
    return copy.supportScreen.inProgressStatus;
  }
  if (status === "RESOLVED") {
    return copy.supportScreen.resolvedStatus;
  }
  if (status === "CLOSED") {
    return copy.supportScreen.closedStatus;
  }
  return copy.supportScreen.openStatus;
}

const styles = StyleSheet.create({
  categoryList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ticketItem: {
    gap: 4,
    borderTopWidth: 1,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 8,
  },
  ticketHead: {
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  ticketTitle: {
    flex: 1,
  },
  messageRow: {
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 8,
  },
  actionRow: {
    flexDirection: "column",
    gap: 10,
  },
});
