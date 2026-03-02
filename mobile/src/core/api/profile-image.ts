import { env } from "@/src/core/config/env";

const apiOrigin = env.apiUrl.endsWith("/api/v1")
  ? env.apiUrl.slice(0, -"/api/v1".length)
  : env.apiUrl;

export function resolveProfileImageUrl(profilePictureUrl?: string | null): string | undefined {
  if (!profilePictureUrl) return undefined;

  const trimmed = profilePictureUrl.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${apiOrigin}${path}`;
}
