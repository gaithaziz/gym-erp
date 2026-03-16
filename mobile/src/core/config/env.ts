import Constants from "expo-constants";

function normalizeApiUrl(rawValue?: string | null): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    throw new Error("API URL must not be empty.");
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api/v1")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api/v1`;
}

function extractHost(rawValue?: string | null): string | null {
  const trimmed = rawValue?.trim();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const [authority] = withoutProtocol.split("/");
  if (!authority) return null;

  return authority.split(":")[0] ?? null;
}

function inferDevelopmentApiBaseUrl(): string | null {
  const locationHost =
    typeof globalThis.location?.hostname === "string" ? globalThis.location.hostname.trim() : "";
  if (locationHost) {
    return `http://${locationHost}:8000`;
  }

  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string | null } | null;
    manifest2?: { extra?: { expoClient?: { hostUri?: string | null } | null } | null } | null;
    manifest?: { debuggerHost?: string | null } | null;
  };

  const hostCandidates = [
    constants.expoConfig?.hostUri,
    constants.manifest2?.extra?.expoClient?.hostUri,
    constants.manifest?.debuggerHost,
  ];

  for (const candidate of hostCandidates) {
    const host = extractHost(candidate);
    if (host) {
      return `http://${host}:8000`;
    }
  }

  return null;
}

function resolveApiUrl(rawValue?: string): string {
  if (rawValue?.trim()) {
    return normalizeApiUrl(rawValue);
  }

  const inferredBaseUrl = inferDevelopmentApiBaseUrl();
  if (inferredBaseUrl) {
    return normalizeApiUrl(inferredBaseUrl);
  }

  throw new Error(
    "EXPO_PUBLIC_API_URL is required for the mobile app when the backend host cannot be inferred.",
  );
}

export const env = {
  apiUrl: resolveApiUrl(process.env.EXPO_PUBLIC_API_URL),
};
