import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle, ValueText } from "@/components/ui";
import { parseHomeEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function QrTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const homeQuery = useQuery({
    queryKey: ["mobile-home-qr"],
    queryFn: async () => parseHomeEnvelope(await authorizedRequest("/mobile/customer/home")).data,
  });
  const home = homeQuery.data;

  return (
    <Screen title={copy.qr.title} subtitle={copy.qr.subtitle}>
      <QueryState loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card>
            <SectionTitle>{copy.qr.entranceStatus}</SectionTitle>
            <ValueText>{home.subscription.status}</ValueText>
            <MutedText>{home.subscription.plan_name || copy.common.noCurrentPlan}</MutedText>
          </Card>
          <Card style={[styles.qrCard, { backgroundColor: theme.cardAlt }]}>
            <Text style={[styles.qrLabel, { color: theme.muted, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {copy.qr.qrToken}
            </Text>
            <Text style={[styles.qrValue, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {home.qr.token}
            </Text>
            <MutedText>
              {copy.qr.expiresIn} {home.qr.expires_in_seconds} {copy.qr.seconds}
            </MutedText>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrCard: {},
  qrLabel: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  qrValue: {
    fontSize: 16,
    lineHeight: 24,
  },
});
