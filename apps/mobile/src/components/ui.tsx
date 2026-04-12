import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE_URL, parseHomeEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function FloatingChatButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { authorizedRequest, status } = useSession();
  const { copy, isRTL, theme } = usePreferences();

  const hidden = status !== "signed_in" || pathname === "/login" || pathname.includes("/chat");
  const homeQuery = useQuery({
    queryKey: ["mobile-home"],
    enabled: !hidden,
    staleTime: 30_000,
    queryFn: async () => parseHomeEnvelope(await authorizedRequest("/mobile/customer/home")).data,
  });
  const unreadCount = homeQuery.data?.quick_stats.unread_chat_messages ?? 0;

  if (hidden) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.common.chat}
      onPress={() => router.push("/chat")}
      style={[
        styles.floatingChatButton,
        {
          backgroundColor: theme.primary,
          shadowColor: "#000000",
          left: isRTL ? 20 : undefined,
          right: isRTL ? undefined : 20,
        },
      ]}
    >
      <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      {unreadCount > 0 ? (
        <View
          style={[
            styles.floatingChatDot,
            {
              backgroundColor: "#DC2626",
              left: isRTL ? 8 : undefined,
              right: isRTL ? undefined : 8,
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

export function Screen({
  title,
  subtitle,
  children,
  action,
  scrollable = true,
  hideFloatingChat = false,
}: PropsWithChildren<{ title: string; subtitle?: string; action?: ReactNode; scrollable?: boolean; hideFloatingChat?: boolean }>) {
  const { direction, isRTL, theme, themeMode, toggleLocale, toggleThemeMode, locale, fontSet } = usePreferences();
  const content = (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.screenTitle,
              {
                color: theme.foreground,
                textAlign: isRTL ? "right" : "left",
                writingDirection: direction,
                fontFamily: fontSet.display,
              },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.screenSubtitle,
                {
                  color: theme.muted,
                  textAlign: isRTL ? "right" : "left",
                  writingDirection: direction,
                  fontFamily: fontSet.body,
                },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.headerActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Pressable onPress={() => void toggleThemeMode()} style={[styles.controlButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name={themeMode === "dark" ? "moon" : "sunny"} size={16} color={theme.primary} />
          </Pressable>
          <Pressable onPress={() => void toggleLocale()} style={[styles.controlButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.controlLabel, { color: theme.foreground, fontFamily: fontSet.mono }]}>{locale === "en" ? "AR" : "EN"}</Text>
          </Pressable>
          {action}
        </View>
      </View>
      {children}
    </>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.topAccent, { backgroundColor: theme.primary }]} />
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.screenContent}>{content}</ScrollView>
      ) : (
        <View style={[styles.screenContent, styles.screenContentStatic]}>{content}</View>
      )}
      <View pointerEvents="box-none" style={styles.screenOverlay}>
        {!hideFloatingChat ? <FloatingChatButton /> : null}
      </View>
    </SafeAreaView>
  );
}

export function Card({ children, style }: PropsWithChildren<ViewProps>) {
  const { theme } = usePreferences();
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>{children}</View>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  const { direction, isRTL, theme, fontSet } = usePreferences();
  return (
    <Text
      style={[
        styles.sectionTitle,
        {
          color: theme.foreground,
          fontFamily: fontSet.display,
          textAlign: isRTL ? "right" : "left",
          writingDirection: direction,
        },
      ]}
    >
      {children}
    </Text>
  );
}

export function MutedText({ children }: PropsWithChildren) {
  const { direction, isRTL, theme, fontSet } = usePreferences();
  return (
    <Text
      style={[
        styles.mutedText,
        {
          color: theme.muted,
          fontFamily: fontSet.body,
          textAlign: isRTL ? "right" : "left",
          writingDirection: direction,
        },
      ]}
    >
      {children}
    </Text>
  );
}

export function ValueText({ children }: PropsWithChildren) {
  const { direction, isRTL, theme, fontSet } = usePreferences();
  return (
    <Text
      style={[
        styles.valueText,
        {
          color: theme.foreground,
          fontFamily: fontSet.display,
          textAlign: isRTL ? "right" : "left",
          writingDirection: direction,
        },
      ]}
    >
      {children}
    </Text>
  );
}

export function PrimaryButton({ children, ...props }: PropsWithChildren<PressableProps>) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary }, pressed && styles.buttonPressed]}>
      <Text style={[styles.primaryButtonText, { color: "#FFFFFF", fontFamily: fontSet.body }]}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ children, ...props }: PropsWithChildren<PressableProps>) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.cardAlt, borderColor: theme.border }, pressed && styles.buttonPressed]}>
      <Text style={[styles.secondaryButtonText, { color: theme.foreground, fontFamily: fontSet.body }]}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryLink({ href, children }: PropsWithChildren<{ href: string }>) {
  const { isRTL, theme, fontSet } = usePreferences();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={({ pressed }) => [
        styles.linkRow,
        {
          backgroundColor: theme.cardAlt,
          borderColor: theme.border,
          flexDirection: isRTL ? "row-reverse" : "row",
        },
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.linkLabel, { color: theme.foreground, fontFamily: fontSet.body }]}>{children}</Text>
      <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={theme.primary} />
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const { direction, isRTL, theme, fontSet } = usePreferences();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: theme.cardAlt,
          borderColor: theme.border,
          color: theme.foreground,
          textAlign: isRTL ? "right" : "left",
          writingDirection: direction,
          fontFamily: fontSet.body,
        },
        props.style,
      ]}
    />
  );
}

