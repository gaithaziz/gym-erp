import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MediaPreview, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { pickImagesFromLibrary } from "@/lib/media-picker";
import { localizeTicketCategory, localizeTicketStatus, localeTag } from "@/lib/mobile-format";
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

function subscriptionSupportSubject(type: string, isRTL: boolean) {
  const labels: Record<string, { en: string; ar: string }> = {
    freeze: { en: "Subscription freeze request", ar: "طلب تجميد الاشتراك" },
    unfreeze: { en: "Subscription unfreeze request", ar: "طلب إلغاء تجميد الاشتراك" },
    extend: { en: "Subscription extension request", ar: "طلب تمديد الاشتراك" },
    support: { en: "Subscription support request", ar: "طلب دعم الاشتراك" },
  };
  return (labels[type] ?? labels.support)[isRTL ? "ar" : "en"];
}

function subscriptionSupportMessage(type: string, isRTL: boolean) {
  const labels: Record<string, { en: string; ar: string }> = {
    freeze: { en: "I want to request freezing my subscription.", ar: "أريد طلب تجميد اشتراكي." },
    unfreeze: { en: "I want to request unfreezing my subscription.", ar: "أريد طلب إلغاء تجميد اشتراكي." },
    extend: { en: "I want to request activating or extending my subscription.", ar: "أريد طلب تفعيل أو تمديد اشتراكي." },
    support: { en: "I need help with my subscription.", ar: "أحتاج مساعدة بخصوص اشتراكي." },
  };
  return (labels[type] ?? labels.support)[isRTL ? "ar" : "en"];
}

export default function SupportScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("GENERAL");
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
    setSubject(subscriptionSupportSubject(requestType, isRTL));
    setMessage(subscriptionSupportMessage(requestType, isRTL));
  }, [isRTL, message, params.type, subject]);

  const supportQuery = useQuery({
    queryKey: ["mobile-support"],
    retry: 1,
    queryFn: async () => (await authorizedRequest<SupportTicket[]>("/mobile/customer/support/tickets")).data,
  });
  const tickets = supportQuery.data ?? [];
  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null, [selectedTicketId, tickets]);

  const createTicketMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/mobile/customer/support/tickets", {
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
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicket) {
        throw new Error(copy.supportScreen.pickTicket);
      }
      return authorizedRequest(`/mobile/customer/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: replyMessage }),
      });
    },
    onSuccess: async () => {
      setReplyMessage("");
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-support"] });
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
      return authorizedRequest(`/mobile/customer/support/tickets/${selectedTicket.id}/attachments`, {
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
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  return (
    <Screen title={copy.common.support} subtitle={copy.supportScreen.subtitle}>
      <Card>
        <SectionTitle>{copy.supportScreen.newTicket}</SectionTitle>
        <Input value={subject} onChangeText={setSubject} placeholder={copy.supportScreen.subjectPlaceholder} />
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
        <TextArea value={message} onChangeText={setMessage} placeholder={copy.supportScreen.messagePlaceholder} />
        <PrimaryButton onPress={() => createTicketMutation.mutate()} disabled={createTicketMutation.isPending || !subject.trim() || !message.trim()}>
          {createTicketMutation.isPending ? copy.supportScreen.creatingTicket : copy.supportScreen.newTicket}
        </PrimaryButton>
      </Card>

      <QueryState
        loading={supportQuery.isLoading && !supportQuery.data}
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
              <TextArea value={replyMessage} onChangeText={setReplyMessage} placeholder={copy.supportScreen.messagePlaceholder} />
              <View style={[styles.actionRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
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

const styles = StyleSheet.create({
  categoryList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
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
    borderRadius: 10,
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
    borderRadius: 10,
  },
  actionRow: {
    gap: 10,
    alignItems: "center",
  },
});
