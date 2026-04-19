import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Card, Input, MediaPreview, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { API_BASE_URL, parseCoachPlansEnvelope } from "@/lib/api";
import { pickImageOrVideoFromLibrary } from "@/lib/media-picker";
import { localizePlanStatus } from "@/lib/mobile-format";
import { getCurrentRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";
import {
  createWorkoutQueueId,
  enqueueWorkoutAction,
  isLikelyNetworkError,
  loadWorkoutQueue,
  replayWorkoutQueue,
  type WorkoutQueuedAction,
} from "@/lib/workout-offline-queue";

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
  started_at: string;
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
    set_details?: SetDetail[];
    skipped: boolean;
    completed_at?: string | null;
  }>;
};

type SetDetail = {
  set: number;
  reps: string;
  weightKg: string;
};

type WorkoutSetPayload = {
  set: number;
  reps: number;
  weightKg: number | null;
};

type CompleteWorkoutPayload = {
  sets_completed: number;
  reps_completed: number;
  weight_kg: number | null;
  notes: string | null;
  is_pr: boolean;
  pr_type: string | null;
  pr_value: string | null;
  pr_notes: string | null;
  set_details: WorkoutSetPayload[];
};

type WorkoutAttachment = {
  media_url: string;
  media_mime?: string | null;
  media_size_bytes?: number | null;
  name?: string;
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
type WorkoutActionNotice = { kind: "success" | "error"; message: string };

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

function normalizeMediaUrl(url: string) {
  if (url.startsWith("/")) {
    return `${API_BASE_URL.replace(/\/api\/v1\/?$/, "")}${url}`;
  }
  return url;
}

function isDirectVideoUrl(url: string) {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}

function resolveExerciseVideo(entry: WorkoutDraft["entries"][number]) {
  const uploadedUrl = entry.video_type === "UPLOAD" && entry.uploaded_video_url ? entry.uploaded_video_url : null;
  const url = uploadedUrl || entry.embed_url || entry.video_url || null;
  if (!url) return null;
  const normalizedUrl = normalizeMediaUrl(url);
  return {
    url: normalizedUrl,
    direct: !!uploadedUrl || isDirectVideoUrl(normalizedUrl),
  };
}

function estimateSessionDurationMinutes(draft?: WorkoutDraft | null) {
  if (!draft?.started_at) return null;
  const startedAt = new Date(draft.started_at).getTime();
  if (!Number.isFinite(startedAt)) return null;
  return Math.max(1, Math.round((Date.now() - startedAt) / 60000));
}

function draftCacheKey(draftId?: string | null) {
  return draftId ? `gym-erp.mobile.workout-draft.${draftId}` : null;
}

function buildDefaultSetRows(entry?: WorkoutDraft["entries"][number] | null): SetDetail[] {
  const count = Math.max(1, entry?.target_sets ?? entry?.sets_completed ?? 1);
  return Array.from({ length: count }, (_, index) => ({
    set: index + 1,
    reps: entry?.set_details?.[index]?.reps != null ? String(entry.set_details[index].reps) : entry?.target_reps != null ? String(entry.target_reps) : "",
    weightKg: entry?.set_details?.[index]?.weightKg != null ? String(entry.set_details[index].weightKg) : entry?.weight_kg != null ? String(entry.weight_kg) : "",
  }));
}

function summarizeSetRows(rows: SetDetail[], fallback: ExerciseForm) {
  const completedRows = rows.filter((row) => row.reps.trim() || row.weightKg.trim());
  const reps = completedRows.map((row) => Number(row.reps || 0)).filter(Number.isFinite);
  const weights = completedRows.map((row) => Number(row.weightKg || 0)).filter(Number.isFinite);
  return {
    setsCompleted: completedRows.length || Number(fallback.setsCompleted || 0),
    repsCompleted: reps.length ? Math.max(...reps) : Number(fallback.repsCompleted || 0),
    weightKg: weights.length ? Math.max(...weights) : fallback.weightKg ? Number(fallback.weightKg) : null,
  };
}

function describeQueuedWorkoutAction(action: WorkoutQueuedAction, copy: ReturnType<typeof usePreferences>["copy"]) {
  if (action.kind === "media_upload") return copy.plans.pendingMediaUpload;
  if (action.path.endsWith("/finish")) return copy.plans.pendingFinish;
  if (action.path.endsWith("/previous")) return copy.plans.pendingPrevious;
  if (action.path.includes("/skip")) return copy.plans.pendingSkip;
  if (action.method === "PUT" && action.path.includes("/entries/")) return copy.plans.pendingComplete;
  if (action.path.endsWith("/start")) return copy.plans.pendingStart;
  if (action.method === "DELETE") return copy.plans.pendingAbandon;
  return copy.plans.pendingWorkoutAction;
}

function restSecondsForEntry(entry?: WorkoutDraft["entries"][number] | null) {
  if (!entry) return 90;
  if (entry.target_duration_minutes) return 45;
  if ((entry.target_reps || 0) <= 5) return 120;
  if ((entry.target_sets || 0) >= 4) return 90;
  return 60;
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
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionNotes, setEditSessionNotes] = useState("");
  const [editSessionRpe, setEditSessionRpe] = useState("");
  const [editPainLevel, setEditPainLevel] = useState("");
  const [editEffortFeedback, setEditEffortFeedback] = useState<"TOO_EASY" | "JUST_RIGHT" | "TOO_HARD" | "">("");
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(emptyForm);
  const [setRows, setSetRows] = useState<SetDetail[]>([]);
  const [sessionDuration, setSessionDuration] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionRpe, setSessionRpe] = useState("");
  const [painLevel, setPainLevel] = useState("");
  const [effortFeedback, setEffortFeedback] = useState<"TOO_EASY" | "JUST_RIGHT" | "TOO_HARD" | "">("");
  const [sessionAttachment, setSessionAttachment] = useState<WorkoutAttachment | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [workoutNotice, setWorkoutNotice] = useState<WorkoutActionNotice | null>(null);
  const [pendingWorkoutSyncCount, setPendingWorkoutSyncCount] = useState(0);
  const [pendingWorkoutActions, setPendingWorkoutActions] = useState<WorkoutQueuedAction[]>([]);
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
        Array<{
          id: string;
          performed_at: string;
          duration_minutes?: number | null;
          notes?: string | null;
          rpe?: number | null;
          pain_level?: number | null;
          effort_feedback?: string | null;
          attachment_url?: string | null;
          attachment_mime?: string | null;
          attachment_size_bytes?: number | null;
          entries: Array<{
            id?: string;
            exercise_name?: string | null;
            sets_completed: number;
            reps_completed: number;
            weight_kg?: number | null;
            notes?: string | null;
            is_pr?: boolean;
            skipped?: boolean;
            set_details?: SetDetail[];
          }>;
        }>
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
      setSetRows([]);
      return;
    }
    setExerciseForm({
      setsCompleted: currentEntry.sets_completed ? String(currentEntry.sets_completed) : currentEntry.target_sets != null ? String(currentEntry.target_sets) : "",
      repsCompleted: currentEntry.reps_completed ? String(currentEntry.reps_completed) : currentEntry.target_reps != null ? String(currentEntry.target_reps) : "",
      weightKg: currentEntry.weight_kg != null ? String(currentEntry.weight_kg) : "",
      notes: currentEntry.notes || "",
      isPr: !!currentEntry.is_pr,
      prType: currentEntry.pr_type || "WEIGHT",
      prValue: currentEntry.pr_value || "",
      prNotes: currentEntry.pr_notes || "",
    });
    setSetRows(buildDefaultSetRows(currentEntry));
  }, [activeDraftQuery.data?.id, activeDraftQuery.data?.current_exercise_index]);

  useEffect(() => {
    if (!dietTrackerQuery.data) return;
    setSelectedDietDayId((current) => current ?? dietTrackerQuery.data.days[0]?.id ?? null);
    setDietDayNotes(dietTrackerQuery.data.tracking_day?.notes || "");
    setDietAdherence(String(dietTrackerQuery.data.tracking_day?.adherence_rating || 3));
  }, [dietTrackerQuery.data]);

  const replayPendingWorkoutActions = async () => {
      await refreshPendingWorkoutSyncCount();
      const result = await replayWorkoutQueue(authorizedRequest);
      await refreshPendingWorkoutSyncCount();
      if (result.error) {
        setWorkoutNotice({ kind: "error", message: `${copy.plans.syncFailed}: ${result.error}` });
        return;
      }
      if (result.processed > 0) {
        setWorkoutNotice({ kind: "success", message: copy.plans.syncComplete });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] }),
          queryClient.invalidateQueries({ queryKey: ["member-workout-history", selectedWorkoutPlanId] }),
          queryClient.invalidateQueries({ queryKey: ["mobile-progress"] }),
          queryClient.invalidateQueries({ queryKey: ["mobile-home"] }),
        ]);
      }
  };

  useEffect(() => {
    let cancelled = false;
    const replayPendingActions = async () => {
      await refreshPendingWorkoutSyncCount();
      const result = await replayWorkoutQueue(authorizedRequest);
      if (cancelled) return;
      await refreshPendingWorkoutSyncCount();
      if (result.error) {
        setWorkoutNotice({ kind: "error", message: `${copy.plans.syncFailed}: ${result.error}` });
        return;
      }
      if (result.processed > 0) {
        setWorkoutNotice({ kind: "success", message: copy.plans.syncComplete });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] }),
          queryClient.invalidateQueries({ queryKey: ["member-workout-history", selectedWorkoutPlanId] }),
          queryClient.invalidateQueries({ queryKey: ["mobile-progress"] }),
          queryClient.invalidateQueries({ queryKey: ["mobile-home"] }),
        ]);
      }
    };
    void replayPendingActions();
    return () => {
      cancelled = true;
    };
  }, [authorizedRequest, copy.plans.syncComplete, copy.plans.syncFailed, queryClient, selectedWorkoutPlanId]);

  const selectedDietDay = dietTrackerQuery.data?.days.find((day) => day.id === selectedDietDayId) ?? dietTrackerQuery.data?.days[0] ?? null;
  const currentEntry = activeDraftQuery.data?.entries[activeDraftQuery.data.current_exercise_index] ?? null;
  const completedCount = activeDraftQuery.data?.entries.filter((entry) => entry.completed_at || entry.skipped).length ?? 0;
  const canFinishSession = !!activeDraftQuery.data && completedCount > 0;
  const lastPerformance = useMemo(() => {
    if (!currentEntry?.exercise_name || !historyQuery.data) return null;
    const targetName = currentEntry.exercise_name.trim().toLowerCase();
    for (const session of historyQuery.data) {
      const match = session.entries.find((entry) => !entry.skipped && (entry.exercise_name || "").trim().toLowerCase() === targetName);
      if (match) return match;
    }
    return null;
  }, [currentEntry?.exercise_name, historyQuery.data]);
  const autoPrPreview = useMemo(() => {
    if (!lastPerformance || exerciseForm.isPr) return null;
    const summary = summarizeSetRows(setRows, exerciseForm);
    const bestWeight = Number(lastPerformance.weight_kg || 0);
    const bestReps = Number(lastPerformance.reps_completed || 0);
    if ((summary.weightKg || 0) > bestWeight) return copy.plans.autoPrWeight;
    if (summary.repsCompleted > bestReps && (summary.weightKg || 0) >= bestWeight) return copy.plans.autoPrReps;
    return null;
  }, [copy.plans.autoPrReps, copy.plans.autoPrWeight, exerciseForm, lastPerformance, setRows]);
  const safetyGuidance = useMemo(() => {
    const pain = painLevel ? Number(painLevel) : 0;
    if (Number.isFinite(pain) && pain >= 4) return copy.plans.painSafetyHint;
    if (effortFeedback === "TOO_HARD") return copy.plans.tooHardSafetyHint;
    return null;
  }, [copy.plans.painSafetyHint, copy.plans.tooHardSafetyHint, effortFeedback, painLevel]);

  const refreshPendingWorkoutSyncCount = async () => {
    const queue = await loadWorkoutQueue();
    setPendingWorkoutSyncCount(queue.length);
    setPendingWorkoutActions(queue);
  };

  const queueWorkoutAction = async (action: WorkoutQueuedAction, error: unknown) => {
    if (!isLikelyNetworkError(error)) {
      setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
      return;
    }
    const queue = await enqueueWorkoutAction(action);
    setPendingWorkoutSyncCount(queue.length);
    setPendingWorkoutActions(queue);
    setWorkoutNotice({ kind: "success", message: copy.plans.pendingSync });
  };

  const updateCachedDraft = (updater: (draft: WorkoutDraft) => WorkoutDraft | null) => {
    queryClient.setQueryData<WorkoutDraft | null>(["member-active-workout-draft", selectedWorkoutPlanId], (draft) => {
      if (!draft) return draft;
      return updater(draft);
    });
  };

  const optimisticallyCompleteEntry = (entryId: string, body: CompleteWorkoutPayload) => {
    updateCachedDraft((draft) => {
      const entryIndex = draft.entries.findIndex((entry) => entry.id === entryId);
      if (entryIndex < 0) return draft;
      const entries = draft.entries.map((entry, index) => index === entryIndex ? {
        ...entry,
        sets_completed: body.sets_completed,
        reps_completed: body.reps_completed,
        weight_kg: body.weight_kg,
        notes: body.notes,
        is_pr: body.is_pr,
        pr_type: body.pr_type,
        pr_value: body.pr_value,
        pr_notes: body.pr_notes,
        set_details: body.set_details.map((row) => ({ set: row.set, reps: String(row.reps), weightKg: row.weightKg == null ? "" : String(row.weightKg) })),
        skipped: false,
        completed_at: new Date().toISOString(),
      } : entry);
      return { ...draft, entries, current_exercise_index: Math.min(entries.length, entryIndex + 1) };
    });
  };

  const optimisticallySkipEntry = (entryId: string) => {
    updateCachedDraft((draft) => {
      const entryIndex = draft.entries.findIndex((entry) => entry.id === entryId);
      if (entryIndex < 0) return draft;
      const entries = draft.entries.map((entry, index) => index === entryIndex ? {
        ...entry,
        sets_completed: 0,
        reps_completed: 0,
        weight_kg: null,
        notes: exerciseForm.notes || null,
        is_pr: false,
        pr_type: null,
        pr_value: null,
        pr_notes: null,
        set_details: [],
        skipped: true,
        completed_at: new Date().toISOString(),
      } : entry);
      return { ...draft, entries, current_exercise_index: Math.min(entries.length, entryIndex + 1) };
    });
  };

  const optimisticallyPreviousEntry = () => {
    updateCachedDraft((draft) => {
      const previousIndex = Math.min(draft.current_exercise_index - 1, draft.entries.length - 1);
      if (previousIndex < 0) return draft;
      const entries = draft.entries.map((entry, index) => index === previousIndex ? {
        ...entry,
        sets_completed: 0,
        reps_completed: 0,
        weight_kg: null,
        notes: null,
        is_pr: false,
        pr_type: null,
        pr_value: null,
        pr_notes: null,
        set_details: [],
        skipped: false,
        completed_at: null,
      } : entry);
      return { ...draft, entries, current_exercise_index: previousIndex };
    });
  };

  const buildCompletePayload = (): CompleteWorkoutPayload => {
    const summary = summarizeSetRows(setRows, exerciseForm);
    const invalidSet = setRows.find((row) => {
      const reps = row.reps.trim() ? Number(row.reps) : 0;
      const weight = row.weightKg.trim() ? Number(row.weightKg) : 0;
      return !Number.isFinite(reps) || !Number.isFinite(weight) || reps < 0 || weight < 0;
    });
    if (invalidSet || summary.setsCompleted <= 0 || summary.repsCompleted < 0) {
      throw new Error(copy.plans.invalidSetDetails);
    }
    const bestWeight = Number(lastPerformance?.weight_kg || 0);
    const bestReps = Number(lastPerformance?.reps_completed || 0);
    const autoPr = !exerciseForm.isPr && ((summary.weightKg || 0) > bestWeight || (summary.repsCompleted > bestReps && (summary.weightKg || 0) >= bestWeight));
    const isPr = exerciseForm.isPr || autoPr;
    return {
      sets_completed: summary.setsCompleted,
      reps_completed: summary.repsCompleted,
      weight_kg: summary.weightKg,
      notes: exerciseForm.notes || null,
      is_pr: isPr,
      pr_type: isPr ? exerciseForm.prType : null,
      pr_value: isPr ? exerciseForm.prValue || `${summary.weightKg ?? "--"}${copy.plans.weightUnit} x ${summary.repsCompleted}` : null,
      pr_notes: isPr ? exerciseForm.prNotes || (autoPr ? copy.plans.autoPr : null) : null,
      set_details: setRows
        .filter((row) => row.reps.trim() || row.weightKg.trim())
        .map((row, index) => ({ set: index + 1, reps: Number(row.reps || 0), weightKg: row.weightKg ? Number(row.weightKg) : null })),
    };
  };

  const buildFinishPayload = () => {
    const estimatedDuration = estimateSessionDurationMinutes(activeDraftQuery.data);
    const rpeValue = sessionRpe ? Number(sessionRpe) : null;
    const painValue = painLevel ? Number(painLevel) : null;
    if (rpeValue != null && (!Number.isFinite(rpeValue) || rpeValue < 1 || rpeValue > 10)) throw new Error(copy.plans.sessionRpe);
    if (painValue != null && (!Number.isFinite(painValue) || painValue < 0 || painValue > 10)) throw new Error(copy.plans.painLevel);
    return {
      duration_minutes: sessionDuration ? Number(sessionDuration) : estimatedDuration,
      notes: sessionNotes || null,
      rpe: rpeValue,
      pain_level: painValue,
      effort_feedback: effortFeedback || null,
      attachment_url: sessionAttachment?.media_url || null,
      attachment_mime: sessionAttachment?.media_mime || null,
      attachment_size_bytes: sessionAttachment?.media_size_bytes || null,
    };
  };

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkoutPlanId) throw new Error("No workout plan selected");
      setWorkoutNotice(null);
      const payload = await authorizedRequest<WorkoutDraft>("/fitness/workout-sessions/start", {
        method: "POST",
        body: JSON.stringify({ plan_id: selectedWorkoutPlanId, section_name: selectedSection }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      setWorkoutNotice({ kind: "success", message: copy.plans.workoutStarted });
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
    onError: (error) => {
      if (!selectedWorkoutPlanId) {
        setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
        return;
      }
      void queueWorkoutAction({
        id: createWorkoutQueueId(),
        kind: "request",
        path: "/fitness/workout-sessions/start",
        method: "POST",
        body: { plan_id: selectedWorkoutPlanId, section_name: selectedSection },
        createdAt: new Date().toISOString(),
      }, error);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data || !currentEntry) throw new Error("No active exercise");
      setWorkoutNotice(null);
      const body = buildCompletePayload();
      const payload = await authorizedRequest<WorkoutDraft>(`/fitness/workout-sessions/${activeDraftQuery.data.id}/entries/${currentEntry.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return payload.data;
    },
    onSuccess: async () => {
      setWorkoutNotice({ kind: "success", message: copy.plans.workoutSaved });
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
    onError: (error) => {
      if (!activeDraftQuery.data || !currentEntry) {
        setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
        return;
      }
      let body: ReturnType<typeof buildCompletePayload>;
      try {
        body = buildCompletePayload();
      } catch (payloadError) {
        setWorkoutNotice({ kind: "error", message: payloadError instanceof Error ? payloadError.message : copy.common.errorTryAgain });
        return;
      }
      void queueWorkoutAction({
        id: createWorkoutQueueId(),
        kind: "request",
        path: `/fitness/workout-sessions/${activeDraftQuery.data.id}/entries/${currentEntry.id}`,
        method: "PUT",
        body,
        createdAt: new Date().toISOString(),
      }, error);
      if (isLikelyNetworkError(error)) optimisticallyCompleteEntry(currentEntry.id, body);
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data || !currentEntry) throw new Error("No active exercise");
      setWorkoutNotice(null);
      const payload = await authorizedRequest<WorkoutDraft>(`/fitness/workout-sessions/${activeDraftQuery.data.id}/entries/${currentEntry.id}/skip`, {
        method: "POST",
        body: JSON.stringify({ notes: exerciseForm.notes || null }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      setWorkoutNotice({ kind: "success", message: copy.plans.workoutSkipped });
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
    onError: (error) => {
      if (!activeDraftQuery.data || !currentEntry) {
        setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
        return;
      }
      void queueWorkoutAction({
        id: createWorkoutQueueId(),
        kind: "request",
        path: `/fitness/workout-sessions/${activeDraftQuery.data.id}/entries/${currentEntry.id}/skip`,
        method: "POST",
        body: { notes: exerciseForm.notes || null },
        createdAt: new Date().toISOString(),
      }, error);
      if (isLikelyNetworkError(error)) optimisticallySkipEntry(currentEntry.id);
    },
  });

  const previousMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data) throw new Error("No active draft");
      setWorkoutNotice(null);
      const payload = await authorizedRequest<WorkoutDraft>(`/fitness/workout-sessions/${activeDraftQuery.data.id}/previous`, {
        method: "POST",
      });
      return payload.data;
    },
    onSuccess: async () => {
      setWorkoutNotice({ kind: "success", message: copy.plans.previousExercise });
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
    onError: (error) => {
      if (!activeDraftQuery.data) {
        setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
        return;
      }
      void queueWorkoutAction({
        id: createWorkoutQueueId(),
        kind: "request",
        path: `/fitness/workout-sessions/${activeDraftQuery.data.id}/previous`,
        method: "POST",
        createdAt: new Date().toISOString(),
      }, error);
      if (isLikelyNetworkError(error)) optimisticallyPreviousEntry();
    },
  });

  const attachMediaMutation = useMutation({
    mutationFn: async () => {
      const [asset] = await pickImageOrVideoFromLibrary({ permissionDeniedMessage: copy.common.photoPermissionDenied });
      if (!asset) return null;
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType,
        } as unknown as Blob);
        const payload = await authorizedRequest<WorkoutAttachment>("/fitness/workout-session-media/upload", {
          method: "POST",
          body: formData,
        });
        return { ...payload.data, name: asset.name };
      } catch (error) {
        await queueWorkoutAction({
          id: createWorkoutQueueId(),
          kind: "media_upload",
          path: "/fitness/workout-session-media/upload",
          asset: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType },
          createdAt: new Date().toISOString(),
        }, error);
        return null;
      }
    },
    onSuccess: (attachment) => {
      if (attachment) setSessionAttachment(attachment);
    },
    onError: (error) => setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain }),
  });

  const finishMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data) throw new Error("No active draft");
      setWorkoutNotice(null);
      const payload = await authorizedRequest(`/fitness/workout-sessions/${activeDraftQuery.data.id}/finish`, {
        method: "POST",
        body: JSON.stringify(buildFinishPayload()),
      });
      return payload.data;
    },
    onSuccess: async () => {
      setSessionDuration("");
      setSessionNotes("");
      setSessionRpe("");
      setPainLevel("");
      setEffortFeedback("");
      setSessionAttachment(null);
      setWorkoutNotice({ kind: "success", message: copy.plans.workoutFinished });
      const key = draftCacheKey(activeDraftQuery.data?.id);
      if (key) await SecureStore.deleteItemAsync(key);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] }),
        queryClient.invalidateQueries({ queryKey: ["member-workout-history", selectedWorkoutPlanId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-home"] }),
      ]);
    },
    onError: (error) => {
      if (!activeDraftQuery.data) {
        setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
        return;
      }
      let body: ReturnType<typeof buildFinishPayload>;
      try {
        body = buildFinishPayload();
      } catch (payloadError) {
        setWorkoutNotice({ kind: "error", message: payloadError instanceof Error ? payloadError.message : copy.common.errorTryAgain });
        return;
      }
      void queueWorkoutAction({
        id: createWorkoutQueueId(),
        kind: "request",
        path: `/fitness/workout-sessions/${activeDraftQuery.data.id}/finish`,
        method: "POST",
        body,
        createdAt: new Date().toISOString(),
      }, error);
      if (isLikelyNetworkError(error)) {
        queryClient.setQueryData(["member-active-workout-draft", selectedWorkoutPlanId], null);
      }
    },
  });

  const abandonMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraftQuery.data) throw new Error("No active draft");
      setWorkoutNotice(null);
      await authorizedRequest(`/fitness/workout-sessions/${activeDraftQuery.data.id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      setSessionDuration("");
      setSessionNotes("");
      setSessionRpe("");
      setPainLevel("");
      setEffortFeedback("");
      setSessionAttachment(null);
      setWorkoutNotice({ kind: "success", message: copy.plans.workoutAbandoned });
      const key = draftCacheKey(activeDraftQuery.data?.id);
      if (key) await SecureStore.deleteItemAsync(key);
      await queryClient.invalidateQueries({ queryKey: ["member-active-workout-draft", selectedWorkoutPlanId] });
    },
    onError: (error) => {
      if (!activeDraftQuery.data) {
        setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain });
        return;
      }
      void queueWorkoutAction({
        id: createWorkoutQueueId(),
        kind: "request",
        path: `/fitness/workout-sessions/${activeDraftQuery.data.id}`,
        method: "DELETE",
        createdAt: new Date().toISOString(),
      }, error);
      if (isLikelyNetworkError(error)) {
        queryClient.setQueryData(["member-active-workout-draft", selectedWorkoutPlanId], null);
      }
    },
  });

  const editCompletedSessionMutation = useMutation({
    mutationFn: async (session: NonNullable<typeof historyQuery.data>[number]) => {
      const rpeValue = editSessionRpe ? Number(editSessionRpe) : null;
      const painValue = editPainLevel ? Number(editPainLevel) : null;
      if (rpeValue != null && (!Number.isFinite(rpeValue) || rpeValue < 1 || rpeValue > 10)) throw new Error(copy.plans.sessionRpe);
      if (painValue != null && (!Number.isFinite(painValue) || painValue < 0 || painValue > 10)) throw new Error(copy.plans.painLevel);
      const payload = await authorizedRequest(`/fitness/session-logs/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          duration_minutes: session.duration_minutes || null,
          notes: editSessionNotes || null,
          rpe: rpeValue,
          pain_level: painValue,
          effort_feedback: editEffortFeedback || null,
          attachment_url: session.attachment_url || null,
          attachment_mime: session.attachment_mime || null,
          attachment_size_bytes: session.attachment_size_bytes || null,
        }),
      });
      return payload.data;
    },
    onSuccess: async () => {
      setEditingSessionId(null);
      setWorkoutNotice({ kind: "success", message: copy.plans.sessionUpdated });
      await queryClient.invalidateQueries({ queryKey: ["member-workout-history", selectedWorkoutPlanId] });
    },
    onError: (error) => setWorkoutNotice({ kind: "error", message: error instanceof Error ? error.message : copy.common.errorTryAgain }),
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

  useEffect(() => {
    const key = draftCacheKey(activeDraftQuery.data?.id);
    if (!key) return;
    let cancelled = false;
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (!raw || cancelled) return;
        const cached = JSON.parse(raw) as {
          exerciseForm?: ExerciseForm;
          setRows?: SetDetail[];
          sessionDuration?: string;
          sessionNotes?: string;
          sessionRpe?: string;
          painLevel?: string;
          effortFeedback?: "TOO_EASY" | "JUST_RIGHT" | "TOO_HARD" | "";
          sessionAttachment?: WorkoutAttachment | null;
          currentEntryId?: string | null;
        };
        if (cached.currentEntryId && cached.currentEntryId !== currentEntry?.id) return;
        if (cached.exerciseForm) setExerciseForm(cached.exerciseForm);
        if (cached.setRows?.length) setSetRows(cached.setRows);
        setSessionDuration(cached.sessionDuration || "");
        setSessionNotes(cached.sessionNotes || "");
        setSessionRpe(cached.sessionRpe || "");
        setPainLevel(cached.painLevel || "");
        setEffortFeedback(cached.effortFeedback || "");
        setSessionAttachment(cached.sessionAttachment || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeDraftQuery.data?.id]);

  useEffect(() => {
    const key = draftCacheKey(activeDraftQuery.data?.id);
    if (!key) return;
    void SecureStore.setItemAsync(
      key,
      JSON.stringify({ currentEntryId: currentEntry?.id ?? null, exerciseForm, setRows, sessionDuration, sessionNotes, sessionRpe, painLevel, effortFeedback, sessionAttachment }),
    ).catch(() => undefined);
  }, [activeDraftQuery.data?.id, currentEntry?.id, exerciseForm, setRows, sessionDuration, sessionNotes, sessionRpe, painLevel, effortFeedback, sessionAttachment]);

  useEffect(() => {
    if (restSeconds <= 0) return;
    const timer = setInterval(() => setRestSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [restSeconds]);

  const workoutActionPending =
    startMutation.isPending || completeMutation.isPending || skipMutation.isPending || previousMutation.isPending || finishMutation.isPending || abandonMutation.isPending;
  const estimatedDuration = estimateSessionDurationMinutes(activeDraftQuery.data);

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
                  <MutedText>{plan.exercises?.length || 0} {copy.plans.exercisesCount}</MutedText>
                </Pressable>
              ))
            )}
          </Card>

          {selectedWorkoutPlan ? (
            <Card>
              <SectionTitle>{selectedWorkoutPlan.name}</SectionTitle>
              {workoutNotice ? (
                <Text style={{ color: workoutNotice.kind === "error" ? "#DC2626" : theme.primary, fontFamily: fontSet.body, fontSize: 13, fontWeight: "700", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                  {workoutNotice.message}
                </Text>
              ) : null}
              {pendingWorkoutSyncCount > 0 ? (
                <View style={{ gap: 6 }}>
                  <MutedText>{copy.plans.pendingSync}: {pendingWorkoutSyncCount}</MutedText>
                  {pendingWorkoutActions.slice(0, 3).map((action) => (
                    <MutedText key={action.id}>{describeQueuedWorkoutAction(action, copy)}</MutedText>
                  ))}
                  {pendingWorkoutSyncCount > 3 ? <MutedText>+{pendingWorkoutSyncCount - 3}</MutedText> : null}
                  <SecondaryButton disabled={workoutActionPending} onPress={() => void replayPendingWorkoutActions()}>
                    {copy.plans.retrySync}
                  </SecondaryButton>
                </View>
              ) : null}
              {workoutSections.length > 0 && !activeDraftQuery.data ? (
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  {workoutSections.map((section) => (
                    <SecondaryButton key={section} disabled={workoutActionPending} onPress={() => setSelectedSection(section)}>
                      {selectedSection === section ? `${copy.plans.section}: ${section}` : section}
                    </SecondaryButton>
                  ))}
                </View>
              ) : null}

              {!activeDraftQuery.data ? (
                <PrimaryButton disabled={workoutActionPending || !selectedWorkoutPlanId} onPress={() => startMutation.mutate(undefined)}>
                  {startMutation.isPending ? copy.common.loading : copy.plans.startSession}
                </PrimaryButton>
              ) : (
                <View style={{ gap: 12, marginTop: 12 }}>
                  <MutedText>{copy.plans.progress}: {completedCount}/{activeDraftQuery.data.entries.length}</MutedText>
                  {currentEntry ? (
                    <>
                      <Text style={{ color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                        {copy.plans.currentExercise}: {currentEntry.exercise_name}
                      </Text>
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 13, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                          {copy.plans.target}:
                        </Text>
                        <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 13, textAlign: "left", writingDirection: "ltr" }}>
                          {currentEntry.target_sets || 0} x {currentEntry.target_reps || 0}
                        </Text>
                        {currentEntry.section_name ? (
                          <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 13, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                            • {copy.plans.section}: {currentEntry.section_name}
                          </Text>
                        ) : null}
                      </View>
                      {lastPerformance ? (
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                          <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 13, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                            {copy.plans.lastSession}:
                          </Text>
                          <Text style={{ color: theme.muted, fontFamily: fontSet.body, fontSize: 13, textAlign: "left", writingDirection: "ltr" }}>
                            {lastPerformance.reps_completed} {copy.plans.repsCompleted} @ {lastPerformance.weight_kg ?? 0}{copy.plans.weightUnit}
                          </Text>
                        </View>
                      ) : null}
                      {restSeconds > 0 ? (
                        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, backgroundColor: theme.primarySoft, flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 6, alignItems: "center" }}>
                            <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                              {copy.plans.restTimer}:
                            </Text>
                            <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: "ltr" }}>
                              {Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, "0")}
                            </Text>
                          </View>
                          <SecondaryButton onPress={() => setRestSeconds(0)}>{copy.plans.skipRest}</SecondaryButton>
                        </View>
                      ) : (
                        <SecondaryButton onPress={() => setRestSeconds(restSecondsForEntry(currentEntry))}>{copy.plans.startRestTimer}</SecondaryButton>
                      )}
                      <ExerciseVideoBlock entry={currentEntry} />
                      <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, backgroundColor: theme.cardAlt, gap: 12 }}>
                        <SetDetailsEditor rows={setRows} onChange={setSetRows} />
                        {exerciseForm.notes ? <MutedText>{copy.plans.exerciseNotes}</MutedText> : null}
                        <TextArea value={exerciseForm.notes} onChangeText={(value) => setExerciseForm((current) => ({ ...current, notes: value }))} placeholder={copy.plans.exerciseNotes} />
                      </View>
                      <Pressable onPress={() => setExerciseForm((current) => ({ ...current, isPr: !current.isPr }))} style={{ paddingVertical: 6 }}>
                        <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                          {exerciseForm.isPr ? "✓ " : ""}{copy.plans.prToggle}
                        </Text>
                      </Pressable>
                      {autoPrPreview ? <MutedText>{autoPrPreview}</MutedText> : null}
                      {exerciseForm.isPr ? (
                        <>
                          {exerciseForm.prType ? <MutedText>{copy.plans.prType}</MutedText> : null}
                          <Input value={exerciseForm.prType} onChangeText={(value) => setExerciseForm((current) => ({ ...current, prType: value }))} placeholder={copy.plans.prType} />
                          {exerciseForm.prValue ? <MutedText>{copy.plans.prValue}</MutedText> : null}
                          <Input value={exerciseForm.prValue} onChangeText={(value) => setExerciseForm((current) => ({ ...current, prValue: value }))} placeholder={copy.plans.prValue} />
                          {exerciseForm.prNotes ? <MutedText>{copy.plans.prNotes}</MutedText> : null}
                          <TextArea value={exerciseForm.prNotes} onChangeText={(value) => setExerciseForm((current) => ({ ...current, prNotes: value }))} placeholder={copy.plans.prNotes} />
                        </>
                      ) : null}
                      <PrimaryButton disabled={workoutActionPending} onPress={() => completeMutation.mutate(undefined)}>
                        {completeMutation.isPending ? copy.common.loading : copy.plans.completeExercise}
                      </PrimaryButton>
                      <SecondaryButton disabled={workoutActionPending} onPress={() => skipMutation.mutate(undefined)}>
                        {skipMutation.isPending ? copy.common.loading : copy.plans.skipExercise}
                      </SecondaryButton>
                      <SecondaryButton disabled={workoutActionPending || completedCount === 0} onPress={() => previousMutation.mutate(undefined)}>
                        {previousMutation.isPending ? copy.common.loading : copy.plans.previousExercise}
                      </SecondaryButton>
                    </>
                  ) : (
                    <MutedText>{copy.plans.finishSession}</MutedText>
                  )}
                  {sessionDuration || estimatedDuration ? <MutedText>{copy.plans.sessionDuration}</MutedText> : null}
                  <Input
                    value={sessionDuration}
                    onChangeText={setSessionDuration}
                    placeholder={estimatedDuration ? `${copy.plans.sessionDuration}: ${estimatedDuration}` : copy.plans.sessionDuration}
                    keyboardType="number-pad"
                  />
                  {sessionNotes ? <MutedText>{copy.plans.sessionNotes}</MutedText> : null}
                  <TextArea value={sessionNotes} onChangeText={setSessionNotes} placeholder={copy.plans.sessionNotes} />
                  {sessionRpe ? <MutedText>{copy.plans.sessionRpe}</MutedText> : null}
                  <Input value={sessionRpe} onChangeText={setSessionRpe} placeholder={copy.plans.sessionRpe} keyboardType="number-pad" />
                  {painLevel ? <MutedText>{copy.plans.painLevel}</MutedText> : null}
                  <Input value={painLevel} onChangeText={setPainLevel} placeholder={copy.plans.painLevel} keyboardType="number-pad" />
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 }}>
                    {(["TOO_EASY", "JUST_RIGHT", "TOO_HARD"] as const).map((value) => (
                      <SecondaryButton key={value} onPress={() => setEffortFeedback(value)} disabled={workoutActionPending}>
                        {effortFeedback === value ? "✓ " : ""}{copy.plans.effortOptions[value]}
                      </SecondaryButton>
                    ))}
                  </View>
                  {safetyGuidance ? <MutedText>{safetyGuidance}</MutedText> : null}
                  {sessionAttachment ? (
                    <>
                      <MediaPreview uri={sessionAttachment.media_url} mime={sessionAttachment.media_mime} label={sessionAttachment.name || copy.plans.sessionAttachment} />
                      <SecondaryButton disabled={workoutActionPending} onPress={() => setSessionAttachment(null)}>{copy.plans.removeAttachment}</SecondaryButton>
                    </>
                  ) : null}
                  <SecondaryButton disabled={attachMediaMutation.isPending || workoutActionPending} onPress={() => attachMediaMutation.mutate()}>
                    {attachMediaMutation.isPending ? copy.common.uploading : sessionAttachment ? copy.plans.replaceAttachment : copy.plans.attachSessionMedia}
                  </SecondaryButton>
                  <PrimaryButton disabled={workoutActionPending || !canFinishSession} onPress={() => finishMutation.mutate(undefined)}>
                    {finishMutation.isPending ? copy.common.loading : copy.plans.finishSession}
                  </PrimaryButton>
                  <SecondaryButton disabled={workoutActionPending} onPress={() => abandonMutation.mutate(undefined)}>
                    {abandonMutation.isPending ? copy.common.loading : copy.plans.abandonSession}
                  </SecondaryButton>
                </View>
              )}
            </Card>
          ) : null}

          <Card>
            <SectionTitle>{copy.plans.recentSessions}</SectionTitle>
            <QueryState loading={historyQuery.isLoading} error={historyQuery.error instanceof Error ? historyQuery.error.message : null} empty={!historyQuery.data?.length} emptyMessage={copy.plans.noSessionHistory} />
            {historyQuery.data?.map((session) => {
              const canEditSession = Date.now() - new Date(session.performed_at).getTime() <= 24 * 60 * 60 * 1000;
              const editing = editingSessionId === session.id;
              return (
              <View key={session.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                <Pressable onPress={() => setExpandedSessionId((current) => (current === session.id ? null : session.id))}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {new Date(session.performed_at).toLocaleString()}
                  </Text>
                  <MutedText>
                    {session.duration_minutes || 0} {copy.common.minutesShort} • {session.entries.filter((entry) => !entry.skipped).length} {copy.plans.done}
                    {session.entries.some((entry) => entry.skipped) ? ` • ${session.entries.filter((entry) => entry.skipped).length} ${copy.plans.skipExercise}` : ""}
                    {" • "}
                    {session.entries.filter((entry) => entry.is_pr).length} {copy.plans.prs}
                  </MutedText>
                </Pressable>
                {expandedSessionId === session.id ? (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <MutedText>
                      {[
                        session.rpe != null ? `${copy.plans.sessionRpe}: ${session.rpe}` : null,
                        session.pain_level != null ? `${copy.plans.painLevel}: ${session.pain_level}` : null,
                        session.effort_feedback ? copy.plans.effortOptions[session.effort_feedback as keyof typeof copy.plans.effortOptions] : null,
                      ].filter(Boolean).join(" • ") || copy.progress.noSessionNotes}
                    </MutedText>
                    {session.notes ? <MutedText>{session.notes}</MutedText> : null}
                    {editing ? (
                      <View style={{ gap: 8 }}>
                        <TextArea value={editSessionNotes} onChangeText={setEditSessionNotes} placeholder={copy.plans.sessionNotes} />
                        <Input value={editSessionRpe} onChangeText={setEditSessionRpe} placeholder={copy.plans.sessionRpe} keyboardType="number-pad" />
                        <Input value={editPainLevel} onChangeText={setEditPainLevel} placeholder={copy.plans.painLevel} keyboardType="number-pad" />
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 }}>
                          {(["TOO_EASY", "JUST_RIGHT", "TOO_HARD"] as const).map((value) => (
                            <SecondaryButton key={value} onPress={() => setEditEffortFeedback(value)}>
                              {editEffortFeedback === value ? "✓ " : ""}{copy.plans.effortOptions[value]}
                            </SecondaryButton>
                          ))}
                        </View>
                        <PrimaryButton disabled={editCompletedSessionMutation.isPending} onPress={() => editCompletedSessionMutation.mutate(session)}>
                          {editCompletedSessionMutation.isPending ? copy.common.loading : copy.plans.saveSessionEdit}
                        </PrimaryButton>
                        <SecondaryButton onPress={() => setEditingSessionId(null)}>{copy.common.cancel}</SecondaryButton>
                      </View>
                    ) : canEditSession ? (
                      <SecondaryButton onPress={() => {
                        setEditingSessionId(session.id);
                        setEditSessionNotes(session.notes || "");
                        setEditSessionRpe(session.rpe != null ? String(session.rpe) : "");
                        setEditPainLevel(session.pain_level != null ? String(session.pain_level) : "");
                        setEditEffortFeedback((session.effort_feedback as "TOO_EASY" | "JUST_RIGHT" | "TOO_HARD" | "") || "");
                      }}>
                        {copy.plans.editSession}
                      </SecondaryButton>
                    ) : null}
                    {session.attachment_url ? <MediaPreview uri={session.attachment_url} mime={session.attachment_mime} label={copy.plans.sessionAttachment} /> : null}
                    {session.entries.map((entry, index) => (
                      <View key={entry.id || `${session.id}-${index}`} style={{ padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.cardAlt }}>
                        <Text style={{ color: theme.foreground, fontFamily: fontSet.body, fontWeight: "700", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                          {entry.exercise_name || copy.progress.prFallback}{entry.skipped ? ` • ${copy.plans.skipExercise}` : ""}
                        </Text>
                        <MutedText>{entry.skipped ? copy.plans.skipExercise : `${entry.sets_completed} x ${entry.reps_completed} @ ${entry.weight_kg ?? 0}${copy.plans.weightUnit}`}</MutedText>
                        {entry.set_details?.length ? (
                          <MutedText>{entry.set_details.map((row) => `${row.set}: ${row.reps} @ ${row.weightKg || 0}${copy.plans.weightUnit}`).join(" • ")}</MutedText>
                        ) : null}
                        {entry.notes ? <MutedText>{entry.notes}</MutedText> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              );
            })}
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

function DirectVideoPlayer({ url }: { url: string }) {
  const { theme } = usePreferences();
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });

  return (
    <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: "hidden", backgroundColor: theme.cardAlt }}>
      <VideoView style={{ width: "100%", height: 240 }} player={player} nativeControls allowsFullscreen allowsPictureInPicture />
    </View>
  );
}

function ExerciseVideoBlock({ entry }: { entry: WorkoutDraft["entries"][number] }) {
  const { copy } = usePreferences();
  const video = resolveExerciseVideo(entry);
  if (!video) return null;

  if (video.direct) {
    return <DirectVideoPlayer url={video.url} />;
  }

  return (
    <SecondaryButton onPress={() => void WebBrowser.openBrowserAsync(video.url)}>
      {copy.plans.exerciseVideo}
    </SecondaryButton>
  );
}

function SetDetailsEditor({ rows, onChange }: { rows: SetDetail[]; onChange: (rows: SetDetail[]) => void }) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>{copy.plans.setDetails}</SectionTitle>
      {rows.length > 0 ? (
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, paddingHorizontal: 4 }}>
          <Text style={{ width: 40, color: theme.muted, fontFamily: fontSet.body, fontSize: 12, textAlign: "center", writingDirection: direction }}>{copy.plans.set}</Text>
          <Text style={{ flex: 1, color: theme.muted, fontFamily: fontSet.body, fontSize: 12, textAlign: "center", writingDirection: direction }}>{copy.plans.repsCompleted}</Text>
          <Text style={{ flex: 1, color: theme.muted, fontFamily: fontSet.body, fontSize: 12, textAlign: "center", writingDirection: direction }}>{copy.plans.weightKg}</Text>
        </View>
      ) : null}
      {rows.map((row, index) => (
        <View key={row.set} style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, alignItems: "center" }}>
          <Text style={{ width: 40, color: theme.primary, fontFamily: fontSet.mono, fontWeight: "800", textAlign: "center", writingDirection: direction }}>
            {row.set}
          </Text>
          <Input
            value={row.reps}
            onChangeText={(value) => onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, reps: value } : item)))}
            placeholder={copy.plans.repsCompleted}
            keyboardType="number-pad"
            style={{ flex: 1, textAlign: "center" }}
          />
          <Input
            value={row.weightKg}
            onChangeText={(value) => onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, weightKg: value } : item)))}
            placeholder={copy.plans.weightKg}
            keyboardType="decimal-pad"
            style={{ flex: 1, textAlign: "center" }}
          />
        </View>
      ))}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
        <SecondaryButton onPress={() => onChange([...rows, { set: rows.length + 1, reps: "", weightKg: "" }])}>{copy.plans.addSet}</SecondaryButton>
        {rows.length > 1 ? <SecondaryButton onPress={() => onChange(rows.slice(0, -1))}>{copy.plans.removeSet}</SecondaryButton> : null}
      </View>
    </View>
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
  const [workoutDropdownOpen, setWorkoutDropdownOpen] = useState(false);
  const [dietDropdownOpen, setDietDropdownOpen] = useState(false);
  const [workoutSearch, setWorkoutSearch] = useState("");
  const [dietSearch, setDietSearch] = useState("");
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
  const filteredWorkoutPlans = useMemo(
    () => workoutPlans.filter((plan) => matchesPlanSearch(plan, workoutSearch, copy.coachPlans.template)),
    [copy.coachPlans.template, workoutPlans, workoutSearch],
  );
  const filteredDietPlans = useMemo(
    () => dietPlans.filter((plan) => matchesPlanSearch(plan, dietSearch, copy.coachPlans.template)),
    [copy.coachPlans.template, dietPlans, dietSearch],
  );

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
                setWorkoutDropdownOpen(false);
                setWorkoutName("");
                setWorkoutDescription("");
                setWorkoutExpectedSessions("12");
                setExerciseRows([{ id: createRowId(), section_name: "Warm-up", exercise_name: "", sets: 3, reps: 10, order: 0 }]);
                return;
              }
              setCreatingDiet(true);
              setSelectedDietId(null);
              setDietDropdownOpen(false);
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
            {workoutPlans.length > 0 ? (
              <SearchablePlanDropdown
                open={workoutDropdownOpen}
                onToggle={() => setWorkoutDropdownOpen((current) => !current)}
                search={workoutSearch}
                onSearchChange={setWorkoutSearch}
                placeholder={copy.coachPlans.searchWorkoutPlans}
                selectLabel={copy.coachPlans.selectWorkoutPlan}
                noResultsLabel={copy.coachPlans.noMatchingPlans}
                selectedTitle={selectedWorkout?.name || copy.coachPlans.selectWorkoutPlan}
                selectedSubtitle={selectedWorkout ? `${localizePlanStatus(selectedWorkout.status, isRTL)} • ${selectedWorkout.member_name || copy.coachPlans.template}` : copy.coachPlans.searchWorkoutPlans}
                plans={filteredWorkoutPlans}
                selectedId={selectedWorkoutId}
                templateLabel={copy.coachPlans.template}
                onSelect={(planId) => {
                  setEditorMode("workout");
                  setCreatingWorkout(false);
                  setSelectedWorkoutId(planId);
                  setWorkoutDropdownOpen(false);
                }}
              />
            ) : null}
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
            {dietPlans.length > 0 ? (
              <SearchablePlanDropdown
                open={dietDropdownOpen}
                onToggle={() => setDietDropdownOpen((current) => !current)}
                search={dietSearch}
                onSearchChange={setDietSearch}
                placeholder={copy.coachPlans.searchDietPlans}
                selectLabel={copy.coachPlans.selectDietPlan}
                noResultsLabel={copy.coachPlans.noMatchingPlans}
                selectedTitle={selectedDiet?.name || copy.coachPlans.selectDietPlan}
                selectedSubtitle={selectedDiet ? `${localizePlanStatus(selectedDiet.status, isRTL)} • ${selectedDiet.member_name || copy.coachPlans.template}` : copy.coachPlans.searchDietPlans}
                plans={filteredDietPlans}
                selectedId={selectedDietId}
                templateLabel={copy.coachPlans.template}
                onSelect={(planId) => {
                  setEditorMode("diet");
                  setCreatingDiet(false);
                  setSelectedDietId(planId);
                  setDietDropdownOpen(false);
                }}
              />
            ) : null}
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

type SearchablePlanOption = {
  id: string;
  name: string;
  status: string;
  member_name?: string | null;
  is_template: boolean;
};

function matchesPlanSearch(plan: SearchablePlanOption, search: string, templateLabel: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [plan.name, plan.member_name, plan.status, plan.is_template ? templateLabel : null]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function SearchablePlanDropdown({
  open,
  onToggle,
  search,
  onSearchChange,
  placeholder,
  selectLabel,
  noResultsLabel,
  selectedTitle,
  selectedSubtitle,
  plans,
  selectedId,
  templateLabel,
  onSelect,
}: {
  open: boolean;
  onToggle: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  selectLabel: string;
  noResultsLabel: string;
  selectedTitle: string;
  selectedSubtitle: string;
  plans: SearchablePlanOption[];
  selectedId: string | null;
  templateLabel: string;
  onSelect: (planId: string) => void;
}) {
  const { theme, fontSet, direction, isRTL } = usePreferences();
  const visiblePlans = plans.slice(0, 8);

  return (
    <View style={{ marginTop: 10 }}>
      <Pressable
        onPress={onToggle}
        style={{
          borderWidth: 1,
          borderColor: open ? theme.primary : theme.border,
          backgroundColor: theme.cardAlt,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 16,
        }}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: theme.foreground, fontFamily: fontSet.body, fontWeight: "800", textAlign: isRTL ? "right" : "left", writingDirection: direction }} numberOfLines={1}>
              {selectedTitle}
            </Text>
            <MutedText>{selectedSubtitle || selectLabel}</MutedText>
          </View>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={theme.primary} />
        </View>
      </Pressable>

      {open ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Input value={search} onChangeText={onSearchChange} placeholder={placeholder} />
          {visiblePlans.length === 0 ? <MutedText>{noResultsLabel}</MutedText> : null}
          {visiblePlans.map((plan) => (
            <PlanPickerRow
              key={plan.id}
              title={plan.name}
              subtitle={`${localizePlanStatus(plan.status, isRTL)} • ${plan.member_name || templateLabel}`}
              active={selectedId === plan.id}
              onPress={() => onSelect(plan.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
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
