import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Card, Input, MediaPreview, MutedText, QueryState, Screen } from "@/components/ui";
import { localeTag, localizeMessageType } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type Thread = {
  id: string;
  unread_count: number;
  customer: { full_name?: string | null };
  coach: { id?: string | null; full_name?: string | null };
  last_message?: { text_content?: string | null; created_at: string } | null;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  text_content?: string | null;
  message_type: string;
  created_at: string;
  media_url?: string | null;
  media_mime?: string | null;
};

type ChatContact = {
  id: string;
  full_name?: string | null;
  email: string;
  role: string;
};

export default function ChatScreen() {
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const currentUserId = bootstrap?.user.id ?? null;
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const contactsQuery = useQuery({
    queryKey: ["mobile-chat-contacts"],
    queryFn: async () => (await authorizedRequest<ChatContact[]>("/mobile/customer/chat/coaches")).data,
  });
  const contacts = contactsQuery.data ?? [];

  useEffect(() => {
    if (contacts.length > 0 && !selectedCoachId) {
      setSelectedCoachId(contacts[0].id);
    }
  }, [contacts, selectedCoachId]);

  const threadsQuery = useQuery({
    queryKey: ["mobile-chat"],
    queryFn: async () => (await authorizedRequest<Thread[]>("/mobile/customer/chat/threads")).data,
  });
  const threads = threadsQuery.data ?? [];

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null,
    [selectedThreadId, threads],
  );

  const messagesQuery = useQuery({
    queryKey: ["mobile-chat-messages", selectedThread?.id],
    enabled: Boolean(selectedThread?.id),
    queryFn: async () => (await authorizedRequest<ChatMessage[]>(`/mobile/customer/chat/threads/${selectedThread?.id}/messages`)).data,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedThread) {
        throw new Error(copy.chatScreen.pickThread);
      }
      return authorizedRequest(`/mobile/customer/chat/threads/${selectedThread.id}/read`, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
    },
  });

  useEffect(() => {
    if (selectedThread?.id && selectedThread.unread_count > 0 && !markReadMutation.isPending) {
      markReadMutation.mutate();
    }
  }, [markReadMutation, selectedThread?.id, selectedThread?.unread_count]);

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCoachId) {
        throw new Error(copy.chatScreen.noCoaches);
      }
      return authorizedRequest<{ id: string }>("/mobile/customer/chat/threads", {
        method: "POST",
        body: JSON.stringify({ coach_id: selectedCoachId }),
      });
    },
    onSuccess: async (payload) => {
      setFeedback(copy.chatScreen.threadStarted);
      setSelectedThreadId(payload.data.id);
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedThread) {
        throw new Error(copy.chatScreen.pickThread);
      }
      return authorizedRequest(`/mobile/customer/chat/threads/${selectedThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text_content: messageText }),
      });
    },
    onSuccess: async () => {
      setMessageText("");
      setFeedback(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat-messages", selectedThread?.id] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const attachmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedThread) {
        throw new Error(copy.chatScreen.pickThread);
      }
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets[0]) {
        return null;
      }
      const asset = picked.assets[0];
      const formData = new FormData();
      formData.append(
        "file",
        {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? "application/octet-stream",
        } as never,
      );
      if (messageText.trim()) {
        formData.append("text_content", messageText.trim());
      }
      return authorizedRequest(`/mobile/customer/chat/threads/${selectedThread.id}/attachments`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async (payload) => {
      if (!payload) {
        return;
      }
      setMessageText("");
      setFeedback(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat-messages", selectedThread?.id] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const threadsLoading = threadsQuery.isLoading || contactsQuery.isLoading;
  const threadError =
    (threadsQuery.error instanceof Error ? threadsQuery.error.message : null) ||
    (contactsQuery.error instanceof Error ? contactsQuery.error.message : null);
  const selectedCoach = contacts.find((contact) => contact.id === selectedCoachId) ?? null;

  return (
    <Screen title={copy.common.chat} subtitle={copy.chatScreen.subtitle} scrollable={false} hideFloatingChat>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        style={styles.flex}
      >
        <View style={styles.flex}>
          <QueryState loading={threadsLoading} error={threadError} />
          {!threadsLoading && !threadError ? (
            <>
              <View style={styles.topStack}>
                <Card style={[styles.composerCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <View style={[styles.headerLine, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.flex}>
                      <Text
                        style={[
                          styles.titleText,
                          {
                            color: theme.foreground,
                            fontFamily: fontSet.display,
                            textAlign: isRTL ? "right" : "left",
                            writingDirection: direction,
                          },
                        ]}
                      >
                        {copy.chatScreen.startThread}
                      </Text>
                      <MutedText>{copy.chatScreen.subtitleStart}</MutedText>
                    </View>
                    {selectedThread ? (
                      <View style={[styles.activePill, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
                        <Text style={[styles.activePillText, { color: theme.primary, fontFamily: fontSet.mono }]}>
                          {selectedThread.unread_count > 0 ? copy.chatScreen.unreadActive : copy.chatScreen.liveNow}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {contacts.length === 0 ? (
                    <MutedText>{copy.chatScreen.noCoaches}</MutedText>
                  ) : (
                    <>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[styles.horizontalList, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                      >
                        {contacts.map((contact) => {
                          const active = selectedCoachId === contact.id;
                          return (
                            <Pressable
                              key={contact.id}
                              onPress={() => setSelectedCoachId(contact.id)}
                              style={[
                                styles.coachChip,
                                {
                                  backgroundColor: active ? theme.primarySoft : theme.card,
                                  borderColor: active ? theme.primary : theme.border,
                                },
                              ]}
                            >
                              <Text style={[styles.coachName, { color: active ? theme.primary : theme.foreground, fontFamily: fontSet.body }]}>
                                {contact.full_name || contact.email}
                              </Text>
                              <Text style={[styles.coachEmail, { color: theme.muted, fontFamily: fontSet.body }]}>
                                {contact.email}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                      {selectedCoach ? (
                        <Text
                          style={[
                            styles.selectedCoachLabel,
                            {
                              color: theme.muted,
                              fontFamily: fontSet.body,
                              textAlign: isRTL ? "right" : "left",
                              writingDirection: direction,
                            },
                          ]}
                        >
                          {copy.chatScreen.selectedCoachLabel} {selectedCoach.full_name || selectedCoach.email}
                        </Text>
                      ) : null}
                    </>
                  )}

                  <Pressable
                    onPress={() => createThreadMutation.mutate()}
                    disabled={createThreadMutation.isPending || !selectedCoachId}
                    style={[
                      styles.newChatButton,
                      {
                        backgroundColor: theme.primary,
                        opacity: createThreadMutation.isPending || !selectedCoachId ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
                    <Text
                      style={[
                        styles.newChatText,
                        {
                          fontFamily: fontSet.body,
                        },
                      ]}
                    >
                      {createThreadMutation.isPending ? copy.chatScreen.creatingThread : copy.chatScreen.newConversation}
                    </Text>
                  </Pressable>
                </Card>

                {threads.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.horizontalList, styles.threadStrip, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  >
                    {threads.map((thread) => {
                      const active = selectedThread?.id === thread.id;
                      return (
                        <Pressable
                          key={thread.id}
                          onPress={() => setSelectedThreadId(thread.id)}
                          style={[
                            styles.threadChip,
                            {
                              backgroundColor: active ? theme.cardAlt : theme.card,
                              borderColor: active ? theme.primary : theme.border,
                            },
                          ]}
                        >
                          <Text style={[styles.threadName, { color: theme.foreground, fontFamily: fontSet.body }]}>
                            {thread.coach.full_name || copy.common.coach}
                          </Text>
                          <Text style={[styles.threadSnippet, { color: theme.muted, fontFamily: fontSet.body }]}>
                            {thread.last_message?.text_content || copy.common.noMessagesYet}
                          </Text>
                          {thread.unread_count > 0 ? (
                            <View style={[styles.threadUnreadBadge, { backgroundColor: theme.primary }]}>
                              <Text style={[styles.threadUnreadText, { fontFamily: fontSet.mono }]}>{thread.unread_count}</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Card>
                    <MutedText>{copy.chatScreen.noThreads}</MutedText>
                  </Card>
                )}
              </View>

              <View style={[styles.messagesPane, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {selectedThread ? (
                  <>
                    <View style={[styles.conversationHeader, { borderBottomColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <View style={styles.flex}>
                        <Text
                          style={[
                            styles.conversationTitle,
                            {
                              color: theme.foreground,
                              fontFamily: fontSet.display,
                              textAlign: isRTL ? "right" : "left",
                              writingDirection: direction,
                            },
                          ]}
                        >
                          {selectedThread.coach.full_name || copy.common.coach}
                        </Text>
                        <MutedText>{copy.chatScreen.threadHint}</MutedText>
                      </View>
                      <View style={[styles.liveDot, { backgroundColor: theme.primary }]} />
                    </View>

                    <ScrollView
                      style={styles.messagesScroll}
                      contentContainerStyle={styles.messageList}
                      showsVerticalScrollIndicator={false}
                    >
                      <QueryState
                        loading={messagesQuery.isLoading}
                        error={messagesQuery.error instanceof Error ? messagesQuery.error.message : null}
                        empty={!messagesQuery.isLoading && (messagesQuery.data?.length ?? 0) === 0}
                        emptyMessage={copy.common.noMessagesYet}
                      />
                      {messagesQuery.data?.map((item) => {
                        const isOwn = currentUserId != null && item.sender_id === currentUserId;
                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.messageRow,
                              {
                                alignItems: isOwn
                                  ? (isRTL ? "flex-start" : "flex-end")
                                  : (isRTL ? "flex-end" : "flex-start"),
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.messageBubble,
                                {
                                  backgroundColor: isOwn ? theme.primary : theme.cardAlt,
                                  borderColor: isOwn ? theme.primary : theme.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.messageText,
                                  {
                                    color: isOwn ? "#FFFFFF" : theme.foreground,
                                    fontFamily: fontSet.body,
                                    textAlign: isRTL ? "right" : "left",
                                    writingDirection: direction,
                                  },
                                ]}
                              >
                                {item.text_content || localizeMessageType(item.message_type, isRTL)}
                              </Text>
                              <MediaPreview
                                uri={item.media_url}
                                mime={item.media_mime}
                                label={item.media_url ? localizeMessageType(item.message_type, isRTL) : null}
                              />
                              <Text
                                style={[
                                  styles.messageTime,
                                  {
                                    color: isOwn ? "rgba(255,255,255,0.8)" : theme.muted,
                                    fontFamily: fontSet.mono,
                                    textAlign: isRTL ? "right" : "left",
                                  },
                                ]}
                              >
                                {new Date(item.created_at).toLocaleTimeString(locale, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>

                    <View style={[styles.composerBar, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Pressable
                        onPress={() => attachmentMutation.mutate()}
                        disabled={attachmentMutation.isPending}
                        style={[styles.iconButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                      >
                        <Ionicons name="attach" size={18} color={theme.primary} />
                      </Pressable>
                      <Input
                        value={messageText}
                        onChangeText={setMessageText}
                        placeholder={copy.chatScreen.messagePlaceholder}
                        style={styles.messageInput}
                      />
                      <Pressable
                        onPress={() => sendMessageMutation.mutate()}
                        disabled={sendMessageMutation.isPending || !messageText.trim()}
                        style={[
                          styles.sendButton,
                          {
                            backgroundColor: theme.primary,
                            opacity: sendMessageMutation.isPending || !messageText.trim() ? 0.6 : 1,
                          },
                        ]}
                      >
                        <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={18} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyConversation}>
                    <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.primary} />
                    <MutedText>{copy.chatScreen.pickThread}</MutedText>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {feedback ? (
            <Card>
              <MutedText>{feedback}</MutedText>
            </Card>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  composerCard: {
    gap: 10,
    paddingVertical: 14,
  },
  topStack: {
    gap: 10,
  },
  headerLine: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  titleText: {
    fontSize: 22,
    fontWeight: "800",
  },
  activePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  horizontalList: {
    gap: 10,
  },
  coachChip: {
    width: 168,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  coachName: {
    fontSize: 14,
    fontWeight: "700",
  },
  coachEmail: {
    fontSize: 12,
  },
  selectedCoachLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  newChatButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  newChatText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  threadStrip: {
    paddingBottom: 4,
  },
  threadChip: {
    width: 164,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  threadName: {
    fontSize: 15,
    fontWeight: "700",
  },
  threadSnippet: {
    fontSize: 12,
    lineHeight: 18,
  },
  threadUnreadBadge: {
    alignSelf: "flex-start",
    minWidth: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "center",
  },
  threadUnreadText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  messagesPane: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
  },
  messagesScroll: {
    flex: 1,
    minHeight: 0,
  },
  conversationHeader: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  conversationTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    flexGrow: 1,
  },
  messageRow: {
    width: "100%",
  },
  messageBubble: {
    maxWidth: "86%",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 11,
    fontWeight: "700",
  },
  composerBar: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderRadius: 999,
    paddingVertical: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyConversation: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
});
