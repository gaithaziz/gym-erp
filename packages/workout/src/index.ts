export type WorkoutSetDetailLike = {
  set: number;
  reps?: string | number | null;
  weightKg?: string | number | null;
};

export type WorkoutEntryLike = {
  exercise_name?: string | null;
  skipped?: boolean;
  weight_kg?: number | null;
  reps_completed: number;
  set_details?: WorkoutSetDetailLike[] | null;
};

export type WorkoutHistoryLike<TEntry extends WorkoutEntryLike = WorkoutEntryLike> = {
  entries: TEntry[];
};

export type WorkoutProgressEntryLike = WorkoutEntryLike & {
  entry_volume?: number | null;
};

export type WorkoutProgressSessionLike<TEntry extends WorkoutProgressEntryLike = WorkoutProgressEntryLike> = {
  entries: TEntry[];
};

export function getExerciseKey(name?: string | null): string {
  return (name || "").trim().toLowerCase();
}

export function isBetterWorkoutPerformance<TEntry extends WorkoutEntryLike>(candidate: TEntry, current: TEntry): boolean {
  const candidateWeight = Number(candidate.weight_kg || 0);
  const currentWeight = Number(current.weight_kg || 0);
  if (candidateWeight > currentWeight) return true;
  if (candidateWeight < currentWeight) return false;
  return Number(candidate.reps_completed || 0) > Number(current.reps_completed || 0);
}

export function buildBestPerformanceIndex<TEntry extends WorkoutEntryLike, THistory extends WorkoutHistoryLike<TEntry>>(
  history: THistory[] | undefined,
): Map<string, TEntry> {
  const index = new Map<string, TEntry>();
  for (const session of history || []) {
    for (const entry of session.entries) {
      if (entry.skipped || !entry.exercise_name) continue;
      const key = getExerciseKey(entry.exercise_name);
      if (!key) continue;
      const current = index.get(key);
      if (!current || isBetterWorkoutPerformance(entry, current)) {
        index.set(key, entry);
      }
    }
  }
  return index;
}

export type ExercisePrTableRow = {
  exercise: string;
  bestWeight: number;
  bestWeightReps: number;
  bestReps: number;
  bestRepsWeight: number;
  bestVolume: number;
};

function getEntryVolume(entry: WorkoutProgressEntryLike): number {
  if (typeof entry.entry_volume === "number" && Number.isFinite(entry.entry_volume)) return entry.entry_volume;
  if (entry.skipped) return 0;
  const setDetailsVolume = (entry.set_details || []).reduce((sum, row) => {
    const reps = Number(row.reps || 0);
    const weight = Number(row.weightKg || 0);
    if (!Number.isFinite(reps) || !Number.isFinite(weight)) return sum;
    return sum + Math.max(0, reps) * Math.max(0, weight);
  }, 0);
  if (setDetailsVolume > 0) return setDetailsVolume;
  return Math.max(0, Number(entry.reps_completed || 0) * Number(entry.weight_kg || 0));
}

export function buildExercisePrTable<
  TEntry extends WorkoutProgressEntryLike,
  THistory extends WorkoutProgressSessionLike<TEntry>,
>(history: THistory[] | undefined, fallbackExercise = "Exercise"): ExercisePrTableRow[] {
  const byExercise = new Map<string, ExercisePrTableRow>();
  for (const session of history || []) {
    for (const entry of session.entries) {
      if (entry.skipped) continue;
      const exercise = (entry.exercise_name || fallbackExercise).trim();
      const weightValue = Number(entry.weight_kg || 0);
      const repsValue = Number(entry.reps_completed || 0);
      const volumeValue = getEntryVolume(entry);
      const existing = byExercise.get(exercise);
      if (!existing) {
        byExercise.set(exercise, {
          exercise,
          bestWeight: weightValue,
          bestWeightReps: repsValue,
          bestReps: repsValue,
          bestRepsWeight: weightValue,
          bestVolume: volumeValue,
        });
        continue;
      }
      if (weightValue > existing.bestWeight || (weightValue === existing.bestWeight && repsValue > existing.bestWeightReps)) {
        existing.bestWeight = weightValue;
        existing.bestWeightReps = repsValue;
      }
      if (repsValue > existing.bestReps || (repsValue === existing.bestReps && weightValue > existing.bestRepsWeight)) {
        existing.bestReps = repsValue;
        existing.bestRepsWeight = weightValue;
      }
      if (volumeValue > existing.bestVolume) {
        existing.bestVolume = volumeValue;
      }
    }
  }

  return Array.from(byExercise.values()).sort((a, b) => b.bestWeight - a.bestWeight);
}
