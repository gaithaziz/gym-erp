import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type WorkoutPlan = {
  id: string;
  name: string;
  description?: string | null;
  exercises?: Array<{
    id?: string;
    exercise_id?: string | null;
    exercise_name?: string | null;
    section_name?: string | null;
    sets: number;
    reps: number;
    duration_minutes?: number | null;
    order?: number;
    embed_url?: string | null;
    uploaded_video_url?: string | null;
    video_url?: string | null;
    video_type?: string | null;
  }>;
};

type DietTracker = {
  plan_id: string;
  plan_name: string;
  description?: string | null;
  has_structured_content: boolean;
  legacy_content?: string | null;
  days: Array<{
    id: string;
    name: string;
    meals: Array<{
      id: string;
      name: string;
      completed: boolean;
      note?: string | null;
      time_label?: string | null;
      instructions?: string | null;
      items: Array<{ id: string; label: string; quantity?: string | null }>;
    }>;
  }>;
  tracking_day?: {
    tracked_for: string;
    adherence_rating?: number | null;
    notes?: string | null;
  } | null;
};

type WorkoutDraft = {
  id: string;
  current_exercise_index: number;
  entries: Array<{
    id: string;
    exercise_name?: string | null;
    section_name?: string | null;
    target_sets?: number | null;
    target_reps?: number | null;
    target_duration_minutes?: number | null;
    embed_url?: string | null;
    uploaded_video_url?: string | null;
    video_url?: string | null;
    video_type?: string | null;
    sets_completed: number;
    reps_completed: number;
    weight_kg?: number | null;
    notes?: string | null;
    is_pr: boolean;
    pr_type?: string | null;
    pr_value?: string | null;
    pr_notes?: string | null;
    skipped: boolean;
    completed_at?: string | null;
  }>;
};

type ExerciseForm = {
  setsCompleted: string;
  repsCompleted: string;
  weightKg: string;
  notes: string;
  isPr: boolean;
  prType: string;
  prValue: string;
  prNotes: string;
};

const emptyForm: ExerciseForm = {
  setsCompleted: "",
  repsCompleted: "",
  weightKg: "",
  notes: "",
  isPr: false,
  prType: "WEIGHT",
  prValue: "",
  prNotes: "",
};

