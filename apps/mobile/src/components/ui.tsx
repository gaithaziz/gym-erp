import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import { useContext, useEffect, type PropsWithChildren, type ReactNode, type RefObject } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { API_BASE_URL, parseHomeEnvelope } from "@/lib/api";
import { hasCapability, isCustomerRole } from "@/lib/mobile-role";
import { NetworkContext } from "@/lib/network-context";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

/**
 * OfflineBanner — sticky strip shown when the device is offline.
 * Rendered at the top of each Screen so it never wraps the Stack navigator.
 */
export function OfflineBanner() {
  const { isOnline } = useContext(NetworkContext);
  const { fontSet, isRTL } = usePreferences();

  if (isOnline) return null;

  return (
    <View style={offlineBannerStyles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" />
      <Text style={[offlineBannerStyles.text, { fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left" }]}>
        {isRTL ? "لا يوجد اتصال بالإنترنت — قد تكون البيانات قديمة" : "No internet connection — showing cached data"}
      </Text>
    </View>
  );
}

const offlineBannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: "#374151",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
  },
});

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function FloatingChatButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { authorizedRequest, bootstrap, status } = useSession();
  const { copy, isRTL, theme } = usePreferences();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);

  const hidden = status !== "signed_in" || pathname === "/login" || pathname.includes("/chat") || !hasCapability(bootstrap, "view_chat");
  const homeQuery = useQuery({
    queryKey: ["mobile-home"],
    enabled: !hidden && isCustomerRole(bootstrap?.role),
    staleTime: 30_000,
    queryFn: async () => parseHomeEnvelope(await authorizedRequest("/mobile/customer/home")).data,
  });
  const unreadCount = homeQuery.data?.quick_stats.unread_chat_messages ?? 0;

  if (hidden) {
    return null;
  }

  const bottomOffset = Math.max(insets.bottom - 4, 0);

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
          bottom: bottomOffset,
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
  leadingAction,
  action,
  scrollable = true,
  scrollRef,
  compactTitle = false,
  showSubtitle = false,
  hideFloatingChat = false,
  contentPaddingBottom,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  leadingAction?: ReactNode;
  action?: ReactNode;
  scrollable?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  compactTitle?: boolean;
  showSubtitle?: boolean;
  hideFloatingChat?: boolean;
  contentPaddingBottom?: number;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { direction, isRTL, theme, themeMode, toggleLocale, toggleThemeMode, locale, fontSet } = usePreferences();
  const insets = useSafeAreaInsets();
  const resolvedContentPaddingBottom = contentPaddingBottom ?? (hideFloatingChat ? insets.bottom + 8 : insets.bottom + 28);
  const shouldShowBackButton = pathname !== "/" && pathname !== "/index" && pathname !== "/login" && !pathname.startsWith("/(tabs)") && router.canGoBack();
  const resolvedLeadingAction =
    leadingAction ??
    (shouldShowBackButton ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRTL ? "رجوع" : "Back"}
        onPress={() => router.back()}
        style={[styles.backButton, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={20} color={theme.foreground} />
      </Pressable>
    ) : null);
  const headerMain = (
    <View style={[styles.headerMain, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      {resolvedLeadingAction ? <View style={styles.headerLeading}>{resolvedLeadingAction}</View> : null}
      <View style={styles.headerText}>
        <Text
          style={[
            compactTitle ? styles.screenTitleCompact : styles.screenTitle,
            {
              color: theme.foreground,
              textAlign: isRTL ? "right" : "left",
              writingDirection: direction,
              fontFamily: fontSet.display,
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {showSubtitle && subtitle ? (
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
    </View>
  );
  const headerActions = (
    <View style={[styles.headerActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <Pressable onPress={() => void toggleThemeMode()} style={[styles.controlButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name={themeMode === "dark" ? "moon" : "sunny"} size={16} color={theme.primary} />
      </Pressable>
      <Pressable onPress={() => void toggleLocale()} style={[styles.controlButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.controlLabel, { color: theme.foreground, fontFamily: fontSet.mono }]}>{locale === "en" ? "AR" : "EN"}</Text>
      </Pressable>
      {action}
    </View>
  );
  const content = (
    <>
      <View style={styles.headerRow}>
        {isRTL ? headerActions : headerMain}
        {isRTL ? headerMain : headerActions}
      </View>
      {children}
    </>
  );

  useEffect(() => {
    if (!scrollable || !scrollRef?.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname, scrollRef, scrollable]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <OfflineBanner />
      {scrollable ? (
        <ScrollView
          ref={scrollRef}
          contentOffset={{ x: 0, y: 0 }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          contentContainerStyle={[styles.screenContent, { paddingBottom: resolvedContentPaddingBottom }]}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, styles.screenContentStatic, { paddingBottom: resolvedContentPaddingBottom }]}>{content}</View>
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
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary, flexDirection: isRTL ? "row-reverse" : "row" }, pressed && styles.buttonPressed, props.disabled && styles.buttonDisabled]}>
      <Text style={[styles.primaryButtonText, { color: "#FFFFFF", fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ children, ...props }: PropsWithChildren<PressableProps>) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.cardAlt, borderColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }, pressed && styles.buttonPressed, props.disabled && styles.buttonDisabled]}>
      <Text style={[styles.secondaryButtonText, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryLink({ href, children }: PropsWithChildren<{ href: string }>) {
  const { direction, isRTL, theme, fontSet } = usePreferences();
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
      <Text style={[styles.linkLabel, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{children}</Text>
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
  const { direction, isRTL, theme, fontSet } = usePreferences();
  return (
    <View
      style={[
        styles.inlineStat,
        {
          backgroundColor: theme.cardAlt,
          borderColor: theme.border,
          alignItems: isRTL ? "flex-end" : "flex-start",
        },
      ]}
    >
      <Text
        style={[
          styles.inlineStatLabel,
          {
            color: theme.primary,
            fontFamily: fontSet.mono,
            textAlign: isRTL ? "right" : "left",
            writingDirection: direction,
            letterSpacing: isRTL ? 0 : 0.5,
            textTransform: isRTL ? "none" : "uppercase",
          },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.inlineStatValue,
          {
            color: theme.foreground,
            fontFamily: fontSet.display,
            textAlign: isRTL ? "right" : "left",
            writingDirection: direction,
          },
        ]}
      >
        {value}
      </Text>
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
  const { copy, direction, isRTL, theme, fontSet } = usePreferences();
  if (!uri) {
    return null;
  }
  const resolvedUri =
    uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("file://") || uri.startsWith("content://")
      ? uri
      : `${ASSET_BASE_URL}${uri}`;
  const isImage = Boolean(mime?.startsWith("image/"));

  return (
    <View style={[styles.mediaCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      {isImage ? <Image source={{ uri: resolvedUri }} style={styles.mediaImage} contentFit="cover" /> : null}
      {!isImage || label ? (
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
          {label ?? copy.common.attachment}
        </Text>
      ) : null}
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
    if (isEmptyStateError(error)) {
      return (
        <Card>
          <MutedText>{emptyMessage || error}</MutedText>
        </Card>
      );
    }
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

function isEmptyStateError(message: string) {
  const normalized = message.trim().toLowerCase();
  return normalized === "not found" || normalized.includes(" not found") || normalized.includes("no data");
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    paddingTop: 4,
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerMain: {
    flex: 1,
    alignItems: "flex-start",
    gap: 10,
  },
  headerLeading: {
    flexShrink: 0,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerText: {
    gap: 4,
    flex: 1,
  },
  headerActions: {
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  screenTitleCompact: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  screenSubtitle: {
    fontSize: 13,
    lineHeight: 19,
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
    fontSize: 16,
    fontWeight: "700",
  },
  mutedText: {
    fontSize: 13,
    lineHeight: 18,
  },
  valueText: {
    fontSize: 19,
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
    fontSize: 15,
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
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.55,
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
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inlineStat: {
    flex: 1,
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  inlineStatLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  inlineStatValue: {
    fontSize: 18,
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
    fontSize: 12,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