export function TextArea(props: TextInputProps) {
  return <Input {...props} multiline textAlignVertical="top" style={[{ minHeight: 112 }, props.style]} />;
}

export function InlineStat({ label, value }: { label: string; value: string | number }) {
  const { theme, fontSet } = usePreferences();
  return (
    <View style={[styles.inlineStat, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={[styles.inlineStatLabel, { color: theme.primary, fontFamily: fontSet.mono }]}>{label}</Text>
      <Text style={[styles.inlineStatValue, { color: theme.foreground, fontFamily: fontSet.display }]}>{value}</Text>
    </View>
  );
}

export function MediaPreview({
  uri,
  mime,
  label,
}: {
  uri?: string | null;
  mime?: string | null;
  label?: string | null;
}) {
  const { direction, isRTL, theme, fontSet } = usePreferences();
  if (!uri) {
    return null;
  }
  const resolvedUri = uri.startsWith("http://") || uri.startsWith("https://") ? uri : `${ASSET_BASE_URL}${uri}`;
  const isImage = Boolean(mime?.startsWith("image/"));

  return (
    <View style={[styles.mediaCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      {isImage ? <Image source={{ uri: resolvedUri }} style={styles.mediaImage} contentFit="cover" /> : null}
      {label ? (
        <Text
          style={[
            styles.mediaLabel,
            {
              color: theme.foreground,
              fontFamily: fontSet.body,
              textAlign: isRTL ? "right" : "left",
              writingDirection: direction,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <MutedText>{resolvedUri}</MutedText>
    </View>
  );
}

export function QueryState({ loading, error, empty, emptyMessage = "No data yet." }: { loading: boolean; error?: string | null; empty?: boolean; emptyMessage?: string }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color={theme.primary} />
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <Text
          style={[
            styles.errorText,
            {
              color: "#A53A22",
              fontFamily: fontSet.body,
              textAlign: isRTL ? "right" : "left",
              writingDirection: direction,
            },
          ]}
        >
          {error}
        </Text>
      </Card>
    );
  }
  if (empty) {
    return (
      <Card>
        <MutedText>{emptyMessage}</MutedText>
      </Card>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    opacity: 0.08,
  },
  screenContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    paddingTop: 12,
    gap: 16,
  },
  screenContentStatic: {
    flex: 1,
  },
  screenOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "box-none",
  },
  headerRow: {
    gap: 12,
  },
  headerText: {
    gap: 4,
    flex: 1,
  },
  headerActions: {
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  mutedText: {
    fontSize: 14,
    lineHeight: 20,
  },
  valueText: {
    fontSize: 22,
    fontWeight: "700",
  },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  floatingChatButton: {
    position: "absolute",
    bottom: 94,
    width: 58,
    height: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    zIndex: 20,
  },
  floatingChatDot: {
    position: "absolute",
    top: 8,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  linkRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inlineStat: {
    flex: 1,
    minWidth: 132,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  inlineStatLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  inlineStatValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  mediaCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  mediaImage: {
    width: "100%",
    height: 180,
    borderRadius: 8,
  },
  mediaLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