export default function PlansTab() {
  const queryClient = useQueryClient();
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [selectedWorkoutPlanId, setSelectedWorkoutPlanId] = useState<string | null>(null);
  const [selectedDietId, setSelectedDietId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedDietDayId, setSelectedDietDayId] = useState<string | null>(null);
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(emptyForm);
  const [sessionDuration, setSessionDuration] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [dietDayNotes, setDietDayNotes] = useState("");
  const [dietAdherence, setDietAdherence] = useState("3");
  const today = new Date().toISOString().slice(0, 10);

  const plansQuery = useQuery({
    queryKey: ["member-plan-detail-lists"],
    queryFn: async () => {
      const [workouts, diets] = await Promise.all([
        authorizedRequest<WorkoutPlan[]>("/fitness/plans"),
        authorizedRequest<Array<{ id: string; name: string; description?: string | null }>>("/fitness/diets"),
      ]);
      return { workouts: workouts.data, diets: diets.data };
    },
  });

  useEffect(() => {
    if (!plansQuery.data) return;
    setSelectedWorkoutPlanId((current) => current ?? plansQuery.data.workouts[0]?.id ?? null);
    setSelectedDietId((current) => current ?? plansQuery.data.diets[0]?.id ?? null);
  }, [plansQuery.data]);

  const selectedWorkoutPlan = useMemo(
    () => plansQuery.data?.workouts.find((plan) => plan.id === selectedWorkoutPlanId) ?? null,
    [plansQuery.data, selectedWorkoutPlanId],
  );

  const workoutSections = useMemo(() => {
    const values = new Set<string>();
    for (const exercise of selectedWorkoutPlan?.exercises || []) {
      if (exercise.section_name?.trim()) values.add(exercise.section_name.trim());
    }
    return Array.from(values);
  }, [selectedWorkoutPlan]);

  useEffect(() => {
    if (workoutSections.length === 0) {
      setSelectedSection(null);
      return;
    }
    setSelectedSection((current) => (current && workoutSections.includes(current) ? current : workoutSections[0]));
  }, [workoutSections]);

  const activeDraftQuery = useQuery({
    queryKey: ["member-active-workout-draft", selectedWorkoutPlanId],
    enabled: !!selectedWorkoutPlanId,
    queryFn: async () => {
      const payload = await authorizedRequest<WorkoutDraft | null>("/fitness/workout-sessions/active?plan_id=" + selectedWorkoutPlanId);
      return payload.data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["member-workout-history", selectedWorkoutPlanId],
    enabled: !!selectedWorkoutPlanId,
    queryFn: async () => {
      const payload = await authorizedRequest<
        Array<{ id: string; performed_at: string; duration_minutes?: number | null; entries: Array<{ is_pr?: boolean }> }>
      >("/fitness/session-logs/me?plan_id=" + selectedWorkoutPlanId);
      return payload.data;
    },
  });

  const dietTrackerQuery = useQuery({
    queryKey: ["member-diet-tracker", selectedDietId, today],
    enabled: !!selectedDietId,
    queryFn: async () => {
      const payload = await authorizedRequest<DietTracker>(`/fitness/diets/${selectedDietId}/tracking?tracked_for=${today}`);
      return payload.data;
    },
  });

  useEffect(() => {
    const draft = activeDraftQuery.data;
    const currentEntry = draft?.entries[draft.current_exercise_index];
    if (!currentEntry) {
      setExerciseForm(emptyForm);
      return;
    }
    setExerciseForm({
      setsCompleted: currentEntry.sets_completed ? String(currentEntry.sets_completed) : "",
      repsCompleted: currentEntry.reps_completed ? String(currentEntry.reps_completed) : "",
      weightKg: currentEntry.weight_kg != null ? String(currentEntry.weight_kg) : "",
      notes: currentEntry.notes || "",
      isPr: !!currentEntry.is_pr,
      prType: currentEntry.pr_type || "WEIGHT",
      prValue: currentEntry.pr_value || "",
      prNotes: currentEntry.pr_notes || "",
    });
  }, [activeDraftQuery.data?.id, activeDraftQuery.data?.current_exercise_index]);

  useEffect(() => {
    if (!dietTrackerQuery.data) return;
    setSelectedDietDayId((current) => current ?? dietTrackerQuery.data.days[0]?.id ?? null);
    setDietDayNotes(dietTrackerQuery.data.tracking_day?.notes || "");
    setDietAdherence(String(dietTrackerQuery.data.tracking_day?.adherence_rating || 3));
  }, [dietTrackerQuery.data]);

  const selectedDietDay = dietTrackerQuery.data?.days.find((day) => day.id === selectedDietDayId) ?? dietTrackerQuery.data?.days[0] ?? null;
  const currentEntry = activeDraftQuery.data?.entries[activeDraftQuery.data.current_exercise_index] ?? null;
  const completedCount = activeDraftQuery.data?.entries.filter((entry) => entry.completed_at || entry.skipped).length ?? 0;

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkoutPlanId) throw new Error("No workout plan selected");
      const payload = await authorizedRequest<WorkoutDraft>("/fitness/workout-sessions/start", {
        method: "POST",
        body: JSON.stringify({ plan_id: selectedWorkoutPlanId, section_name: selectedSection }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data || !currentEntry) throw new Error("No active exercise");
      const payload = await authorizedRequest<WorkoutDraft>(`/fitness/workout-sessions/${activeDraftQuery.data.id}/entries/${currentEntry.id}`, {
        method: "PUT",
        body: JSON.stringify({
          sets_completed: Number(exerciseForm.setsCompleted || 0),
          reps_completed: Number(exerciseForm.repsCompleted || 0),
          weight_kg: exerciseForm.weightKg ? Number(exerciseForm.weightKg) : null,
          notes: exerciseForm.notes || null,
          is_pr: exerciseForm.isPr,
          pr_type: exerciseForm.isPr ? exerciseForm.prType : null,
          pr_value: exerciseForm.isPr ? exerciseForm.prValue || null : null,
          pr_notes: exerciseForm.isPr ? exerciseForm.prNotes || null : null,
        }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data || !currentEntry) throw new Error("No active exercise");
      const payload = await authorizedRequest<WorkoutDraft>(`/fitness/workout-sessions/${activeDraftQuery.data.id}/entries/${currentEntry.id}/skip`, {
        method: "POST",
        body: JSON.stringify({ notes: exerciseForm.notes || null }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
  });

  const finishMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data) throw new Error("No active draft");
      const payload = await authorizedRequest(`/fitness/workout-sessions/${activeDraftQuery.data.id}/finish`, {
        method: "POST",
        body: JSON.stringify({
          duration_minutes: sessionDuration ? Number(sessionDuration) : null,
          notes: sessionNotes || null,
        }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      setSessionDuration("");
      setSessionNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] }),
        queryClient.invalidateQueries({ queryKey: ["member-workout-history", selectedWorkoutPlanId] }),
      ]);
    },
  });

  const abandonMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data) throw new Error("No active draft");
      await authorizedRequest(`/fitness/workout-sessions/${activeDraftQuery.data.id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      setSessionDuration("");
      setSessionNotes("");
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
  });

  const saveDietMutation = useMutation({
    mutationFn: async (overrideMeals?: Array<{ meal_id: string; completed: boolean; note?: string | null }>) => {
      if (!selectedDietId) throw new Error("No diet selected");
      const meals = overrideMeals ?? (selectedDietDay?.meals.map((meal) => ({
        meal_id: meal.id,
        completed: meal.completed,
        note: meal.note || null,
      })) || []);
      const payload = await authorizedRequest<DietTracker>(`/fitness/diets/${selectedDietId}/tracking`, {
        method: "PUT",
        body: JSON.stringify({
          tracked_for: today,
          adherence_rating: Number(dietAdherence),
          notes: dietDayNotes || null,
          meals,
        }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["member-diet-tracker", selectedDietId, today] });
    },
  });

  const handleToggleMeal = async (mealId: string, completed: boolean) => {
    if (!selectedDietDay) return;
    const meals = selectedDietDay.meals.map((meal) => ({
      meal_id: meal.id,
      completed: meal.id === mealId ? completed : meal.completed,
      note: meal.note || null,
    }));
    await saveDietMutation.mutateAsync(meals);
  };

  return (
    <Screen title={copy.plans.title}>
      <QueryState loading={plansQuery.isLoading} error={plansQuery.error instanceof Error ? plansQuery.error.message : null} />
      {plansQuery.data ? (
        <>
          <Card>
            <SectionTitle>{copy.plans.workoutPlans}</SectionTitle>
            {plansQuery.data.workouts.length === 0 ? (
              <MutedText>{copy.plans.noWorkoutPlans}</MutedText>
            ) : (
              plansQuery.data.workouts.map((plan) => (
                <Pressable key={plan.id} onPress={() => setSelectedWorkoutPlanId(plan.id)} style={{ paddingVertical: 10 }}>
                  <Text style={{ color: selectedWorkoutPlanId === plan.id ? theme.primary : theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {plan.name}
                  </Text>
                  <MutedText>{plan.exercises?.length || 0} exercises</MutedText>
                </Pressable>
              ))
            )}
          </Card>

          {selectedWorkoutPlan ? (
            <Card>
              <SectionTitle>{selectedWorkoutPlan.name}</SectionTitle>
              {workoutSections.length > 0 && !activeDraftQuery.data ? (
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  {workoutSections.map((section) => (
                    <SecondaryButton key={section} onPress={() => setSelectedSection(section)}>
                      {selectedSection === section ? `${copy.plans.section}: ${section}` : section}
                    </SecondaryButton>
                  ))}
                </View>
              ) : null}

              {!activeDraftQuery.data ? (
                <PrimaryButton onPress={() => startMutation.mutate(undefined)}>{copy.plans.startSession}</PrimaryButton>
              ) : (
                <View style={{ gap: 12, marginTop: 12 }}>
                  <MutedText>{copy.plans.progress}: {completedCount}/{activeDraftQuery.data.entries.length}</MutedText>
                  {currentEntry ? (
                    <>
                      <Text style={{ color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                        {copy.plans.currentExercise}: {currentEntry.exercise_name}
                      </Text>
                      <MutedText>
                        {copy.plans.target}: {currentEntry.target_sets || 0} x {currentEntry.target_reps || 0}
                        {currentEntry.section_name ? ` • ${copy.plans.section}: ${currentEntry.section_name}` : ""}
                      </MutedText>
                      <Input value={exerciseForm.setsCompleted} onChangeText={(value) => setExerciseForm((current) => ({ ...current, setsCompleted: value }))} placeholder={copy.plans.setsCompleted} />
                      <Input value={exerciseForm.repsCompleted} onChangeText={(value) => setExerciseForm((current) => ({ ...current, repsCompleted: value }))} placeholder={copy.plans.repsCompleted} />
                      <Input value={exerciseForm.weightKg} onChangeText={(value) => setExerciseForm((current) => ({ ...current, weightKg: value }))} placeholder={copy.plans.weightKg} />
                      <TextArea value={exerciseForm.notes} onChangeText={(value) => setExerciseForm((current) => ({ ...current, notes: value }))} placeholder={copy.plans.exerciseNotes} />
                      <Pressable onPress={() => setExerciseForm((current) => ({ ...current, isPr: !current.isPr }))} style={{ paddingVertical: 6 }}>
                        <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                          {exerciseForm.isPr ? "✓ " : ""}{copy.plans.prToggle}
                        </Text>
                      </Pressable>
                      {exerciseForm.isPr ? (
                        <>
                          <Input value={exerciseForm.prType} onChangeText={(value) => setExerciseForm((current) => ({ ...current, prType: value }))} placeholder={copy.plans.prType} />
                          <Input value={exerciseForm.prValue} onChangeText={(value) => setExerciseForm((current) => ({ ...current, prValue: value }))} placeholder={copy.plans.prValue} />
                          <TextArea value={exerciseForm.prNotes} onChangeText={(value) => setExerciseForm((current) => ({ ...current, prNotes: value }))} placeholder={copy.plans.prNotes} />
                        </>
                      ) : null}
                      <PrimaryButton onPress={() => completeMutation.mutate(undefined)}>{copy.plans.completeExercise}</PrimaryButton>
                      <SecondaryButton onPress={() => skipMutation.mutate(undefined)}>{copy.plans.skipExercise}</SecondaryButton>
                    </>
                  ) : (
                    <MutedText>{copy.plans.finishSession}</MutedText>
                  )}
                  <Input value={sessionDuration} onChangeText={setSessionDuration} placeholder={copy.plans.sessionDuration} />
                  <TextArea value={sessionNotes} onChangeText={setSessionNotes} placeholder={copy.plans.sessionNotes} />
                  <PrimaryButton onPress={() => finishMutation.mutate(undefined)}>{copy.plans.finishSession}</PrimaryButton>
                  <SecondaryButton onPress={() => abandonMutation.mutate(undefined)}>{copy.plans.abandonSession}</SecondaryButton>
                </View>
              )}
            </Card>
          ) : null}

          <Card>
            <SectionTitle>{copy.plans.recentSessions}</SectionTitle>
            <QueryState loading={historyQuery.isLoading} error={historyQuery.error instanceof Error ? historyQuery.error.message : null} empty={!historyQuery.data?.length} emptyMessage={copy.plans.noSessionHistory} />
            {historyQuery.data?.map((session) => (
              <View key={session.id} style={{ paddingVertical: 8 }}>
                <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                  {new Date(session.performed_at).toLocaleString()}
                </Text>
                <MutedText>{session.duration_minutes || 0} min • {session.entries.filter((entry) => entry.is_pr).length} PRs</MutedText>
              </View>
            ))}
          </Card>

          <Card>
            <SectionTitle>{copy.plans.dietPlans}</SectionTitle>
            {plansQuery.data.diets.length === 0 ? (
              <MutedText>{copy.plans.noDietPlans}</MutedText>
            ) : (
              plansQuery.data.diets.map((plan) => (
                <Pressable key={plan.id} onPress={() => setSelectedDietId(plan.id)} style={{ paddingVertical: 10 }}>
                  <Text style={{ color: selectedDietId === plan.id ? theme.primary : theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {plan.name}
                  </Text>
                </Pressable>
              ))
            )}
          </Card>

          {dietTrackerQuery.data ? (
            <Card>
              <SectionTitle>{copy.plans.dietTracker}</SectionTitle>
              {dietTrackerQuery.data.has_structured_content ? (
                <>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {dietTrackerQuery.data.days.map((day) => (
                      <SecondaryButton key={day.id} onPress={() => setSelectedDietDayId(day.id)}>
                        {day.name}
                      </SecondaryButton>
                    ))}
                  </View>
                  {selectedDietDay?.meals.map((meal) => (
                    <View key={meal.id} style={{ paddingVertical: 10 }}>
                      <Text style={{ color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                        {meal.name}
                      </Text>
                      <MutedText>{meal.time_label || ""}</MutedText>
                      {meal.items.map((item) => (
                        <MutedText key={item.id}>{item.label}{item.quantity ? ` • ${item.quantity}` : ""}</MutedText>
                      ))}
                      <SecondaryButton onPress={() => void handleToggleMeal(meal.id, !meal.completed)}>
                        {meal.completed ? copy.plans.done : copy.plans.markDone}
                      </SecondaryButton>
                    </View>
                  ))}
                  <Input value={dietAdherence} onChangeText={setDietAdherence} placeholder={copy.plans.dayAdherence} />
                  <TextArea value={dietDayNotes} onChangeText={setDietDayNotes} placeholder={copy.plans.dayNotes} />
                  <PrimaryButton onPress={() => saveDietMutation.mutate(undefined)}>{copy.plans.saveDay}</PrimaryButton>
                </>
              ) : (
                <>
                  <MutedText>{copy.plans.noStructuredDiet}</MutedText>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {dietTrackerQuery.data.legacy_content || ""}
                  </Text>
                </>
              )}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
