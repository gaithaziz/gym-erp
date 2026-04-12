import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { localeTag, localizeMessageType } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

type ExpoAVModule = typeof import("expo-av");

let expoAVModule: ExpoAVModule | null = null;
try {
  expoAVModule = require("expo-av") as ExpoAVModule;
} catch {
  expoAVModule = null;
}

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

function ChatAudioPlayer({
  src,
  initialDurationSeconds,
}: {
  src: string;
  initialDurationSeconds?: number | null;
}) {
  const { theme, fontSet } = usePreferences();
  const [sound, setSound] = useState<import("expo-av").Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(initialDurationSeconds ?? 0);

  useEffect(() => {
    return () => {
      if (sound) {
        void sound.unloadAsync();
      }
    };
  }, [sound]);

  async function togglePlayback() {
    const Audio = expoAVModule?.Audio;
    if (!Audio) {
      return;
    }
    try {
      if (!sound) {
        const { sound: createdSound, status } = await Audio.Sound.createAsync(
          { uri: src },
          { shouldPlay: true },
          (playbackStatus) => {
            if (!playbackStatus.isLoaded) {
              return;
            }
            setPlaying(playbackStatus.isPlaying);
            if (playbackStatus.didJustFinish) {
              setPlaying(false);
            }
            if (playbackStatus.durationMillis) {
              setDurationSeconds(Math.round(playbackStatus.durationMillis / 1000));
            }
          },
        );
        setSound(createdSound);
        if (status.isLoaded && status.durationMillis) {
          setDurationSeconds(Math.round(status.durationMillis / 1000));
        }
        return;
      }

      const status = await sound.getStatusAsync();
      if (!status.isLoaded) {
        return;
      }
      if (status.isPlaying) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  }

  return (
    <View style={[styles.audioPlayer, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Pressable onPress={() => void togglePlayback()} disabled={!expoAVModule?.Audio} style={[styles.audioButton, { backgroundColor: theme.primary, opacity: expoAVModule?.Audio ? 1 : 0.5 }]}>
        <Ionicons name={playing ? "pause" : "play"} size={16} color="#FFFFFF" />
      </Pressable>
      <Text style={[styles.audioDuration, { color: theme.foreground, fontFamily: fontSet.mono }]}>
        {formatDuration(durationSeconds)}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const currentUserId = bootstrap?.user.id ?? null;
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showNewChatPanel, setShowNewChatPanel] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [pendingVoiceUpload, setPendingVoiceUpload] = useState<PendingVoiceUpload | null>(null);
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const recordingRef = useRef<import("expo-av").Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setShowNewChatPanel(false);
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
      return authorizedRequest(`/mobile/customer/chat/threads/${selectedThread.id}/attachments`, {
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

  const threadsLoading = threadsQuery.isLoading || contactsQuery.isLoading;
  const threadError =
    (threadsQuery.error instanceof Error ? threadsQuery.error.message : null) ||
    (contactsQuery.error instanceof Error ? contactsQuery.error.message : null);
  const selectedCoach = contacts.find((contact) => contact.id === selectedCoachId) ?? null;
  const selectedThreadName = selectedThread?.coach.full_name || copy.common.coach;

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
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

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
      const Audio = expoAVModule?.Audio;
      if (!Audio) {
        throw new Error(copy.chatScreen.voiceUnavailable);
      }
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error(copy.chatScreen.microphoneUnavailable);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recordingOptions = {
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      } as const;

      const started = new Audio.Recording();
      await started.prepareToRecordAsync(recordingOptions);
      await started.startAsync();
      recordingRef.current = started;
      setRecordSeconds(0);
      setRecording(true);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((current) => current + 1);
      }, 1000);
    } catch (caught) {
      setRecording(false);
      setFeedback(caught instanceof Error ? caught.message : copy.chatScreen.microphoneUnavailable);
    }
  }

  async function stopVoiceRecording({ directSend }: { directSend: boolean }) {
    const activeRecording = recordingRef.current;
    const Audio = expoAVModule?.Audio;
    if (!activeRecording) {
      return;
    }

    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      recordingRef.current = null;
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setRecording(false);
      if (Audio) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      }

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
        setRecordSeconds(0);
        return;
      }

      setPendingVoiceUpload(pending);
      setRecordSeconds(0);
    } catch {
      setRecording(false);
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
          onPress={() => router.back()}
          style={[styles.headerActionButton, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={18} color={theme.primary} />
        </Pressable>
      }
      action={
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
          <QueryState loading={threadsLoading} error={threadError} />
          {!threadsLoading && !threadError ? (
            <>
              {threads.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.horizontalList, styles.threadStrip, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  style={styles.threadRail}
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
                        <MutedText>{copy.chatScreen.threadHint}</MutedText>
                      </View>
                      <View style={[styles.liveDot, { backgroundColor: theme.primary }]} />
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

                    <View style={[styles.composerBar, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Pressable
                        onPress={() => attachmentMutation.mutate()}
                        disabled={attachmentMutation.isPending || recording}
                        style={[styles.iconButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                      >
                        <Ionicons name="attach" size={18} color={theme.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => void (recording ? stopVoiceRecording({ directSend: false }) : startVoiceRecording())}
                        disabled={voiceUploadMutation.isPending || Boolean(pendingVoiceUpload)}
                        style={[styles.iconButton, { backgroundColor: theme.cardAlt, borderColor: recording ? theme.primary : theme.border }]}
                      >
                        <Ionicons name={recording ? "stop" : "mic"} size={18} color={recording ? theme.primary : theme.primary} />
                      </Pressable>
                      <Input
                        value={messageText}
                        onChangeText={setMessageText}
                        placeholder={copy.chatScreen.messagePlaceholder}
                        style={styles.messageInput}
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
                    {recording ? (
                      <View style={[styles.recordingBanner, { backgroundColor: theme.primarySoft, borderTopColor: theme.border }]}>
                        <View style={[styles.recordingDot, { backgroundColor: theme.primary }]} />
                        <Text style={[styles.recordingText, { color: theme.foreground, fontFamily: fontSet.body }]}>
                          {copy.chatScreen.recording} {recordSeconds}s
                        </Text>
                      </View>
                    ) : null}
                    {pendingVoiceUpload ? (
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

              {showNewChatPanel ? (
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
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.coachList}>
                        {contacts.map((contact) => {
                          const active = selectedCoachId === contact.id;
                          return (
                            <Pressable
                              key={contact.id}
                              onPress={() => setSelectedCoachId(contact.id)}
                              style={[
                                styles.coachRow,
                                {
                                  backgroundColor: active ? theme.primarySoft : theme.cardAlt,
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
                                  {contact.email}
                                </Text>
                              </View>
                              {active ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
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
                        {copy.chatScreen.selectedCoachLabel} {selectedCoach.full_name || selectedCoach.email}
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
    textTransform: "uppercase",
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
    paddingBottom: 28,
    gap: 14,
    maxHeight: "62%",
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
    gap: 10,
  },
  coachRow: {
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  coachRowName: {
    fontSize: 15,
    fontWeight: "700",
  },
  coachRowEmail: {
    fontSize: 12,
    lineHeight: 18,
  },
});
