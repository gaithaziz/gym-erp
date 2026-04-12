import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parsePlansEnvelope } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function PlansTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const plansQuery = useQuery({
    queryKey: ["mobile-plans"],
    queryFn: async () => parsePlansEnvelope(await authorizedRequest("/mobile/customer/plans")).data,
  });
  const plans = plansQuery.data;

  return (
    <Screen title={copy.plans.title} subtitle={copy.plans.subtitle}>
      <QueryState loading={plansQuery.isLoading} error={plansQuery.error instanceof Error ? plansQuery.error.message : null} />
      {plans ? (
        <>
          <Card>
            <SectionTitle>{copy.plans.workoutPlans}</SectionTitle>
            {plans.workout_plans.length === 0 ? (
              <MutedText>{copy.plans.noWorkoutPlans}</MutedText>
            ) : (
              plans.workout_plans.map((plan) => (
                <View key={plan.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {plan.name}
                  </Text>
                  <MutedText>{plan.expected_sessions_per_30d} {copy.common.expectedSessions30d}</MutedText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <SectionTitle>{copy.plans.dietPlans}</SectionTitle>
            {plans.diet_plans.length === 0 ? (
              <MutedText>{copy.plans.noDietPlans}</MutedText>
            ) : (
              plans.diet_plans.map((plan) => (
                <View key={plan.id}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {plan.name}
                  </Text>
                  <MutedText>{plan.status}</MutedText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
