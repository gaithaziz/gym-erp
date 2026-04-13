import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, TextArea } from "@/components/ui";
import { parseEnvelope, type MobileFeedbackHistory } from "@/lib/api";
import { localeTag } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

const GYM_FEEDBACK_CATEGORIES = ["GENERAL", "EQUIPMENT", "CLEANLINESS", "STAFF", "CLASSES"] as const;

export default function FeedbackScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const locale = localeTag(isRTL);
  const [category, setCategory] = useState<(typeof GYM_FEEDBACK_CATEGORIES)[number]>("GENERAL");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const feedbackQuery = useQuery({
    queryKey: ["mobile-feedback-history"],
    queryFn: async () => parseEnvelope<MobileFeedbackHistory>(await authorizedRequest("/mobile/customer/feedback/history")).data,
  });
  const feedback = feedbackQuery.data;

  const gymFeedbackMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/fitness/gym-feedback", {
        method: "POST",
        body: JSON.stringify({
          category,
          rating,
          comment: comment.trim() || null,
        }),
      }),
    onSuccess: async () => {
      setComment("");
      setRating(5);
      setCategory("GENERAL");
      setFormMessage(copy.feedbackScreen.feedbackSaved);
      await queryClient.invalidateQueries({ queryKey: ["mobile-feedback-history"] });
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  return (
    <Screen title={copy.common.feedbackHistory} subtitle={copy.feedbackScreen.subtitle}>
      <Card>
        <SectionTitle>{copy.feedbackScreen.submitGymFeedback}</SectionTitle>
        <View style={[styles.chipList, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {GYM_FEEDBACK_CATEGORIES.map((item) => (
            <ChoiceChip
              key={item}
              label={localizeGymFeedbackCategory(item, copy.feedbackScreen)}
              active={item === category}
              onPress={() => setCategory(item)}
            />
          ))}
        </View>
        <MutedText>{copy.feedbackScreen.rating}</MutedText>
        <View style={[styles.ratingRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {[1, 2, 3, 4, 5].map((item) => (
            <ChoiceChip key={item} label={String(item)} active={item === rating} onPress={() => setRating(item)} compact />
          ))}
        </View>
        <TextArea value={comment} onChangeText={setComment} placeholder={copy.feedbackScreen.commentPlaceholder} />
        <PrimaryButton onPress={() => gymFeedbackMutation.mutate()} disabled={gymFeedbackMutation.isPending}>
          {gymFeedbackMutation.isPending ? copy.feedbackScreen.submittingFeedback : copy.feedbackScreen.submitGymFeedback}
        </PrimaryButton>
        {formMessage ? <MutedText>{formMessage}</MutedText> : null}
      </Card>

      <QueryState loading={feedbackQuery.isLoading} error={feedbackQuery.error instanceof Error ? feedbackQuery.error.message : null} />
      {feedback ? (
        <>
          <Card>
              <SectionTitle>{copy.feedbackScreen.workout}</SectionTitle>
              {feedback.workout_feedback.length === 0 ? (
                <MutedText>{copy.feedbackScreen.noWorkout}</MutedText>
              ) : (
                feedback.workout_feedback.map((item) => (
                  <View key={item.id} style={styles.entryBlock}>
                    <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                      {item.plan_name}
                    </Text>
                    <MutedText>{item.difficulty_rating ?? "--"}/5 • {item.comment || copy.common.noComment}</MutedText>
                    <MutedText>{new Date(item.date).toLocaleDateString(locale)}</MutedText>
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
                  <View key={item.id} style={styles.entryBlock}>
                    <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                      {item.diet_plan_name || copy.feedbackScreen.dietPlan}
                    </Text>
                    <MutedText>{item.rating}/5 • {item.comment || copy.common.noComment}</MutedText>
                    <MutedText>{new Date(item.created_at).toLocaleDateString(locale)}</MutedText>
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
                  <View key={item.id} style={styles.entryBlock}>
                    <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                      {localizeGymFeedbackCategory(item.category, copy.feedbackScreen)}
                    </Text>
                    <MutedText>{item.rating}/5 • {item.comment || copy.common.noComment}</MutedText>
                    <MutedText>{new Date(item.created_at).toLocaleDateString(locale)}</MutedText>
                  </View>
                ))
              )}
            </Card>
        </>
      ) : null}
    </Screen>
  );
}

function localizeGymFeedbackCategory(category: string, copy: {
  equipment: string;
  cleanliness: string;
  staff: string;
  classes: string;
  general: string;
}) {
  const map: Record<string, string> = {
    EQUIPMENT: copy.equipment,
    CLEANLINESS: copy.cleanliness,
    STAFF: copy.staff,
    CLASSES: copy.classes,
    GENERAL: copy.general,
  };
  return map[category] ?? category;
}

function ChoiceChip({ label, active, onPress, compact }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable onPress={onPress} style={[styles.chip, compact && styles.ratingChip, { backgroundColor: active ? theme.primarySoft : theme.cardAlt, borderColor: active ? theme.primary : theme.border }]}>
      <Text style={[styles.chipText, { color: active ? theme.primary : theme.foreground, fontFamily: fontSet.body }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entryBlock: {
    gap: 4,
  },
  chipList: {
    flexWrap: "wrap",
    gap: 8,
  },
  ratingRow: {
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ratingChip: {
    minWidth: 42,
    alignItems: "center",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
