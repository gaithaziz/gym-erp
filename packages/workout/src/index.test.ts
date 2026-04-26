import { describe, expect, it } from "vitest";

import { buildBestPerformanceIndex, getExerciseKey } from "./index";

describe("workout helper", () => {
  it("keeps the best all-time set by weight for each exercise", () => {
    const history = [
      {
        entries: [
          { exercise_name: "Bench Press", weight_kg: 100, reps_completed: 5, skipped: false },
          { exercise_name: "Bench Press", weight_kg: 105, reps_completed: 3, skipped: false },
          { exercise_name: "Bench Press", weight_kg: 105, reps_completed: 6, skipped: false },
        ],
      },
      {
        entries: [
          { exercise_name: "Bench Press", weight_kg: 95, reps_completed: 12, skipped: false },
          { exercise_name: "Squat", weight_kg: 140, reps_completed: 5, skipped: false },
        ],
      },
    ];

    const index = buildBestPerformanceIndex(history);

    expect(index.get(getExerciseKey("Bench Press"))).toEqual({
      exercise_name: "Bench Press",
      weight_kg: 105,
      reps_completed: 6,
      skipped: false,
    });
    expect(index.get(getExerciseKey("Squat"))).toEqual({
      exercise_name: "Squat",
      weight_kg: 140,
      reps_completed: 5,
      skipped: false,
    });
  });

  it("treats reps as the tiebreaker when the weight is the same", () => {
    const history = [
      {
        entries: [
          { exercise_name: "Deadlift", weight_kg: 150, reps_completed: 4, skipped: false },
          { exercise_name: "Deadlift", weight_kg: 150, reps_completed: 6, skipped: false },
        ],
      },
    ];

    const index = buildBestPerformanceIndex(history);

    expect(index.get(getExerciseKey("Deadlift"))).toEqual({
      exercise_name: "Deadlift",
      weight_kg: 150,
      reps_completed: 6,
      skipped: false,
    });
  });
});
