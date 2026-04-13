import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { parseCoachPlansEnvelope } from "@/lib/api";
import { getCurrentRole } from "@/lib/mobile-role";
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

type CoachWorkoutExercise = {
  id: string;
  section_name?: string | null;
  exercise_name?: string | null;
  sets: number;
  reps: number;
  order?: number | null;
};

type CoachDietMeal = {
  id: string;
  meal_name: string;
  items: string;
  instructions: string;
};

type CoachDietDay = {
  id: string;
  day_name: string;
  meals: CoachDietMeal[];
};

type PlanAction = "publish" | "archive" | "fork-draft" | "clone";
type PlanActionResponse = { id?: string };
type PlanActionNotice = { kind: "success" | "error"; message: string };

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

function createRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultDietMeal(name = "Breakfast"): CoachDietMeal {
  return { id: createRowId(), meal_name: name, items: "", instructions: "" };
}

function defaultDietDay(dayName = "Day 1"): CoachDietDay {
  return { id: createRowId(), day_name: dayName, meals: [defaultDietMeal()] };
}

function normalizeDietDays(input: unknown): CoachDietDay[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const days: CoachDietDay[] = [];
  for (const day of input) {
    const dayName = typeof day === "object" && day && "name" in day && typeof day.name === "string" ? day.name : "Day";
    const meals = typeof day === "object" && day && "meals" in day && Array.isArray(day.meals) ? day.meals : [];
    const normalizedMeals: CoachDietMeal[] = [];
    for (const meal of meals) {
      const mealName = typeof meal === "object" && meal && "name" in meal && typeof meal.name === "string" ? meal.name : "Meal";
      const instructions = typeof meal === "object" && meal && "instructions" in meal && typeof meal.instructions === "string" ? meal.instructions : "";
      const items = typeof meal === "object" && meal && "items" in meal && Array.isArray(meal.items)
        ? meal.items
            .map((item: unknown) => (typeof item === "object" && item && "label" in item && typeof item.label === "string" ? item.label : ""))
            .filter(Boolean)
            .join(", ")
        : "";
      normalizedMeals.push({
        id: createRowId(),
        meal_name: mealName,
        items,
        instructions,
      });
    }
    days.push({
      id: createRowId(),
      day_name: dayName,
      meals: normalizedMeals.length ? normalizedMeals : [defaultDietMeal("Meal")],
    });
  }
  return days;
}

export default function PlansTab() {
  const { bootstrap } = useSession();
  if (getCurrentRole(bootstrap) === "COACH") {
    return <CoachPlansTab />;
  }
  return <CustomerPlansTab />;
}

