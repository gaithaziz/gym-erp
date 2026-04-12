import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseNotificationsEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function NotificationsScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
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
          <SectionTitle>{item.title}</SectionTitle>
          <MutedText>{item.body}</MutedText>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {item.event_type}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
