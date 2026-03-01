function normalizeApiUrl(rawValue?: string): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    throw new Error("EXPO_PUBLIC_API_URL is required for the mobile app.");
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api/v1")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api/v1`;
}

export const env = {
  apiUrl: normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL),
};
