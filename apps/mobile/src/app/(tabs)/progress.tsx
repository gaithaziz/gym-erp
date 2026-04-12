import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseProgressEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function ProgressTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const progressQuery = useQuery({
    queryKey: ["mobile-progress"],
    queryFn: async () => parseProgressEnvelope(await authorizedRequest("/mobile/customer/progress")).data,
  });
  const progress = progressQuery.data;
  const locale = isRTL ? "ar" : "en";

  return (
    <Screen title={copy.progress.title} subtitle={copy.progress.subtitle}>
      <QueryState loading={progressQuery.isLoading} error={progressQuery.error instanceof Error ? progressQuery.error.message : null} />
      {progress ? (
        <>
          <Card>
            <SectionTitle>{copy.progress.biometrics}</SectionTitle>
            {progress.biometrics.length === 0 ? (
              <MutedText>{copy.progress.noBiometrics}</MutedText>
            ) : (
              progress.biometrics.slice(0, 5).map((entry) => (
                <View key={entry.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {new Date(entry.date).toLocaleDateString(locale)}
                  </Text>
                  <MutedText>{entry.weight_kg ?? "--"} kg / {entry.body_fat_pct ?? "--"}% body fat</MutedText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <SectionTitle>{copy.progress.recentSessions}</SectionTitle>
            {progress.recent_workout_sessions.length === 0 ? (
              <MutedText>{copy.progress.noSessions}</MutedText>
            ) : (
              progress.recent_workout_sessions.map((session) => (
                <View key={session.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {new Date(session.performed_at).toLocaleString(locale)}
                  </Text>
                  <MutedText>{session.duration_minutes ?? "--"} {copy.common.minutesShort}</MutedText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <SectionTitle>{copy.progress.attendance}</SectionTitle>
            <MutedText>{progress.attendance_history.length} {copy.progress.recentScans}</MutedText>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
