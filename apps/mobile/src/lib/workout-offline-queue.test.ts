import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueWorkoutAction,
  isLikelyNetworkError,
  loadWorkoutQueue,
  replayWorkoutQueue,
  saveWorkoutQueue,
  type WorkoutQueuedAction,
} from "./workout-offline-queue";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
}));

const action = (id: string, path: string): WorkoutQueuedAction => ({
  id,
  kind: "request",
  path,
  method: "POST",
  body: { id },
  createdAt: `2026-04-18T10:00:0${id}Z`,
});

describe("workout offline queue", () => {
  beforeEach(() => {
    store.clear();
  });

  it("stores queued actions in original order", async () => {
    await enqueueWorkoutAction(action("1", "/fitness/one"));
    await enqueueWorkoutAction(action("2", "/fitness/two"));

    const queue = await loadWorkoutQueue();

    expect(queue.map((item) => item.path)).toEqual(["/fitness/one", "/fitness/two"]);
  });

  it("replays in order and clears successful actions", async () => {
    await saveWorkoutQueue([action("1", "/fitness/one"), action("2", "/fitness/two")]);
    const calls: string[] = [];

    const result = await replayWorkoutQueue(async <T,>(path: string) => {
      calls.push(path);
      return { data: {} as T };
    });

    expect(result).toEqual({ processed: 2, remaining: 0 });
    expect(calls).toEqual(["/fitness/one", "/fitness/two"]);
    expect(await loadWorkoutQueue()).toEqual([]);
  });

  it("stops on conflicts and keeps the failed action for recovery", async () => {
    await saveWorkoutQueue([action("1", "/fitness/one"), action("2", "/fitness/two")]);

    const result = await replayWorkoutQueue(async <T,>(path: string) => {
      if (path === "/fitness/two") throw new Error("409 conflict");
      return { data: {} as T };
    });

    expect(result.processed).toBe(1);
    expect(result.remaining).toBe(1);
    expect((await loadWorkoutQueue()).map((item) => item.path)).toEqual(["/fitness/two"]);
  });

  it("detects likely connectivity failures", () => {
    expect(isLikelyNetworkError(new Error("Network request failed"))).toBe(true);
    expect(isLikelyNetworkError(new Error("409 conflict"))).toBe(false);
  });
});
