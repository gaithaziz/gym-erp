import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Card, MediaPreview, MutedText, QueryState, Screen, SectionTitle, SecondaryButton } from "@/components/ui";
import { parseCoachFeedbackEnvelope } from "@/lib/api";
import { localeTag } from "@/lib/mobile-format";
import { getCurrentRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function CoachFeedbackScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const locale = localeTag(isRTL);
  const role = getCurrentRole(bootstrap);
  const canReviewSessions = role === "ADMIN" || role === "COACH";
  const canAdjustPlans = role === "COACH";
  const feedbackQuery = useQuery({
    queryKey: ["mobile-coach-feedback"],
    queryFn: async () => parseCoachFeedbackEnvelope(await authorizedRequest("/mobile/staff/coach/feedback")).data,
  });
  const reviewMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await authorizedRequest(`/fitness/session-logs/${sessionId}/review`, {
        method: "POST",
        body: JSON.stringify({ reviewed: true, reviewer_note: copy.feedbackScreen.reviewedByCoach }),
      });
    },
    onSuccess: async () => {
      setExpandedSessionId(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile-coach-feedback"] });
    },
  });
  const feedback = feedbackQuery.data;

  return (
    <Screen title={copy.common.feedbackHistory} subtitle={copy.feedbackScreen.coachSubtitle}>
      <QueryState loading={feedbackQuery.isLoading} error={feedbackQuery.error instanceof Error ? feedbackQuery.error.message : null} />

      {feedback ? (
        <>
          <Card>
            <SectionTitle>{copy.staffHome.title}</SectionTitle>
            <MutedText>{`${copy.feedbackScreen.flaggedSessions}: ${feedback.stats.flagged_sessions ?? feedback.flagged_sessions.length}`}</MutedText>
            <MutedText>{`${copy.feedbackScreen.workout}: ${feedback.stats.workout_feedback}`}</MutedText>
            <MutedText>{`${copy.feedbackScreen.diet}: ${feedback.stats.diet_feedback}`}</MutedText>
            <MutedText>{`${copy.feedbackScreen.gym}: ${feedback.stats.gym_feedback}`}</MutedText>
          </Card>

          <Card>
            <SectionTitle>{copy.feedbackScreen.flaggedSessions}</SectionTitle>
            {feedback.flagged_sessions.length === 0 ? (
              <MutedText>{copy.feedbackScreen.noFlaggedSessions}</MutedText>
            ) : (
              feedback.flagged_sessions.map((session) => {
                const expanded = expandedSessionId === session.id;
                return (
                  <View key={session.id} style={{ borderTopWidth: 1, borderTopColor: theme.border, marginTop: 12, paddingTop: 12, gap: 8 }}>
                    <Pressable onPress={() => setExpandedSessionId((current) => current === session.id ? null : session.id)}>
                      <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                        {session.plan_name || copy.feedbackScreen.workoutSession}
                      </Text>
                      <MutedText>{`${copy.feedbackScreen.member}: ${session.member_name || copy.common.customer}`}</MutedText>
                      <MutedText>
                        {[
                          itemDate(session.performed_at, locale),
                          session.duration_minutes != null ? `${session.duration_minutes} ${copy.common.minutesShort}` : null,
                          session.rpe != null ? `${copy.feedbackScreen.rpe}: ${session.rpe}` : null,
                          session.pain_level != null ? `${copy.feedbackScreen.pain}: ${session.pain_level}` : null,
                          session.effort_feedback ? localizeEffort(session.effort_feedback, copy.feedbackScreen) : null,
                          `${copy.feedbackScreen.skipped}: ${session.skipped_count}`,
                          `${session.pr_count} ${copy.feedbackScreen.prs}`,
                          session.attachment_url ? copy.feedbackScreen.attachment : null,
                        ].filter(Boolean).join(" • ")}
                      </MutedText>
                    </Pressable>
                    {session.notes ? <MutedText>{session.notes}</MutedText> : null}
                    {expanded ? (
                      <View style={{ gap: 8 }}>
                        {session.attachment_url ? <MediaPreview uri={session.attachment_url} mime={session.attachment_mime} label={copy.feedbackScreen.attachment} /> : null}
                        {session.entries.map((entry, index) => (
                          <View key={entry.id || `${session.id}-${index}`} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, backgroundColor: theme.cardAlt }}>
                            <Text style={{ color: theme.foreground, fontFamily: fontSet.body, fontWeight: "700", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                              {entry.exercise_name || copy.feedbackScreen.workout}{entry.skipped ? ` • ${copy.feedbackScreen.skipped}` : ""}{entry.is_pr ? ` • ${copy.feedbackScreen.prs}` : ""}
                            </Text>
                            <MutedText>{entry.skipped ? copy.feedbackScreen.skipped : `${entry.sets_completed} x ${entry.reps_completed} @ ${entry.weight_kg ?? 0}${copy.feedbackScreen.weightUnit}`}</MutedText>
                            {entry.set_details?.length ? (
                              <MutedText>{entry.set_details.map((row) => `${row.set}: ${row.reps} @ ${Number(row.weightKg || 0)}${copy.feedbackScreen.weightUnit}`).join(" • ")}</MutedText>
                            ) : null}
                            {entry.notes ? <MutedText>{entry.notes}</MutedText> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {session.member_id ? (
                      <SecondaryButton onPress={() => router.push({ pathname: "/(tabs)/members", params: { memberId: session.member_id } })}>{copy.feedbackScreen.openMember}</SecondaryButton>
                    ) : null}
                    {canAdjustPlans && session.member_id ? (
                      <SecondaryButton onPress={() => router.push({ pathname: "/(tabs)/plans", params: { memberId: session.member_id } })}>{copy.feedbackScreen.adjustPlan}</SecondaryButton>
                    ) : null}
                    {canReviewSessions ? (
                      <SecondaryButton disabled={reviewMutation.isPending} onPress={() => reviewMutation.mutate(session.id)}>
                        {reviewMutation.isPending ? copy.common.loading : copy.feedbackScreen.markReviewed}
                      </SecondaryButton>
                    ) : null}
                  </View>
                );
              })
            )}
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

function itemDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale);
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

function localizeEffort(value: string, copy: { tooEasy: string; justRight: string; tooHard: string }) {
  if (value === "TOO_EASY") return copy.tooEasy;
  if (value === "JUST_RIGHT") return copy.justRight;
  if (value === "TOO_HARD") return copy.tooHard;
  return value;
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
