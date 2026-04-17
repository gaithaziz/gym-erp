import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle, SecondaryButton } from "@/components/ui";
import { parseCoachFeedbackEnvelope } from "@/lib/api";
import { localeTag } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function CoachFeedbackScreen() {
  const router = useRouter();
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const feedbackQuery = useQuery({
    queryKey: ["mobile-coach-feedback"],
    queryFn: async () => parseCoachFeedbackEnvelope(await authorizedRequest("/mobile/staff/coach/feedback")).data,
  });
  const feedback = feedbackQuery.data;

  return (
    <Screen title={copy.common.feedbackHistory} subtitle={copy.feedbackScreen.coachSubtitle}>
      <QueryState loading={feedbackQuery.isLoading} error={feedbackQuery.error instanceof Error ? feedbackQuery.error.message : null} />

      {feedback ? (
        <>
          <Card>
            <SectionTitle>{copy.staffHome.title}</SectionTitle>
            <MutedText>{`${copy.feedbackScreen.workout}: ${feedback.stats.workout_feedback}`}</MutedText>
            <MutedText>{`${copy.feedbackScreen.diet}: ${feedback.stats.diet_feedback}`}</MutedText>
            <MutedText>{`${copy.feedbackScreen.gym}: ${feedback.stats.gym_feedback}`}</MutedText>
          </Card>

          <FeedbackSection
            title={copy.feedbackScreen.workout}
            emptyLabel={copy.feedbackScreen.noWorkout}
            items={feedback.workout_feedback.map((item) => ({
              id: item.id,
              memberId: item.member_id,
              title: item.plan_name || copy.feedbackScreen.workout,
              subtitle: `${copy.feedbackScreen.member}: ${item.member_name || copy.common.customer}`,
              meta: `${item.difficulty_rating ?? "--"}/5`,
              comment: item.comment || copy.common.noComment,
              date: item.date,
            }))}
            locale={locale}
            onOpenMember={(memberId) => router.push({ pathname: "/(tabs)/members", params: { memberId } })}
          />

          <FeedbackSection
            title={copy.feedbackScreen.diet}
            emptyLabel={copy.feedbackScreen.noDiet}
            items={feedback.diet_feedback.map((item) => ({
              id: item.id,
              memberId: item.member_id,
              title: item.diet_plan_name || copy.feedbackScreen.dietPlan,
              subtitle: `${copy.feedbackScreen.member}: ${item.member_name || copy.common.customer}`,
              meta: `${item.rating}/5`,
              comment: item.comment || copy.common.noComment,
              date: item.created_at,
            }))}
            locale={locale}
            onOpenMember={(memberId) => router.push({ pathname: "/(tabs)/members", params: { memberId } })}
          />

          <FeedbackSection
            title={copy.feedbackScreen.gym}
            emptyLabel={copy.feedbackScreen.noGym}
            items={feedback.gym_feedback.map((item) => ({
              id: item.id,
              memberId: item.member_id,
              title: localizeGymFeedbackCategory(item.category, copy.feedbackScreen),
              subtitle: `${copy.feedbackScreen.member}: ${item.member_name || copy.common.customer}`,
              meta: `${item.rating}/5`,
              comment: item.comment || copy.common.noComment,
              date: item.created_at,
            }))}
            locale={locale}
            onOpenMember={(memberId) => router.push({ pathname: "/(tabs)/members", params: { memberId } })}
          />
        </>
      ) : null}
    </Screen>
  );
}

function localizeGymFeedbackCategory(category: string, copy: { equipment: string; cleanliness: string; staff: string; classes: string; general: string }) {
  const map: Record<string, string> = {
    EQUIPMENT: copy.equipment,
    CLEANLINESS: copy.cleanliness,
    STAFF: copy.staff,
    CLASSES: copy.classes,
    GENERAL: copy.general,
  };
  return map[category] ?? category;
}

function FeedbackSection({
  title,
  emptyLabel,
  items,
  locale,
  onOpenMember,
}: {
  title: string;
  emptyLabel: string;
  items: Array<{ id: string; memberId?: string | null; title: string; subtitle: string; meta: string; comment: string; date: string }>;
  locale: string;
  onOpenMember: (memberId: string) => void;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {items.length === 0 ? (
        <MutedText>{emptyLabel}</MutedText>
      ) : (
        items.map((item) => (
          <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: theme.border, marginTop: 12, paddingTop: 12, gap: 6 }}>
            <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
              {item.title}
            </Text>
            <MutedText>{item.subtitle}</MutedText>
            <MutedText>{`${item.meta} • ${new Date(item.date).toLocaleDateString(locale)}`}</MutedText>
            <MutedText>{item.comment}</MutedText>
            {item.memberId ? (
              <SecondaryButton onPress={() => onOpenMember(item.memberId!)}>{copy.feedbackScreen.openMember}</SecondaryButton>
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}
