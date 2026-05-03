import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Card, Input, MediaPreview, MutedText, QueryState, Screen } from "@/components/ui";
import { API_BASE_URL } from "@/lib/api";
import { classifyChatAttachment, isImageMime, resolveMediaUri } from "@/lib/chat-media";
import { pickImageOrVideoFromLibrary, type PickedMedia } from "@/lib/media-picker";
import { localeTag, localizeMessageType, localizeRole } from "@/lib/mobile-format";
import { getCurrentRole, isAdminControlRole, isCoachRole } from "@/lib/mobile-role";
import { matchesSearchQuery } from "@/lib/search";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";
import type { Role } from "@gym-erp/contracts";

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

const CHAT_REFRESH_INTERVAL_MS = 5000;

function formatDuration(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatThreadName(thread: Thread | null | undefined, role: Role | null, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (!thread) return copy.common.chat;
  const customerName = thread.customer.full_name || copy.common.customer;
  const coachName = thread.coach.full_name || copy.common.coach;
  if (isCoachRole(role)) return customerName;
  if (role === "CUSTOMER") return coachName;
  return `${customerName} - ${coachName}`;
}

function ChatAudioPlayer({
  src,
  initialDurationSeconds,
  isOwn,
}: {
  src: string;
  initialDurationSeconds?: number | null;
  isOwn?: boolean;
}) {
  const { fontSet, isRTL, theme } = usePreferences();
  const player = useAudioPlayer(src, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState(1);

  const currentSeconds = Math.max(0, Math.round(status.currentTime || 0));
  const durationSeconds = Math.max(Math.round(status.duration || 0), initialDurationSeconds ?? 0);
  const progressPercent = durationSeconds > 0 ? Math.min(100, (currentSeconds / durationSeconds) * 100) : 0;

  useEffect(() => {
    player.setPlaybackRate(speed);
  }, [player, speed]);

  async function togglePlayback() {
    if (status.playing) {
      player.pause();
      return;
    }

    if (status.didJustFinish || (durationSeconds > 0 && currentSeconds >= durationSeconds - 1)) {
      await player.seekTo(0);
    }

    player.play();
  }

  function cycleSpeed() {
    setSpeed((current) => (current === 1 ? 1.5 : current === 1.5 ? 2 : 1));
  }

  return (
    <View
      style={[
        styles.audioPlayer,
        {
          backgroundColor: theme.card,
          borderColor: theme.primary,
          alignSelf: isOwn ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
          maxWidth: "72%",
        },
      ]}
    >
      <View style={[styles.audioControls, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => void togglePlayback()} accessibilityRole="button" accessibilityLabel={status.playing ? "Pause" : "Play"} style={[styles.audioButton, { backgroundColor: theme.primary }]}>
          <Ionicons name={status.playing ? "pause" : "play"} size={16} color="#FFFFFF" />
        </Pressable>
        <Pressable onPress={cycleSpeed} accessibilityRole="button" accessibilityLabel="Change playback speed" style={[styles.audioSpeedButton, { borderColor: theme.primarySoft, backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.audioSpeedText, { color: theme.primary, fontFamily: fontSet.body }]}>
            {speed === 1 ? "1x" : speed === 1.5 ? "1.5x" : "2x"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.audioMeta}>
        <View style={[styles.audioProgressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.audioProgressFill, { backgroundColor: theme.primary, width: `${progressPercent}%` }]} />
        </View>
        <Text style={[styles.audioDuration, { color: theme.foreground, fontFamily: fontSet.mono }]}>
          {formatDuration(currentSeconds)} / {formatDuration(durationSeconds)}
        </Text>
      </View>
    </View>
  );
}

function PhotoZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = Math.max(1, Math.min(4, savedScale.value * event.scale));
      scale.value = nextScale;
      if (nextScale === 1) {
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, panGesture)}>
      <Animated.View style={[styles.photoViewerZoomStage, animatedStyle]}>
        <Image source={{ uri }} style={styles.photoViewerImage} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

function ChatPhotoViewer({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  const { fontSet, isRTL, theme } = usePreferences();
  const insets = useSafeAreaInsets();
  const resolvedUri = resolveMediaUri(uri);

  return (
    <Modal visible={Boolean(resolvedUri)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.photoViewerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.photoViewerFrame} pointerEvents="box-none">
          <View style={[styles.photoViewerTopBar, { flexDirection: isRTL ? "row-reverse" : "row", paddingTop: insets.top + 4 }]}>
            <Text style={[styles.photoViewerTitle, { color: "#FFFFFF", fontFamily: fontSet.body }]}>Photo</Text>
            <Pressable onPress={onClose} style={[styles.photoViewerCloseButton, { borderColor: theme.border }]}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          {resolvedUri ? (
            <View style={[styles.photoViewerCanvas, { paddingBottom: insets.bottom + 16 }]}>
              <PhotoZoomableImage uri={resolvedUri} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ChatPhotoMessage({
  uri,
  caption,
  createdAt,
  isOwn,
  locale,
  onPress,
}: {
  uri: string;
  caption?: string | null;
  createdAt: string;
  isOwn: boolean;
  locale: string;
  onPress: () => void;
}) {
  const { fontSet, isRTL, theme } = usePreferences();
  const resolvedUri = resolveMediaUri(uri);

  if (!resolvedUri) {
    return null;
  }

  return (
    <View
      style={[
        styles.photoMessageShell,
        {
          alignSelf: isOwn ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"),
        },
      ]}
    >
      <View
        style={[
        styles.photoMessageBubble,
        {
            backgroundColor: isOwn ? theme.primary : theme.cardAlt,
            borderColor: isOwn ? theme.primary : theme.border,
          },
        ]}
      >
        <Pressable onPress={onPress} accessibilityRole="button" style={styles.photoMessagePressable}>
          <Image source={{ uri: resolvedUri }} style={styles.photoMessageImage} contentFit="contain" />
        </Pressable>
      </View>
      {caption ? (
        <Text
          style={[
            styles.photoMessageCaption,
            {
              color: isOwn ? "#FFFFFF" : theme.foreground,
              fontFamily: fontSet.body,
              textAlign: isRTL ? "right" : "left",
              writingDirection: isRTL ? "rtl" : "ltr",
            },
          ]}
        >
          {caption}
        </Text>
      ) : null}
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
        {new Date(createdAt).toLocaleTimeString(locale, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string; memberId?: string }>();
  const { authorizedRequest, bootstrap, selectedBranchId, getAccessToken } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const insets = useSafeAreaInsets();
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
  const [pendingPhotoUpload, setPendingPhotoUpload] = useState<PickedMedia | null>(null);
  const [pendingPhotoCaption, setPendingPhotoCaption] = useState("");
  const [pendingVoiceUpload, setPendingVoiceUpload] = useState<PendingVoiceUpload | null>(null);
  const [openPhotoUri, setOpenPhotoUri] = useState<string | null>(null);
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const chatSocketPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recording = recorderState.isRecording;
  const recordSeconds = Math.round(recorderState.durationMillis / 1000);

  const branchSuffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";

  const contactsQuery = useQuery({
    queryKey: ["mobile-chat-contacts", selectedBranchId ?? "all"],
    enabled: !readOnly,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    queryFn: async () => (await authorizedRequest<ChatContact[]>(`/mobile/chat/contacts${branchSuffix}`)).data,
  });
  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);

  useEffect(() => {
    if (!readOnly && contacts.length > 0 && !selectedCoachId) {
      setSelectedCoachId(contacts[0].id);
    }
  }, [contacts, readOnly, selectedCoachId]);

  useEffect(() => {
    if (!readOnly && showNewChatPanel) {
      void contactsQuery.refetch();
    }
  }, [contactsQuery, readOnly, showNewChatPanel]);

  useEffect(() => {
    setSelectedCoachId(null);
    setSelectedThreadId(null);
    setShowNewChatPanel(false);
    setContactDropdownOpen(false);
    setThreadDropdownOpen(false);
    setContactSearch("");
    setThreadSearch("");
    setMessageText("");
    setFeedback(null);
    setPendingPhotoUpload(null);
    setPendingPhotoCaption("");
    setPendingVoiceUpload(null);
    setOpenPhotoUri(null);
  }, [selectedBranchId]);

  useEffect(() => {
    if (!readOnly && params.contactId && typeof params.contactId === "string") {
      setSelectedCoachId(params.contactId);
      setShowNewChatPanel(true);
    }
  }, [params.contactId, readOnly]);

  const deferredContactSearch = useDeferredValue(contactSearch);
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => matchesSearchQuery(deferredContactSearch, [contact.full_name, contact.email]));
  }, [contacts, deferredContactSearch]);

  const threadsQuery = useQuery({
    queryKey: ["mobile-chat", selectedBranchId ?? "all"],
    queryFn: async () => (await authorizedRequest<Thread[]>(`/mobile/chat/threads${branchSuffix}`)).data,
    staleTime: 0,
    refetchInterval: CHAT_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const deferredThreadSearch = useDeferredValue(threadSearch);
  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => matchesSearchQuery(deferredThreadSearch, [
      isCoachRole(role) ? thread.customer.full_name : thread.coach.full_name,
      thread.last_message?.text_content,
    ]));
  }, [deferredThreadSearch, role, threads]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null);
      return;
    }
    if (isCoachRole(role) && params.memberId && typeof params.memberId === "string") {
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
    queryKey: ["mobile-chat-messages", selectedThread?.id, selectedBranchId ?? "all"],
    enabled: Boolean(selectedThread?.id),
    queryFn: async () => (
      await authorizedRequest<ChatMessage[]>(`/mobile/chat/threads/${selectedThread?.id}/messages${branchSuffix}`)
    ).data,
    staleTime: 0,
    refetchInterval: CHAT_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !bootstrap || readOnly) {
      return;
    }

    const baseUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, "").replace(/^http/, "ws");
    const socket = new WebSocket(`${baseUrl}/api/v1/chat/ws?token=${encodeURIComponent(token)}`);
    chatSocketRef.current = socket;

    const refreshChat = () => {
      void queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-chat-messages"] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
    };

    socket.onopen = () => {
      if (chatSocketPingRef.current) {
        clearInterval(chatSocketPingRef.current);
      }
      chatSocketPingRef.current = setInterval(() => {
        try {
          socket.send(JSON.stringify({ action: "ping" }));
        } catch {
          return;
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { event?: string; thread_id?: string };
        if (payload.event === "chat.message.created" || payload.event === "chat.read.updated") {
          refreshChat();
        }
      } catch {
        return;
      }
    };

    socket.onerror = () => {
      refreshChat();
    };

    socket.onclose = () => {
      if (chatSocketPingRef.current) {
        clearInterval(chatSocketPingRef.current);
        chatSocketPingRef.current = null;
      }
      if (chatSocketRef.current === socket) {
        chatSocketRef.current = null;
      }
    };

    return () => {
      if (chatSocketPingRef.current) {
        clearInterval(chatSocketPingRef.current);
        chatSocketPingRef.current = null;
      }
      socket.close();
      if (chatSocketRef.current === socket) {
        chatSocketRef.current = null;
      }
    };
  }, [bootstrap, getAccessToken, queryClient, readOnly]);

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
        body: JSON.stringify(isCoachRole(role) ? { customer_id: selectedCoachId } : { coach_id: selectedCoachId }),
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

  const submitMediaAttachmentMutation = useMutation({
    mutationFn: async ({
      asset,
      caption,
    }: {
      asset: PickedMedia;
      caption?: string;
    }) => {
      if (!selectedThread) {
        throw new Error(copy.chatScreen.pickThread);
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
      if (caption?.trim()) {
        formData.append("text_content", caption.trim());
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
      setPendingPhotoUpload(null);
      setPendingPhotoCaption("");
      setMessageText("");
      setFeedback(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-chat-messages", selectedThread?.id] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  async function handleAttachmentPress() {
    if (!selectedThread) {
      return;
    }
    try {
      const [asset] = await pickImageOrVideoFromLibrary({ permissionDeniedMessage: copy.common.photoPermissionDenied });
      if (!asset) {
        return;
      }
      const selection = classifyChatAttachment(asset, messageText);
      if (selection.kind === "photo-preview") {
        setPendingPhotoUpload(selection.asset);
        setPendingPhotoCaption(selection.caption);
        return;
      }
      submitMediaAttachmentMutation.mutate({
        asset: selection.asset,
        caption: selection.caption,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain);
    }
  }

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
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void queryClient.invalidateQueries({ queryKey: ["mobile-chat"] });
        void queryClient.invalidateQueries({ queryKey: ["mobile-chat-messages"] });
        void queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
      }
    });

    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        recorder.stop();
      }
    };
  }, [recorder, recorderState.isRecording]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [feedback]);

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
      title={copy.common.chat}
      scrollable={false}
      compactTitle
      hideFloatingChat
      contentPaddingBottom={0}
      headerTitleStyle={{ marginTop: 6 }}
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
              <Modal visible={threadDropdownOpen} transparent animationType="fade" onRequestClose={() => setThreadDropdownOpen(false)}>
                <Pressable style={styles.dropdownBackdrop} onPress={() => setThreadDropdownOpen(false)} />
                <View style={styles.dropdownModalRoot} pointerEvents="box-none">
                  <View style={[styles.contactDropdown, styles.dropdownPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                    <Input
                      value={threadSearch}
                      onChangeText={setThreadSearch}
                      placeholder={copy.chatScreen.searchThreadsPlaceholder}
                      accessibilityLabel={copy.chatScreen.searchThreadsPlaceholder}
                      style={styles.threadDropdownSearch}
                    />
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
                </View>
              </Modal>
              {threads.length === 0 ? (
                <Card>
                  <MutedText>{copy.chatScreen.noThreads}</MutedText>
                </Card>
              ) : null}

              <View style={[styles.messagesPane, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {selectedThread ? (
                  <>
                    <View style={[styles.conversationHeader, { borderBottomColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Pressable
                        onPress={() => setThreadDropdownOpen(true)}
                        style={[
                          styles.threadHeaderPicker,
                          {
                            backgroundColor: theme.cardAlt,
                            borderColor: theme.border,
                            flexDirection: isRTL ? "row-reverse" : "row",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.conversationTitle,
                            {
                              flex: 1,
                              minWidth: 0,
                              color: theme.foreground,
                              fontFamily: fontSet.display,
                              textAlign: isRTL ? "right" : "left",
                              writingDirection: direction,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {selectedThreadName}
                        </Text>
                        <Ionicons name={threadDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} />
                      </Pressable>
                      <View style={styles.headerActionsStack}>
                        {isCoachRole(role) && selectedThread?.customer.id ? (
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
                        const isAdminMessageView = readOnly;
                        const isOwn = currentUserId != null && item.sender_id === currentUserId;
                        const isRightAligned = isAdminMessageView
                          ? item.sender_id === selectedThread?.coach.id
                          : isOwn;
                        const mediaUri = resolveMediaUri(item.media_url);
                        const isImageMessage = Boolean(item.media_mime && isImageMime(item.media_mime) && mediaUri);
                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.messageRow,
                              {
                                alignItems: isRightAligned
                                  ? (isRTL ? "flex-start" : "flex-end")
                                  : (isRTL ? "flex-end" : "flex-start"),
                              },
                            ]}
                          >
                            {isImageMessage && mediaUri ? (
                              <ChatPhotoMessage
                                uri={mediaUri}
                                caption={item.text_content ?? null}
                                createdAt={item.created_at}
                                isOwn={isRightAligned}
                                locale={locale}
                                onPress={() => setOpenPhotoUri(mediaUri)}
                              />
                            ) : item.media_url && item.media_mime?.startsWith("audio/") ? (
                                <ChatAudioPlayer
                                  src={resolveMediaUri(item.media_url) ?? item.media_url}
                                  initialDurationSeconds={item.voice_duration_seconds}
                                  isOwn={isRightAligned}
                                />
                            ) : (
                              <View
                                style={[
                                  styles.messageBubble,
                                  {
                                    backgroundColor: isRightAligned ? theme.primary : theme.cardAlt,
                                    borderColor: isRightAligned ? theme.primary : theme.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.messageText,
                                    {
                                      color: isRightAligned ? "#FFFFFF" : theme.foreground,
                                      fontFamily: fontSet.body,
                                      textAlign: isRTL ? "right" : "left",
                                      writingDirection: direction,
                                    },
                                  ]}
                                >
                                {item.text_content || localizeMessageType(item.message_type, isRTL)}
                              </Text>
                                <MediaPreview
                                  uri={item.media_mime?.startsWith("audio/") ? null : item.media_url}
                                  mime={item.media_mime}
                                  label={item.media_url && !item.media_mime?.startsWith("audio/") ? localizeMessageType(item.message_type, isRTL) : null}
                                />
                                <Text
                                  style={[
                                    styles.messageTime,
                                    {
                                      color: isRightAligned ? "rgba(255,255,255,0.8)" : theme.muted,
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
                            )}
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
                        onPress={() => void handleAttachmentPress()}
                        disabled={submitMediaAttachmentMutation.isPending || recording || Boolean(pendingPhotoUpload)}
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
                        accessibilityLabel={copy.chatScreen.messagePlaceholder}
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
                    <Modal visible={Boolean(pendingPhotoUpload)} transparent animationType="fade" onRequestClose={() => setPendingPhotoUpload(null)}>
                      <View style={styles.photoApprovalOverlay}>
                        <Pressable style={styles.photoApprovalBackdrop} onPress={() => setPendingPhotoUpload(null)} />
                        <View style={[styles.photoApprovalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                          <View style={[styles.photoApprovalHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                            <View style={styles.flex}>
                              <Text style={[styles.photoApprovalTitle, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                                {copy.chatScreen.photoPreviewTitle}
                              </Text>
                              <MutedText>{copy.chatScreen.photoPreviewSubtitle}</MutedText>
                            </View>
                            <Pressable
                              onPress={() => setPendingPhotoUpload(null)}
                              style={[styles.panelCloseButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                            >
                              <Ionicons name="close" size={18} color={theme.primary} />
                            </Pressable>
                          </View>
                          {pendingPhotoUpload ? (
                            <Pressable onPress={() => setOpenPhotoUri(resolveMediaUri(pendingPhotoUpload.uri))} accessibilityRole="button" style={styles.photoApprovalPreviewWrap}>
                              <Image source={{ uri: pendingPhotoUpload.uri }} style={styles.photoApprovalPreview} contentFit="contain" />
                            </Pressable>
                          ) : null}
                          {pendingPhotoCaption.trim() ? (
                            <Text style={[styles.photoApprovalCaption, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                              {pendingPhotoCaption}
                            </Text>
                          ) : null}
                          <View style={[styles.photoApprovalActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                            <Pressable
                              onPress={() => {
                                if (!pendingPhotoUpload) {
                                  return;
                                }
                                submitMediaAttachmentMutation.mutate({
                                  asset: pendingPhotoUpload,
                                  caption: pendingPhotoCaption,
                                });
                              }}
                              disabled={submitMediaAttachmentMutation.isPending || !pendingPhotoUpload}
                              style={[styles.photoApprovalButton, { backgroundColor: theme.primary, opacity: submitMediaAttachmentMutation.isPending ? 0.7 : 1 }]}
                            >
                            <Text style={[styles.photoApprovalButtonText, { fontFamily: fontSet.body }]}>
                                {submitMediaAttachmentMutation.isPending ? copy.common.sending : copy.chatScreen.acceptSend}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => setPendingPhotoUpload(null)}
                              style={[styles.photoApprovalButton, { backgroundColor: theme.cardAlt, borderColor: theme.border, borderWidth: 1 }]}
                            >
                              <Text style={[styles.photoApprovalCancelText, { color: theme.foreground, fontFamily: fontSet.body }]}>
                                {copy.chatScreen.discard}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </Modal>
                    <ChatPhotoViewer uri={openPhotoUri} onClose={() => setOpenPhotoUri(null)} />
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
                          accessibilityLabel={copy.chatScreen.searchContactsPlaceholder}
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
                          <Text
                            style={[
                              styles.coachRowName,
                              {
                                flex: 1,
                                minWidth: 0,
                                color: theme.foreground,
                                fontFamily: fontSet.body,
                                textAlign: isRTL ? "right" : "left",
                                writingDirection: direction,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {selectedCoach ? selectedCoach.full_name || selectedCoach.email : copy.chatScreen.contactPickerPlaceholder}
                          </Text>
                          <Ionicons name={contactDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} />
                        </Pressable>
                        {contactDropdownOpen ? (
                          <View style={[styles.inlineContactDropdown, styles.dropdownPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
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

        </View>
      </KeyboardAvoidingView>
      {feedback ? (
        <View pointerEvents="box-none" style={styles.feedbackOverlay}>
          <Card
            style={[
              styles.feedbackToast,
              {
                backgroundColor: theme.cardAlt,
                borderColor: theme.border,
                bottom: insets.bottom + 12,
              },
            ]}
          >
            <MutedText>{feedback}</MutedText>
          </Card>
        </View>
      ) : null}
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
    alignItems: "stretch",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerActionsStack: {
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 18,
    fontWeight: "800",
  },
  threadHeaderPicker: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
    justifyContent: "center",
  },
  threadHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  threadHeaderSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  audioPlayer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 6,
    maxWidth: "100%",
  },
  audioControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  audioButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  audioSpeedButton: {
    minWidth: 34,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  audioSpeedText: {
    fontSize: 11,
    fontWeight: "800",
  },
  audioDuration: {
    fontSize: 10,
    fontWeight: "700",
  },
  audioMeta: {
    flexShrink: 1,
    minWidth: 58,
    gap: 2,
  },
  audioProgressTrack: {
    height: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  audioProgressFill: {
    height: "100%",
    borderRadius: 999,
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
    alignSelf: "center",
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
  photoMessageShell: {
    maxWidth: "66%",
    gap: 2,
    marginVertical: 1,
  },
  photoMessageBubble: {
    borderWidth: 0.5,
    borderRadius: 18,
    padding: 3,
  },
  photoMessagePressable: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  photoMessageImage: {
    width: "100%",
    minHeight: 96,
    maxHeight: 180,
    aspectRatio: 1.12,
    backgroundColor: "transparent",
  },
  photoMessageCaption: {
    fontSize: 13,
    lineHeight: 18,
  },
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
  },
  photoViewerFrame: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 16,
  },
  photoViewerTopBar: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    zIndex: 1,
  },
  photoViewerTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  photoViewerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  photoViewerCanvas: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  photoViewerZoomStage: {
    width: "100%",
    height: "100%",
  },
  photoViewerImage: {
    width: "100%",
    height: "100%",
    minHeight: 0,
  },
  photoApprovalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  photoApprovalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  photoApprovalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  photoApprovalHeader: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  photoApprovalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  photoApprovalPreviewWrap: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  photoApprovalPreview: {
    width: "100%",
    minHeight: 220,
    maxHeight: 360,
    aspectRatio: 1.2,
  },
  photoApprovalCaption: {
    fontSize: 14,
    lineHeight: 20,
  },
  photoApprovalActions: {
    gap: 10,
  },
  photoApprovalButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  photoApprovalButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  photoApprovalCancelText: {
    fontSize: 14,
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
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 50,
    elevation: 50,
  },
  feedbackToast: {
    position: "absolute",
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
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
    position: "relative",
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
  inlineContactDropdown: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: 180,
    padding: 8,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "100%",
    marginBottom: 8,
    zIndex: 30,
    elevation: 30,
  },
  dropdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dropdownModalRoot: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 120,
  },
  dropdownPanel: {
    marginTop: 0,
  },
  threadDropdownSearch: {
    marginBottom: 8,
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
