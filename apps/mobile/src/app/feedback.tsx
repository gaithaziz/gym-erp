import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseEnvelope, type MobileFeedbackHistory } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function FeedbackScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const feedbackQuery = useQuery({
    queryKey: ["mobile-feedback-history"],
    queryFn: async () => parseEnvelope<MobileFeedbackHistory>(await authorizedRequest("/mobile/customer/feedback/history")).data,
  });
  const feedback = feedbackQuery.data;

  return (
    <Screen title={copy.common.feedbackHistory} subtitle={copy.feedbackScreen.subtitle}>
      <QueryState loading={feedbackQuery.isLoading} error={feedbackQuery.error instanceof Error ? feedbackQuery.error.message : null} />
      {feedback ? (
        <>
          <Card>
            <SectionTitle>{copy.feedbackScreen.workout}</SectionTitle>
            {feedback.workout_feedback.length === 0 ? (
              <MutedText>{copy.feedbackScreen.noWorkout}</MutedText>
            ) : (
              feedback.workout_feedback.map((item) => (
                <View key={item.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {item.plan_name}
                  </Text>
                  <MutedText>{item.difficulty_rating ?? "--"}/5 • {item.comment || copy.common.noComment}</MutedText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <SectionTitle>{copy.feedbackScreen.diet}</SectionTitle>
            {feedback.diet_feedback.length === 0 ? (
              <MutedText>{copy.feedbackScreen.noDiet}</MutedText>
            ) : (
              feedback.diet_feedback.map((item) => (
                <View key={item.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {item.diet_plan_name || copy.feedbackScreen.dietPlan}
                  </Text>
                  <MutedText>{item.rating}/5 • {item.comment || copy.common.noComment}</MutedText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <SectionTitle>{copy.feedbackScreen.gym}</SectionTitle>
            {feedback.gym_feedback.length === 0 ? (
              <MutedText>{copy.feedbackScreen.noGym}</MutedText>
            ) : (
              feedback.gym_feedback.map((item) => (
                <View key={item.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {item.category}
                  </Text>
                  <MutedText>{item.rating}/5 • {item.comment || copy.common.noComment}</MutedText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
