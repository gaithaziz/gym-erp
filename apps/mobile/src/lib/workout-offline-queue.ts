import * as SecureStore from "expo-secure-store";

const WORKOUT_QUEUE_KEY = "gymerpmobileworkoutofflinequeue";

export type WorkoutQueuedAction =
  | {
      id: string;
      kind: "request";
      path: string;
      method: "POST" | "PUT" | "DELETE";
      body?: unknown;
      createdAt: string;
    }
  | {
      id: string;
      kind: "media_upload";
      path: string;
      asset: { uri: string; name: string; mimeType: string };
      createdAt: string;
    };

export function createWorkoutQueueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isLikelyNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("network") || message.includes("failed to fetch") || message.includes("internet") || message.includes("offline");
}

export async function loadWorkoutQueue(): Promise<WorkoutQueuedAction[]> {
  const raw = await SecureStore.getItemAsync(WORKOUT_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveWorkoutQueue(actions: WorkoutQueuedAction[]) {
  if (actions.length === 0) {
    await SecureStore.deleteItemAsync(WORKOUT_QUEUE_KEY);
    return;
  }
  await SecureStore.setItemAsync(WORKOUT_QUEUE_KEY, JSON.stringify(actions));
}

export async function enqueueWorkoutAction(action: WorkoutQueuedAction) {
  const actions = await loadWorkoutQueue();
  const next = [...actions, action];
  await saveWorkoutQueue(next);
  return next;
}

export async function replayWorkoutQueue(
  authorizedRequest: <T>(path: string, init?: RequestInit) => Promise<{ data: T }>,
): Promise<{ processed: number; remaining: number; error?: string }> {
  const actions = await loadWorkoutQueue();
  let processed = 0;
  for (const action of actions) {
    try {
      if (action.kind === "media_upload") {
        const formData = new FormData();
        formData.append("file", {
          uri: action.asset.uri,
          name: action.asset.name,
          type: action.asset.mimeType,
        } as unknown as Blob);
        await authorizedRequest(action.path, { method: "POST", body: formData });
      } else {
        await authorizedRequest(action.path, {
          method: action.method,
          body: action.body == null ? undefined : JSON.stringify(action.body),
        });
      }
      processed += 1;
      await saveWorkoutQueue(actions.slice(processed));
    } catch (error) {
      return {
        processed,
        remaining: actions.length - processed,
        error: error instanceof Error ? error.message : "Workout sync failed",
      };
    }
  }
  await saveWorkoutQueue([]);
  return { processed, remaining: 0 };
}
