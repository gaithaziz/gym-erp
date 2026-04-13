import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseNotificationsEnvelope } from "@/lib/api";
import { localeTag, localizeNotificationEventType, localizeNotificationStatus } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function NotificationsScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const notificationsQuery = useQuery({
    queryKey: ["mobile-notifications"],
    queryFn: async () => parseNotificationsEnvelope(await authorizedRequest("/mobile/customer/notifications")).data,
  });
  const notifications = notificationsQuery.data;

  return (
    <Screen title={copy.common.notifications} subtitle={copy.notificationsScreen.subtitle}>
      <QueryState
        loading={notificationsQuery.isLoading}
        error={notificationsQuery.error instanceof Error ? notificationsQuery.error.message : null}
        empty={Boolean(notifications && notifications.items.length === 0)}
        emptyMessage={copy.common.noData}
      />
      {notifications?.items.map((item) => (
        <Card key={item.id}>
          <View style={[styles.headerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.textBlock}>
              <SectionTitle>{item.title}</SectionTitle>
              <MutedText>{item.body}</MutedText>
            </View>
            <Text style={[styles.statusText, { color: theme.primary, fontFamily: fontSet.mono }]}>
              {localizeNotificationStatus(item.status, isRTL)}
            </Text>
          </View>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {localizeNotificationEventType(item.event_type, isRTL)}
          </Text>
          <MutedText>{item.created_at ? new Date(item.created_at).toLocaleString(locale) : copy.common.noData}</MutedText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