function CustomerPlansTab() {
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

function CoachPlansTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [editorMode, setEditorMode] = useState<"workout" | "diet">("workout");
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [creatingDiet, setCreatingDiet] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [selectedDietId, setSelectedDietId] = useState<string | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutDescription, setWorkoutDescription] = useState("");
  const [workoutExpectedSessions, setWorkoutExpectedSessions] = useState("12");
  const [exerciseRows, setExerciseRows] = useState<CoachWorkoutExercise[]>([
    { id: createRowId(), section_name: "Warm-up", exercise_name: "", sets: 3, reps: 10, order: 0 },
  ]);
  const [dietName, setDietName] = useState("");
  const [dietDescription, setDietDescription] = useState("");
  const [dietContent, setDietContent] = useState("");
  const [dietDays, setDietDays] = useState<CoachDietDay[]>([defaultDietDay()]);
  const [planActionNotice, setPlanActionNotice] = useState<PlanActionNotice | null>(null);

  const coachPlansQuery = useQuery({
    queryKey: ["mobile-coach-plan-manager"],
    queryFn: async () => parseCoachPlansEnvelope(await authorizedRequest("/mobile/staff/coach/plans")).data,
  });

  const workoutPlans = coachPlansQuery.data?.workouts ?? [];
  const dietPlans = coachPlansQuery.data?.diets ?? [];
  const selectedWorkout = workoutPlans.find((plan) => plan.id === selectedWorkoutId) ?? null;
  const selectedDiet = dietPlans.find((plan) => plan.id === selectedDietId) ?? null;
  const workoutTemplateCount = useMemo(() => workoutPlans.filter((plan) => plan.is_template).length, [workoutPlans]);
  const dietTemplateCount = useMemo(() => dietPlans.filter((plan) => plan.is_template).length, [dietPlans]);

  useEffect(() => {
    if (!creatingWorkout && !selectedWorkoutId && workoutPlans.length > 0) {
      setSelectedWorkoutId(workoutPlans[0].id);
    }
  }, [creatingWorkout, selectedWorkoutId, workoutPlans]);

  useEffect(() => {
    if (!creatingDiet && !selectedDietId && dietPlans.length > 0) {
      setSelectedDietId(dietPlans[0].id);
    }
  }, [creatingDiet, dietPlans, selectedDietId]);

  useEffect(() => {
    if (!selectedWorkout) return;
    setCreatingWorkout(false);
    setWorkoutName(selectedWorkout.name);
    setWorkoutDescription(selectedWorkout.description || "");
    setWorkoutExpectedSessions(String(selectedWorkout.expected_sessions_per_30d ?? 12));
    setExerciseRows(
      selectedWorkout.exercises.length
        ? selectedWorkout.exercises.map((exercise) => ({
            id: exercise.id,
            section_name: exercise.section_name || "General",
            exercise_name: exercise.exercise_name || "",
            sets: exercise.sets,
            reps: exercise.reps,
            order: exercise.order ?? 0,
          }))
        : [{ id: createRowId(), section_name: "General", exercise_name: "", sets: 3, reps: 10, order: 0 }],
    );
  }, [selectedWorkout?.id]);

  useEffect(() => {
    if (!selectedDiet) return;
    setCreatingDiet(false);
    setDietName(selectedDiet.name);
    setDietDescription(selectedDiet.description || "");
    setDietContent(selectedDiet.content || "");
    setDietDays(normalizeDietDays(selectedDiet.content_structured).length ? normalizeDietDays(selectedDiet.content_structured) : [defaultDietDay()]);
  }, [selectedDiet?.id]);

  function parseExercises() {
    return exerciseRows
      .filter((row) => row.exercise_name?.trim())
      .map((row, index) => ({
        section_name: row.section_name?.trim() || "General",
        exercise_name: row.exercise_name?.trim(),
        sets: Number(row.sets || 3),
        reps: Number(row.reps || 10),
        order: index,
      }));
  }

  function buildDietStructure() {
    return dietDays.map((day, dayIndex) => ({
      id: `day-${dayIndex + 1}`,
      name: day.day_name.trim() || `Day ${dayIndex + 1}`,
      meals: day.meals.filter((meal) => meal.meal_name.trim()).map((meal, mealIndex) => ({
        id: `meal-${dayIndex + 1}-${mealIndex + 1}`,
        name: meal.meal_name.trim(),
        instructions: meal.instructions.trim() || null,
        items: meal.items
          .split(",")
          .map((item, itemIndex) => ({
            id: `item-${dayIndex + 1}-${mealIndex + 1}-${itemIndex + 1}`,
            label: item.trim(),
          }))
          .filter((item) => item.label),
      })),
    })).filter((day) => day.meals.length > 0);
  }

  const refreshCoachPlans = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mobile-coach-plan-manager"] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-coach-plan-summaries"] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-coach-diet-summaries"] });
  };

  const saveWorkoutMutation = useMutation({
    onMutate: () => {
      setPlanActionNotice(null);
    },
    mutationFn: async () => {
      const payload = {
        name: workoutName.trim(),
        description: workoutDescription.trim() || null,
        expected_sessions_per_30d: Number(workoutExpectedSessions || 12),
        is_template: true,
        status: selectedWorkout ? undefined : "DRAFT",
        exercises: parseExercises(),
      };
      if (selectedWorkout) {
        return authorizedRequest(`/fitness/plans/${selectedWorkout.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return authorizedRequest("/fitness/plans", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (payload) => {
      const createdId = !selectedWorkout ? (payload as { data?: { id?: string } })?.data?.id ?? null : selectedWorkout.id;
      setCreatingWorkout(false);
      if (createdId) {
        setSelectedWorkoutId(createdId);
      }
      setPlanActionNotice({ kind: "success", message: payload.message || copy.common.successUpdated });
      await refreshCoachPlans();
    },
    onError: (error) => {
      setPlanActionNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
    },
  });

  const saveDietMutation = useMutation({
    onMutate: () => {
      setPlanActionNotice(null);
    },
    mutationFn: async () => {
      const structured = buildDietStructure();
      const payload = {
        name: dietName.trim(),
        description: dietDescription.trim() || null,
        content: dietContent.trim() || structured.map((day) => `${day.name}: ${day.meals.map((meal) => meal.name).join(", ")}`).join("\n"),
        content_structured: structured.length ? structured : null,
        is_template: true,
        status: selectedDiet ? undefined : "DRAFT",
      };
      if (selectedDiet) {
        return authorizedRequest(`/fitness/diets/${selectedDiet.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return authorizedRequest("/fitness/diets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (payload) => {
      const createdId = !selectedDiet ? (payload as { data?: { id?: string } })?.data?.id ?? null : selectedDiet.id;
      setCreatingDiet(false);
      if (createdId) {
        setSelectedDietId(createdId);
      }
      setPlanActionNotice({ kind: "success", message: payload.message || copy.common.successUpdated });
      await refreshCoachPlans();
    },
    onError: (error) => {
      setPlanActionNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
    },
  });

  const workoutActionMutation = useMutation({
    onMutate: () => {
      setPlanActionNotice(null);
    },
    mutationFn: async ({ action, planId }: { action: PlanAction; planId: string }) => {
      return authorizedRequest<PlanActionResponse>(`/fitness/plans/${planId}/${action}`, {
        method: "POST",
        body: action === "clone" ? JSON.stringify({}) : undefined,
      });
    },
    onSuccess: async (payload, variables) => {
      const returnedId = payload.data?.id;
      if ((variables.action === "clone" || variables.action === "fork-draft") && returnedId) {
        setCreatingWorkout(false);
        setSelectedWorkoutId(returnedId);
      }
      setPlanActionNotice({ kind: "success", message: payload.message || copy.common.successUpdated });
      await refreshCoachPlans();
    },
    onError: (error) => {
      setPlanActionNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
    },
  });

  const dietActionMutation = useMutation({
    onMutate: () => {
      setPlanActionNotice(null);
    },
    mutationFn: async ({ action, planId }: { action: PlanAction; planId: string }) => {
      return authorizedRequest<PlanActionResponse>(`/fitness/diets/${planId}/${action}`, {
        method: "POST",
        body: action === "clone" ? JSON.stringify({}) : undefined,
      });
    },
    onSuccess: async (payload, variables) => {
      const returnedId = payload.data?.id;
      if ((variables.action === "clone" || variables.action === "fork-draft") && returnedId) {
        setCreatingDiet(false);
        setSelectedDietId(returnedId);
      }
      setPlanActionNotice({ kind: "success", message: payload.message || copy.common.successUpdated });
      await refreshCoachPlans();
    },
    onError: (error) => {
      setPlanActionNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
    },
  });
  const pendingWorkoutAction = workoutActionMutation.variables?.action;
  const pendingDietAction = dietActionMutation.variables?.action;

  return (
    <Screen title={copy.tabs.plans} subtitle={copy.coachPlans.subtitle}>
      <Card>
        <QueryState loading={coachPlansQuery.isLoading} error={coachPlansQuery.error instanceof Error ? coachPlansQuery.error.message : null} />
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <SectionTitle>{copy.staffHome.title}</SectionTitle>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 6, flexShrink: 1 }}>
            <MiniMetric label={copy.membersScreen.workoutPlans} value={workoutPlans.length} />
            <MiniMetric label={copy.membersScreen.dietPlans} value={dietPlans.length} />
            <MiniMetric label={copy.coachPlans.template} value={workoutTemplateCount + dietTemplateCount} />
          </View>
        </View>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginTop: 10 }}>
          <ModePill label={copy.membersScreen.workoutPlans} active={editorMode === "workout"} onPress={() => setEditorMode("workout")} />
          <ModePill label={copy.membersScreen.dietPlans} active={editorMode === "diet"} onPress={() => setEditorMode("diet")} />
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <SectionTitle>{editorMode === "workout" ? copy.membersScreen.workoutPlans : copy.membersScreen.dietPlans}</SectionTitle>
          <CompactAddButton
            label={editorMode === "workout" ? copy.coachPlans.createWorkout : copy.coachPlans.createDiet}
            onPress={() => {
              if (editorMode === "workout") {
                setCreatingWorkout(true);
                setSelectedWorkoutId(null);
                setWorkoutName("");
                setWorkoutDescription("");
                setWorkoutExpectedSessions("12");
                setExerciseRows([{ id: createRowId(), section_name: "Warm-up", exercise_name: "", sets: 3, reps: 10, order: 0 }]);
                return;
              }
              setCreatingDiet(true);
              setSelectedDietId(null);
              setDietName("");
              setDietDescription("");
              setDietContent("");
              setDietDays([defaultDietDay()]);
            }}
          />
        </View>
        {editorMode === "workout" ? (
          <>
            {workoutPlans.length === 0 ? <MutedText>{copy.coachPlans.noWorkoutPlans}</MutedText> : null}
            {creatingWorkout ? (
              <PlanPickerRow
                title={copy.coachPlans.createWorkout}
                subtitle={copy.coachPlans.saveDraft}
                active
                onPress={() => undefined}
              />
            ) : null}
            {workoutPlans.map((plan) => (
              <PlanPickerRow
                key={plan.id}
                title={plan.name}
                subtitle={`${plan.status} • ${plan.member_name || copy.coachPlans.template}`}
                active={selectedWorkoutId === plan.id}
                onPress={() => {
                  setEditorMode("workout");
                  setCreatingWorkout(false);
                  setSelectedWorkoutId(plan.id);
                }}
              />
            ))}
          </>
        ) : (
          <>
            {dietPlans.length === 0 ? <MutedText>{copy.coachPlans.noDietPlans}</MutedText> : null}
            {creatingDiet ? (
              <PlanPickerRow
                title={copy.coachPlans.createDiet}
                subtitle={copy.coachPlans.saveDraft}
                active
                onPress={() => undefined}
              />
            ) : null}
            {dietPlans.map((plan) => (
              <PlanPickerRow
                key={plan.id}
                title={plan.name}
                subtitle={`${plan.status} • ${plan.member_name || copy.coachPlans.template}`}
                active={selectedDietId === plan.id}
                onPress={() => {
                  setEditorMode("diet");
                  setCreatingDiet(false);
                  setSelectedDietId(plan.id);
                }}
              />
            ))}
          </>
        )}
      </Card>

      {editorMode === "workout" ? (
        <Card>
          <SectionTitle>{selectedWorkout ? `${copy.coachPlans.editing}: ${selectedWorkout.name}` : copy.coachPlans.createWorkout}</SectionTitle>
          <InlineNotice notice={planActionNotice} />
          <Input value={workoutName} onChangeText={setWorkoutName} placeholder={copy.coachPlans.workoutName} />
          <TextArea value={workoutDescription} onChangeText={setWorkoutDescription} placeholder={copy.coachPlans.description} style={{ minHeight: 88 }} />
          <Input value={workoutExpectedSessions} onChangeText={setWorkoutExpectedSessions} placeholder={copy.coachPlans.expectedSessions} />
          {exerciseRows.map((row, index) => (
            <EditorCard key={row.id} title={`${copy.coachPlans.exerciseName} ${index + 1}`}>
              <Input
                value={row.section_name || ""}
                onChangeText={(value) => setExerciseRows((current) => current.map((item) => (item.id === row.id ? { ...item, section_name: value } : item)))}
                placeholder={copy.coachPlans.sectionName}
              />
              <Input
                value={row.exercise_name || ""}
                onChangeText={(value) => setExerciseRows((current) => current.map((item) => (item.id === row.id ? { ...item, exercise_name: value } : item)))}
                placeholder={copy.coachPlans.exerciseName}
              />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
                <Input
                  value={String(row.sets)}
                  onChangeText={(value) => setExerciseRows((current) => current.map((item) => (item.id === row.id ? { ...item, sets: Number(value || 0) } : item)))}
                  placeholder={copy.coachPlans.sets}
                  style={{ flex: 1 }}
                />
                <Input
                  value={String(row.reps)}
                  onChangeText={(value) => setExerciseRows((current) => current.map((item) => (item.id === row.id ? { ...item, reps: Number(value || 0) } : item)))}
                  placeholder={copy.coachPlans.reps}
                  style={{ flex: 1 }}
                />
              </View>
              {exerciseRows.length > 1 ? (
                <SecondaryButton onPress={() => setExerciseRows((current) => current.filter((item) => item.id !== row.id))}>
                  {copy.common.cancel}
                </SecondaryButton>
              ) : null}
            </EditorCard>
          ))}
          <SecondaryButton onPress={() => setExerciseRows((current) => [...current, { id: createRowId(), section_name: "General", exercise_name: "", sets: 3, reps: 10, order: current.length }])}>
            {copy.coachPlans.addExercise}
          </SecondaryButton>
          <PrimaryButton onPress={() => saveWorkoutMutation.mutate()} disabled={saveWorkoutMutation.isPending || !workoutName.trim()}>
            {selectedWorkout ? copy.coachPlans.saveChanges : copy.coachPlans.saveDraft}
          </PrimaryButton>
          {selectedWorkout ? (
            <View style={{ gap: 10 }}>
              <SecondaryButton disabled={workoutActionMutation.isPending} onPress={() => workoutActionMutation.mutate({ action: "publish", planId: selectedWorkout.id })}>{pendingWorkoutAction === "publish" ? copy.common.loading : copy.coachPlans.publish}</SecondaryButton>
              <SecondaryButton disabled={workoutActionMutation.isPending} onPress={() => workoutActionMutation.mutate({ action: "archive", planId: selectedWorkout.id })}>{pendingWorkoutAction === "archive" ? copy.common.loading : copy.coachPlans.archive}</SecondaryButton>
              <SecondaryButton disabled={workoutActionMutation.isPending} onPress={() => workoutActionMutation.mutate({ action: "fork-draft", planId: selectedWorkout.id })}>{pendingWorkoutAction === "fork-draft" ? copy.common.loading : copy.coachPlans.forkDraft}</SecondaryButton>
              <SecondaryButton disabled={workoutActionMutation.isPending} onPress={() => workoutActionMutation.mutate({ action: "clone", planId: selectedWorkout.id })}>{pendingWorkoutAction === "clone" ? copy.common.loading : copy.coachPlans.clone}</SecondaryButton>
            </View>
          ) : null}
        </Card>
      ) : (
        <Card>
          <SectionTitle>{selectedDiet ? `${copy.coachPlans.editing}: ${selectedDiet.name}` : copy.coachPlans.createDiet}</SectionTitle>
          <InlineNotice notice={planActionNotice} />
          <Input value={dietName} onChangeText={setDietName} placeholder={copy.coachPlans.dietName} />
          <TextArea value={dietDescription} onChangeText={setDietDescription} placeholder={copy.coachPlans.description} style={{ minHeight: 88 }} />
          {dietDays.map((day, dayIndex) => (
            <EditorCard key={day.id} title={`${copy.coachPlans.dayName} ${dayIndex + 1}`}>
              <Input
                value={day.day_name}
                onChangeText={(value) => setDietDays((current) => current.map((item) => (item.id === day.id ? { ...item, day_name: value } : item)))}
                placeholder={copy.coachPlans.dayName}
              />
              {day.meals.map((meal, mealIndex) => (
                <View key={meal.id} style={{ gap: 8, padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 14, backgroundColor: theme.card }}>
                  <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 11 }}>
                    {copy.coachPlans.mealName} {mealIndex + 1}
                  </Text>
                  <Input
                    value={meal.meal_name}
                    onChangeText={(value) =>
                      setDietDays((current) =>
                        current.map((item) =>
                          item.id === day.id
                            ? { ...item, meals: item.meals.map((candidate) => (candidate.id === meal.id ? { ...candidate, meal_name: value } : candidate)) }
                            : item,
                        ),
                      )
                    }
                    placeholder={copy.coachPlans.mealName}
                  />
                  <Input
                    value={meal.items}
                    onChangeText={(value) =>
                      setDietDays((current) =>
                        current.map((item) =>
                          item.id === day.id
                            ? { ...item, meals: item.meals.map((candidate) => (candidate.id === meal.id ? { ...candidate, items: value } : candidate)) }
                            : item,
                        ),
                      )
                    }
                    placeholder={copy.coachPlans.mealItems}
                  />
                  <TextArea
                    value={meal.instructions}
                    onChangeText={(value) =>
                      setDietDays((current) =>
                        current.map((item) =>
                          item.id === day.id
                            ? { ...item, meals: item.meals.map((candidate) => (candidate.id === meal.id ? { ...candidate, instructions: value } : candidate)) }
                            : item,
                        ),
                      )
                    }
                    placeholder={copy.coachPlans.instructions}
                    style={{ minHeight: 84 }}
                  />
                  {day.meals.length > 1 ? (
                    <SecondaryButton onPress={() => setDietDays((current) => current.map((item) => (item.id === day.id ? { ...item, meals: item.meals.filter((candidate) => candidate.id !== meal.id) } : item)))}>
                      {copy.common.cancel}
                    </SecondaryButton>
                  ) : null}
                </View>
              ))}
              <SecondaryButton onPress={() => setDietDays((current) => current.map((item) => (item.id === day.id ? { ...item, meals: [...item.meals, defaultDietMeal("Meal")] } : item)))}>
                {copy.coachPlans.addMeal}
              </SecondaryButton>
              {dietDays.length > 1 ? (
                <SecondaryButton onPress={() => setDietDays((current) => current.filter((item) => item.id !== day.id))}>
                  {copy.common.cancel}
                </SecondaryButton>
              ) : null}
            </EditorCard>
          ))}
          <SecondaryButton onPress={() => setDietDays((current) => [...current, defaultDietDay(`Day ${current.length + 1}`)])}>
            {copy.coachPlans.addDay}
          </SecondaryButton>
          <TextArea value={dietContent} onChangeText={setDietContent} placeholder={copy.coachPlans.coachNotes} style={{ minHeight: 84 }} />
          <PrimaryButton onPress={() => saveDietMutation.mutate()} disabled={saveDietMutation.isPending || !dietName.trim() || (!dietContent.trim() && buildDietStructure().length === 0)}>
            {selectedDiet ? copy.coachPlans.saveChanges : copy.coachPlans.saveDraft}
          </PrimaryButton>
          {selectedDiet ? (
            <View style={{ gap: 10 }}>
              <SecondaryButton disabled={dietActionMutation.isPending} onPress={() => dietActionMutation.mutate({ action: "publish", planId: selectedDiet.id })}>{pendingDietAction === "publish" ? copy.common.loading : copy.coachPlans.publish}</SecondaryButton>
              <SecondaryButton disabled={dietActionMutation.isPending} onPress={() => dietActionMutation.mutate({ action: "archive", planId: selectedDiet.id })}>{pendingDietAction === "archive" ? copy.common.loading : copy.coachPlans.archive}</SecondaryButton>
              <SecondaryButton disabled={dietActionMutation.isPending} onPress={() => dietActionMutation.mutate({ action: "fork-draft", planId: selectedDiet.id })}>{pendingDietAction === "fork-draft" ? copy.common.loading : copy.coachPlans.forkDraft}</SecondaryButton>
              <SecondaryButton disabled={dietActionMutation.isPending} onPress={() => dietActionMutation.mutate({ action: "clone", planId: selectedDiet.id })}>{pendingDietAction === "clone" ? copy.common.loading : copy.coachPlans.clone}</SecondaryButton>
            </View>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

function InlineNotice({ notice }: { notice: PlanActionNotice | null }) {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  if (!notice) {
    return null;
  }
  const isError = notice.kind === "error";
  const noticeColor = isError ? "#B42318" : theme.primary;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: noticeColor,
        backgroundColor: isError ? "#FEF3F2" : theme.primarySoft,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: noticeColor, fontFamily: fontSet.body, fontSize: 13, fontWeight: "700", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
        {notice.message}
      </Text>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  const { theme, fontSet } = usePreferences();
  return (
    <View style={{ minWidth: 54, alignItems: "center", paddingHorizontal: 8, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.cardAlt }}>
      <Text style={{ color: theme.primary, fontFamily: fontSet.display, fontSize: 17, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 10 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ModePill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme, fontSet } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        borderWidth: 1,
        borderColor: active ? theme.primary : theme.border,
        borderRadius: 999,
        backgroundColor: active ? theme.primarySoft : theme.cardAlt,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.body, fontSize: 13, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function CompactAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme, fontSet } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: theme.primary,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 9,
      }}
    >
      <Ionicons name="add" size={16} color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontFamily: fontSet.body, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function PlanPickerRow({
  title,
  subtitle,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme, fontSet, direction, isRTL } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primarySoft : theme.cardAlt,
        marginTop: 10,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 16,
      }}
    >
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.body, fontWeight: "700", textAlign: isRTL ? "right" : "left", writingDirection: direction }} numberOfLines={1}>
            {title}
          </Text>
          <MutedText>{subtitle}</MutedText>
        </View>
        <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? theme.primary : theme.muted} />
      </View>
    </Pressable>
  );
}

function EditorCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme, fontSet } = usePreferences();
  return (
    <View style={{ gap: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 18, backgroundColor: theme.cardAlt }}>
      <Text style={{ color: theme.foreground, fontFamily: fontSet.body, fontSize: 14 }}>{title}</Text>
      {children}
    </View>
  );
}
