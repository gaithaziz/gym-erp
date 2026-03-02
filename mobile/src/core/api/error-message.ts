import { AxiosError } from "axios";

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as { detail?: unknown } | undefined;
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  }

  return fallback;
}
