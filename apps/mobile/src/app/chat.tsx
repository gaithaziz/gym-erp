import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { API_BASE_URL } from "@/lib/api";
import { Card, Input, MediaPreview, MutedText, QueryState, Screen } from "@/components/ui";
import { pickImageOrVideoFromLibrary } from "@/lib/media-picker";
import { localeTag, localizeMessageType, localizeRole } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";

type Thread = {
  id: string;
  unread_count: number;
  customer: { id?: string | null; full_name?: string | null };
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
  voice_duration_seconds?: number | null;
};

type ChatContact = {
  id: string;
  full_name?: string | null;
  email: string;
  role: string;
};

type PendingVoiceUpload = {
  durationSeconds: number;
  mimeType: string;
  uri: string;
};

function formatDuration(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatThreadName(thread: Thread | null | undefined, role: string | null, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (!thread) return copy.common.chat;
  const customerName = thread.customer.full_name || copy.common.customer;
  const coachName = thread.coach.full_name || copy.common.coach;
  if (role === "COACH") return customerName;
  if (role === "CUSTOMER") return coachName;
  return `${customerName} - ${coachName}`;
}

function formatThreadParticipants(thread: Thread | null | undefined, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (!thread) return null;
  const customerName = thread.customer.full_name || copy.common.customer;
  const coachName = thread.coach.full_name || copy.common.coach;
  return `${copy.common.customer}: ${customerName} • ${copy.common.coach}: ${coachName}`;
}

function formatThreadSecondaryLabel(thread: Thread | null | undefined, role: string | null, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (!thread) return null;
  const customerName = thread.customer.full_name || copy.common.customer;
  const coachName = thread.coach.full_name || copy.common.coach;
  if (role === "COACH") return `${copy.common.customer}: ${customerName}`;
  if (role === "CUSTOMER") return `${copy.common.coach}: ${coachName}`;
  return formatThreadParticipants(thread, copy);
}

function formatMessageSender(
  message: ChatMessage,
  thread: Thread | null | undefined,
  currentUserId: string | null,
  role: string | null,
  copy: ReturnType<typeof usePreferences>["copy"],
  isRTL: boolean,
) {
  if (thread?.customer.id && message.sender_id === thread.customer.id) {
    return `${copy.common.customer}: ${thread.customer.full_name || copy.common.customer}`;
  }
  if (thread?.coach.id && message.sender_id === thread.coach.id) {
    return `${copy.common.coach}: ${thread.coach.full_name || copy.common.coach}`;
  }
  if (currentUserId && message.sender_id === currentUserId && role) {
    return localizeRole(role, isRTL);
  }
  return copy.common.chat;
}

function ChatAudioPlayer({
  src,
  initialDurationSeconds,
}: {
  src: string;
  initialDurationSeconds?: number | null;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const player = useAudioPlayer(src);
  const status = useAudioPlayerStatus(player);

  const durationSeconds = status.duration ? Math.round(status.duration / 1000) : (initialDurationSeconds ?? 0);

  function togglePlayback() {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  return (
    <View style={[styles.audioPlayer, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Pressable onPress={togglePlayback} style={[styles.audioButton, { backgroundColor: theme.primary }]}>
        <Ionicons name={status.playing ? "pause" : "play"} size={16} color="#FFFFFF" />
      </Pressable>
      <Text style={[styles.audioDuration, { color: theme.foreground, fontFamily: fontSet.mono }]}>
        {formatDuration(durationSeconds)}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string; memberId?: string }>();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const readOnly = isAdminControlRole(role);
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const currentUserId = bootstrap?.user.id ?? null;
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [composerHeight, setComposerHeight] = useState(44);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showNewChatPanel, setShowNewChatPanel] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [threadDropdownOpen, setThreadDropdownOpen] = useState(false);
  const [pendingVoiceUpload, setPendingVoiceUpload] = useState<PendingVoiceUpload | null>(null);
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recording = recorderState.isRecording;
  const recordSeconds = Math.round(recorderState.durationMillis / 1000);

  const contactsQuery = useQuery({
    queryKey: ["mobile-chat-contacts"],
    enabled: !readOnly,
    queryFn: async () => (await authorizedRequest<ChatContact[]>("/mobile/chat/contacts")).data,
  });
  const contacts = contactsQuery.data ?? [];

  useEffect(() => {
    if (!readOnly && contacts.length > 0 && !selectedCoachId) {
      setSelectedCoachId(contacts[0].id);
    }
  }, [contacts, readOnly, selectedCoachId]);

  useEffect(() => {
    if (!readOnly && params.contactId && typeof params.contactId === "string") {
      setSelectedCoachId(params.contactId);
      setShowNewChatPanel(true);
    }
  }, [params.contactId, readOnly]);

  const deferredContactSearch = useDeferredValue(contactSearch);
  const filteredContacts = useMemo(() => {
    const query = deferredContactSearch.trim().toLowerCase();
    if (!query) {
      return contacts;
    }
    return contacts.filter((contact) => {
      const name = (contact.full_name || "").toLowerCase();
      const email = contact.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [contacts, deferredContactSearch]);

  const threadsQuery = useQuery({
    queryKey: ["mobile-chat"],
    queryFn: async () => (await authorizedRequest<Thread[]>("/mobile/chat/threads")).data,
  });
  const threads = threadsQuery.data ?? [];
  const deferredThreadSearch = useDeferredValue(threadSearch);
  const filteredThreads = useMemo(() => {
    const query = deferredThreadSearch.trim().toLowerCase();
    if (!query) {
      return threads;
    }
    return threads.filter((thread) => {
      const name = (
        role === "COACH" ? thread.customer.full_name || "" : thread.coach.full_name || ""
      ).toLowerCase();
      const emailish = role === "COACH" ? thread.customer.full_name || "" : thread.coach.full_name || "";
      const preview = thread.last_message?.text_content?.toLowerCase() || "";
      return name.includes(query) || emailish.toLowerCase().includes(query) || preview.includes(query);
    });
  }, [deferredThreadSearch, role, threads]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null);
      return;
    }
    if (role === "COACH" && params.memberId && typeof params.memberId === "string") {
      const matchingThread = threads.find((thread) => thread.customer.id === params.memberId);
      if (matchingThread) {
        setSelectedThreadId(matchingThread.id);
        return;
      }
    }
    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [params.memberId, role, selectedThreadId, threads]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null,
    [selectedThreadId, threads],
  );

  const messagesQuery = useQuery({
    queryKey: ["mobile-chat-messages", selectedThread?.id],
    enabled: Boolean(selectedThread?.id),
    queryFn: async () => (await authorizedRequest<ChatMessage[]>(`/mobile/chat/threads/${selectedThread?.id}/messages`)).data,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedThread) {
        throw new Error(copy.chatScreen.pickThread);
      }
      return authorizedRequest(`/mobile/chat/threads/${selectedThread.id}/read`, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
    },
  });

  useEffect(() => {
    if (!readOnly && selectedThread?.id && selectedThread.unread_count > 0 && !markReadMutation.isPending) {
      markReadMutation.mutate();
    }
  }, [markReadMutation, readOnly, selectedThread?.id, selectedThread?.unread_count]);

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCoachId) {
        throw new Error(copy.chatScreen.noCoaches);
      }
      return authorizedRequest<{ id: string }>("/mobile/chat/threads", {
        method: "POST",
        body: JSON.stringify(role === "COACH" ? { customer_id: selectedCoachId } : { coach_id: selectedCoachId }),
      });
    },
    onSuccess: async (payload) => {
      setFeedback(copy.chatScreen.threadStarted);
      setSelectedThreadId(payload.data.id);
      setShowNewChatPanel(false);
      setContactDropdownOpen(false);
      setContactSearch("");
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
      return authorizedRequest(`/mobile/chat/threads/${selectedThread.id}/messages`, {
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
      const [asset] = await pickImageOrVideoFromLibrary({ permissionDeniedMessage: copy.common.photoPermissionDenied });
      if (!asset) {
        return null;
      }
      const formData = new FormData();
      formData.append(
        "file",
        {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType,
        } as never,
      );
      if (messageText.trim()) {
        formData.append("text_content", messageText.trim());
      }
      return authorizedRequest(`/mobile/chat/threads/${selectedThread.id}/attachments`, {
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

  const voiceUploadMutation = useMutation({
    mutationFn: async ({
      uri,
      durationSeconds,
      mimeType,
    }: {
      uri: string;
      durationSeconds: number;
      mimeType: string;
    }) => {
      if (!selectedThread) {
        throw new Error(copy.chatScreen.pickThread);
      }
      const formData = new FormData();
      formData.append(
        "file",
        {
          uri,
          name: `voice-note-${Date.now()}.m4a`,
          type: mimeType,
        } as never,
      );
      formData.append("voice_duration_seconds", String(durationSeconds));
      return authorizedRequest(`/mobile/chat/threads/${selectedThread.id}/attachments`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async () => {
      setPendingVoiceUpload(null);
      setFeedback(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat-messages", selectedThread?.id] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const threadsLoading = threadsQuery.isLoading || (!readOnly && contactsQuery.isLoading);
  const threadError =
    (threadsQuery.error instanceof Error ? threadsQuery.error.message : null) ||
    (!readOnly && contactsQuery.error instanceof Error ? contactsQuery.error.message : null);
  const selectedCoach = contacts.find((contact) => contact.id === selectedCoachId) ?? null;
  const selectedThreadName = formatThreadName(selectedThread, role, copy);
  const selectedThreadMeta = formatThreadSecondaryLabel(selectedThread, role, copy);
  const voiceNotesAvailable = true;

  useEffect(() => {
    if (!selectedThread?.id || !messagesQuery.data) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [messagesQuery.data, selectedThread?.id]);

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        recorder.stop();
      }
    };
  }, [recorder, recorderState.isRecording]);

  async function uploadVoiceNoteDirect(pending: PendingVoiceUpload) {
    await voiceUploadMutation.mutateAsync({
      uri: pending.uri,
      durationSeconds: pending.durationSeconds,
      mimeType: pending.mimeType,
    });
  }

  async function startVoiceRecording() {
    if (recording || !selectedThread) {
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error(copy.chatScreen.microphoneUnavailable);
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : copy.chatScreen.microphoneUnavailable);
    }
  }

  async function stopVoiceRecording({ directSend }: { directSend: boolean }) {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (!uri) {
        return;
      }

      const pending = {
        uri,
        durationSeconds: recordSeconds,
        mimeType: "audio/mp4",
      };

      if (directSend) {
        await uploadVoiceNoteDirect(pending);
        return;
      }

      setPendingVoiceUpload(pending);
    } catch {
      setFeedback(copy.common.errorTryAgain);
    }
  }

  return (
    <Screen
      title={selectedThread ? selectedThreadName : copy.common.chat}
      subtitle={selectedThread ? copy.chatScreen.threadHint : copy.chatScreen.subtitle}
      scrollable={false}
      compactTitle
      hideFloatingChat
      contentPaddingBottom={0}
      leadingAction={
        <Pressable
          onPress={() => router.replace("/(tabs)/home")}
          style={[styles.headerActionButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={18} color={theme.primary} />
        </Pressable>
      }
      action={
        readOnly ? null :
        <Pressable
          onPress={() => setShowNewChatPanel((current) => !current)}
          style={[styles.headerActionButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name={showNewChatPanel ? "close" : "add"} size={18} color={theme.primary} />
        </Pressable>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        style={styles.flex}
      >
        <View style={styles.flex}>
          <QueryState loading={threadsLoading} loadingVariant="chat" skeletonCount={5} error={threadError} />
          {!threadsLoading && !threadError ? (
            <>
              {threads.length > 0 ? (
                <View style={styles.threadPickerStack}>
                  <Input
                    value={threadSearch}
                    onChangeText={(value) => {
                      setThreadSearch(value);
                      if (!threadDropdownOpen) {
                        setThreadDropdownOpen(true);
                      }
                    }}
                    onFocus={() => setThreadDropdownOpen(true)}
                    placeholder={copy.chatScreen.searchThreadsPlaceholder}
                  />
                  <Pressable
                    onPress={() => setThreadDropdownOpen((current) => !current)}
                    style={[
                      styles.contactPickerTrigger,
                      {
                        backgroundColor: theme.cardAlt,
                        borderColor: theme.border,
                        flexDirection: isRTL ? "row-reverse" : "row",
                      },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text
                        style={[
                          styles.coachRowName,
                          {
                            color: theme.foreground,
                            fontFamily: fontSet.body,
                            textAlign: isRTL ? "right" : "left",
                            writingDirection: direction,
                          },
                        ]}
                      >
                        {selectedThread ? selectedThreadName : copy.chatScreen.threadPickerPlaceholder}
                      </Text>
                      {selectedThread ? (
                        <Text
                          style={[
                            styles.coachRowEmail,
                            {
                              color: theme.muted,
                              fontFamily: fontSet.body,
                              textAlign: isRTL ? "right" : "left",
                              writingDirection: direction,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {[selectedThreadMeta, selectedThread.last_message?.text_content || copy.common.noMessagesYet].filter(Boolean).join(" • ")}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name={threadDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} />
                  </Pressable>
                  {threadDropdownOpen ? (
                    <View style={[styles.contactDropdown, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.coachList}>
                        {filteredThreads.length === 0 ? (
                          <MutedText>{copy.chatScreen.noMatchingThreads}</MutedText>
                        ) : (
                          filteredThreads.map((thread) => {
                            const active = selectedThread?.id === thread.id;
                            return (
                              <Pressable
                                key={thread.id}
                                onPress={() => {
                                  setSelectedThreadId(thread.id);
                                  setThreadDropdownOpen(false);
                                }}
                                style={[
                                  styles.coachRow,
                                  {
                                    backgroundColor: active ? theme.primarySoft : theme.card,
                                    borderColor: active ? theme.primary : theme.border,
                                  },
                                ]}
                              >
                                <View style={styles.flex}>
                                  <Text
                                    style={[
                                      styles.coachRowName,
                                      {
                                        color: active ? theme.primary : theme.foreground,
                                        fontFamily: fontSet.body,
                                        textAlign: isRTL ? "right" : "left",
                                        writingDirection: direction,
                                      },
                                    ]}
                                  >
                                    {formatThreadName(thread, role, copy)}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.coachRowEmail,
                                      {
                                        color: theme.muted,
                                        fontFamily: fontSet.body,
                                        textAlign: isRTL ? "right" : "left",
                                        writingDirection: direction,
                                      },
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {[formatThreadSecondaryLabel(thread, role, copy), thread.last_message?.text_content || copy.common.noMessagesYet].filter(Boolean).join(" • ")}
                                  </Text>
                                </View>
                                {thread.unread_count > 0 ? (
                                  <View style={[styles.threadUnreadBadge, { backgroundColor: theme.primary }]}>
                                    <Text style={[styles.threadUnreadText, { fontFamily: fontSet.mono }]}>{thread.unread_count}</Text>
                                  </View>
                                ) : null}
                              </Pressable>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Card>
                  <MutedText>{copy.chatScreen.noThreads}</MutedText>
                </Card>
              )}

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
                          {selectedThreadName}
                        </Text>
                        <MutedText>{selectedThreadMeta || copy.chatScreen.threadHint}</MutedText>
                      </View>
                      <View style={styles.headerActionsStack}>
                        {role === "COACH" && selectedThread?.customer.id ? (
                          <Pressable
                            onPress={() => router.push({ pathname: "/(tabs)/members", params: { memberId: selectedThread.customer.id! } })}
                            style={[styles.threadActionButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                          >
                            <Ionicons name="person-outline" size={16} color={theme.primary} />
                          </Pressable>
                        ) : null}
                        <View style={[styles.liveDot, { backgroundColor: theme.primary }]} />
                      </View>
                    </View>

                    <ScrollView
                      ref={messagesScrollRef}
                      style={styles.messagesScroll}
                      contentContainerStyle={styles.messageList}
                      showsVerticalScrollIndicator={false}
                      onContentSizeChange={() => {
                        messagesScrollRef.current?.scrollToEnd({ animated: false });
                      }}
                    >
                      <QueryState
                        loading={messagesQuery.isLoading}
                        loadingVariant="thread"
                        skeletonCount={6}
                        error={messagesQuery.error instanceof Error ? messagesQuery.error.message : null}
                        empty={!messagesQuery.isLoading && (messagesQuery.data?.length ?? 0) === 0}
                        emptyMessage={copy.common.noMessagesYet}
                      />
                      {messagesQuery.data?.map((item) => {
                        const isOwn = currentUserId != null && item.sender_id === currentUserId;
                        const senderLabel = formatMessageSender(item, selectedThread, currentUserId, role, copy, isRTL);
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
                                  styles.messageSender,
                                  {
                                    color: isOwn ? "rgba(255,255,255,0.82)" : theme.primary,
                                    fontFamily: fontSet.body,
                                    textAlign: isRTL ? "right" : "left",
                                    writingDirection: direction,
                                  },
                                ]}
                              >
                                {senderLabel}
                              </Text>
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
                              {item.media_url && item.media_mime?.startsWith("audio/") ? (
                                <ChatAudioPlayer
                                  src={item.media_url.startsWith("http") ? item.media_url : `${ASSET_BASE_URL}${item.media_url}`}
                                  initialDurationSeconds={item.voice_duration_seconds}
                                />
                              ) : null}
                              <MediaPreview
                                uri={item.media_mime?.startsWith("audio/") ? null : item.media_url}
                                mime={item.media_mime}
                                label={item.media_url && !item.media_mime?.startsWith("audio/") ? localizeMessageType(item.message_type, isRTL) : null}
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

                    {readOnly ? (
                      <View style={[styles.readOnlyBar, { backgroundColor: theme.cardAlt, borderTopColor: theme.border }]}>
                        <Ionicons name="eye-outline" size={18} color={theme.primary} />
                        <View style={styles.flex}>
                          <Text
                            style={[
                              styles.readOnlyTitle,
                              {
                                color: theme.foreground,
                                fontFamily: fontSet.body,
                                textAlign: isRTL ? "right" : "left",
                                writingDirection: direction,
                              },
                            ]}
                          >
                            {copy.adminControl.readOnlyChat}
                          </Text>
                          <MutedText>{copy.adminControl.readOnlyChatHint}</MutedText>
                        </View>
                      </View>
                    ) : (
                    <View style={[styles.composerBar, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Pressable
                        onPress={() => attachmentMutation.mutate()}
                        disabled={attachmentMutation.isPending || recording}
                        style={[styles.iconButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                      >
                        <Ionicons name="attach" size={18} color={theme.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (!voiceNotesAvailable) {
                            setFeedback(copy.chatScreen.voiceUnavailable);
                            return;
                          }
                          void (recording ? stopVoiceRecording({ directSend: false }) : startVoiceRecording());
                        }}
                        disabled={voiceUploadMutation.isPending || Boolean(pendingVoiceUpload)}
                        style={[
                          styles.iconButton,
                          {
                            backgroundColor: theme.cardAlt,
                            borderColor: recording ? theme.primary : theme.border,
                            opacity: voiceNotesAvailable ? 1 : 0.55,
                          },
                        ]}
                      >
                        <Ionicons name={recording ? "stop" : "mic"} size={18} color={theme.primary} />
                      </Pressable>
                      <Input
                        value={messageText}
                        onChangeText={setMessageText}
                        placeholder={copy.chatScreen.messagePlaceholder}
                        multiline
                        onContentSizeChange={(event) => {
                          const nextHeight = Math.max(44, Math.min(120, event.nativeEvent.contentSize.height + 14));
                          setComposerHeight(nextHeight);
                        }}
                        style={[styles.messageInput, { height: composerHeight }]}
                        editable={!recording}
                      />
                      {recording ? (
                        <Pressable
                          onPress={() => void stopVoiceRecording({ directSend: true })}
                          disabled={voiceUploadMutation.isPending}
                          style={[styles.sendButton, { backgroundColor: theme.primary }]}
                        >
                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => sendMessageMutation.mutate()}
                        disabled={sendMessageMutation.isPending || !messageText.trim() || recording}
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
                    )}
                    {!readOnly && recording ? (
                      <View style={[styles.recordingBanner, { backgroundColor: theme.primarySoft, borderTopColor: theme.border }]}>
                        <View style={[styles.recordingDot, { backgroundColor: theme.primary }]} />
                        <Text style={[styles.recordingText, { color: theme.foreground, fontFamily: fontSet.body }]}>
                          {copy.chatScreen.recording} {recordSeconds}s
                        </Text>
                      </View>
                    ) : null}
                    {!readOnly && pendingVoiceUpload ? (
                      <View style={[styles.pendingVoicePanel, { backgroundColor: theme.cardAlt, borderTopColor: theme.border }]}>
                        <MutedText>{copy.chatScreen.voicePreview}</MutedText>
                        <ChatAudioPlayer src={pendingVoiceUpload.uri} initialDurationSeconds={pendingVoiceUpload.durationSeconds} />
                        <View style={styles.pendingVoiceActions}>
                          <Pressable
                            onPress={() => void uploadVoiceNoteDirect(pendingVoiceUpload)}
                            style={[styles.pendingVoiceButton, { backgroundColor: theme.primary }]}
                          >
                            <Text style={[styles.pendingVoiceButtonText, { fontFamily: fontSet.body }]}>{copy.chatScreen.acceptSend}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setPendingVoiceUpload(null)}
                            style={[styles.pendingVoiceButton, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
                          >
                            <Text style={[styles.pendingVoiceCancelText, { color: theme.foreground, fontFamily: fontSet.body }]}>{copy.chatScreen.discard}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.emptyConversation}>
                    <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.primary} />
                    <MutedText>{copy.chatScreen.emptyState}</MutedText>
                  </View>
                )}
              </View>

              {!readOnly && showNewChatPanel ? (
                <View pointerEvents="box-none" style={styles.panelOverlay}>
                  <View style={[styles.panelBackdrop, { backgroundColor: "rgba(7, 10, 14, 0.45)" }]} />
                  <Card style={[styles.newChatPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
                          {copy.chatScreen.newConversation}
                        </Text>
                        <MutedText>{copy.chatScreen.subtitleStart}</MutedText>
                      </View>
                      <Pressable
                        onPress={() => setShowNewChatPanel(false)}
                        style={[styles.panelCloseButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                      >
                        <Ionicons name="close" size={18} color={theme.primary} />
                      </Pressable>
                    </View>

                    {contacts.length === 0 ? (
                      <MutedText>{copy.chatScreen.noCoaches}</MutedText>
                    ) : (
                      <View style={styles.contactPickerStack}>
                        <Input
                          value={contactSearch}
                          onChangeText={(value) => {
                            setContactSearch(value);
                            if (!contactDropdownOpen) {
                              setContactDropdownOpen(true);
                            }
                          }}
                          onFocus={() => setContactDropdownOpen(true)}
                          placeholder={copy.chatScreen.searchContactsPlaceholder}
                        />
                        <Pressable
                          onPress={() => setContactDropdownOpen((current) => !current)}
                          style={[
                            styles.contactPickerTrigger,
                            {
                              backgroundColor: theme.cardAlt,
                              borderColor: theme.border,
                              flexDirection: isRTL ? "row-reverse" : "row",
                            },
                          ]}
                        >
                          <View style={styles.flex}>
                            <Text
                              style={[
                                styles.coachRowName,
                                {
                                  color: theme.foreground,
                                  fontFamily: fontSet.body,
                                  textAlign: isRTL ? "right" : "left",
                                  writingDirection: direction,
                                },
                              ]}
                            >
                              {selectedCoach ? selectedCoach.full_name || selectedCoach.email : copy.chatScreen.contactPickerPlaceholder}
                            </Text>
                            {selectedCoach ? (
                              <Text
                                style={[
                                  styles.coachRowEmail,
                                  {
                                    color: theme.muted,
                                    fontFamily: fontSet.body,
                                    textAlign: isRTL ? "right" : "left",
                                    writingDirection: direction,
                                  },
                                ]}
                              >
                                {[localizeRole(selectedCoach.role, isRTL), selectedCoach.email].filter(Boolean).join(" • ")}
                              </Text>
                            ) : null}
                          </View>
                          <Ionicons name={contactDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} />
                        </Pressable>
                        {contactDropdownOpen ? (
                          <View style={[styles.contactDropdown, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.coachList}>
                              {filteredContacts.length === 0 ? (
                                <MutedText>{copy.chatScreen.noMatchingContacts}</MutedText>
                              ) : (
                                filteredContacts.map((contact) => {
                                  const active = selectedCoachId === contact.id;
                                  return (
                                    <Pressable
                                      key={contact.id}
                                      onPress={() => {
                                        setSelectedCoachId(contact.id);
                                        setContactDropdownOpen(false);
                                      }}
                                      style={[
                                        styles.coachRow,
                                        {
                                          backgroundColor: active ? theme.primarySoft : theme.card,
                                          borderColor: active ? theme.primary : theme.border,
                                          flexDirection: isRTL ? "row-reverse" : "row",
                                        },
                                      ]}
                                    >
                                      <View style={styles.flex}>
                                        <Text
                                          style={[
                                            styles.coachRowName,
                                            {
                                              color: active ? theme.primary : theme.foreground,
                                              fontFamily: fontSet.body,
                                              textAlign: isRTL ? "right" : "left",
                                              writingDirection: direction,
                                            },
                                          ]}
                                        >
                                          {contact.full_name || contact.email}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.coachRowEmail,
                                            {
                                              color: theme.muted,
                                              fontFamily: fontSet.body,
                                              textAlign: isRTL ? "right" : "left",
                                              writingDirection: direction,
                                            },
                                          ]}
                                        >
                                          {[localizeRole(contact.role, isRTL), contact.email].filter(Boolean).join(" • ")}
                                        </Text>
                                      </View>
                                      {active ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
                                    </Pressable>
                                  );
                                })
                              )}
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    )}

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
                        {`${copy.chatScreen.selectedContactLabel} ${selectedCoach.full_name || selectedCoach.email} • ${localizeRole(selectedCoach.role, isRTL)}`}
                      </Text>
                    ) : null}

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
                      <Text style={[styles.newChatText, { fontFamily: fontSet.body }]}>
                        {createThreadMutation.isPending ? copy.chatScreen.creatingThread : copy.chatScreen.startConversation}
                      </Text>
                    </Pressable>
                  </Card>
                </View>
              ) : null}
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
  headerLine: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerActionButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  },
  horizontalList: {
    gap: 10,
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
    paddingRight: 4,
  },
  threadRail: {
    flexGrow: 0,
  },
  threadChip: {
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  threadName: {
    fontSize: 14,
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
  headerActionsStack: {
    alignItems: "center",
    gap: 10,
  },
  threadActionButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  conversationTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  audioPlayer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  audioButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  audioDuration: {
    fontSize: 12,
    fontWeight: "700",
  },
  audioFallbackText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
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
  messageSender: {
    fontSize: 11,
    fontWeight: "700",
  },
  messageTime: {
    fontSize: 11,
    fontWeight: "700",
  },
  composerBar: {
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  readOnlyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  readOnlyTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  recordingText: {
    fontSize: 13,
    fontWeight: "700",
  },
  pendingVoicePanel: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  pendingVoiceActions: {
    flexDirection: "row",
    gap: 10,
  },
  pendingVoiceButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingVoiceButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  pendingVoiceCancelText: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyConversation: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  panelOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  panelBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  newChatPanel: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: 22,
    gap: 12,
    maxHeight: "50%",
  },
  contactPickerStack: {
    gap: 8,
  },
  threadPickerStack: {
    gap: 8,
  },
  contactPickerTrigger: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contactDropdown: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: 180,
    padding: 8,
  },
  panelCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  coachList: {
    gap: 8,
  },
  coachRow: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  coachRowName: {
    fontSize: 13,
    fontWeight: "700",
  },
  coachRowEmail: {
    fontSize: 11,
    lineHeight: 16,
  },
});
