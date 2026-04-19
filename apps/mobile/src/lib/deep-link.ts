/**
 * deep-link.ts — Parses gymerp:// deep link URLs into Expo Router href strings.
 *
 * Used by:
 *   - Notification tap handler in _layout.tsx
 *   - Expo Linking listener for inbound URL opens
 *
 * Supported routes:
 *   gymerp://notifications            → /notifications
 *   gymerp://chat                     → /chat
 *   gymerp://support                  → /support
 *   gymerp://billing                  → /billing
 *   gymerp://profile                  → /profile
 *   gymerp://leaves                   → /leaves
 *   gymerp://home                     → /(tabs)/home
 *   gymerp://plans                    → /(tabs)/plans
 *   gymerp://progress                 → /(tabs)/progress
 *   gymerp://member/{id}              → /(tabs)/members?memberId={id}
 *
 * Returns null for unrecognized or malformed URLs.
 */

const SCHEME = "gymerp://";

export type DeepLinkTarget =
  | "/notifications"
  | "/chat"
  | "/ticket"
  | "/billing"
  | "/profile"
  | "/leaves"
  | "/(tabs)/home"
  | "/(tabs)/plans"
  | "/(tabs)/progress"
  | { pathname: "/(tabs)/members"; params: { memberId: string } };

export function parseDeepLink(url: string | null | undefined): DeepLinkTarget | null {
  if (!url) return null;

  // Normalize: strip the scheme to get the path portion
  const raw = url.trim();
  const withoutScheme = raw.startsWith(SCHEME) ? raw.slice(SCHEME.length) : raw;

  // Split on "?" to separate path and query
  const [pathPart] = withoutScheme.split("?");
  const segments = pathPart.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const [first, second] = segments;

  switch (first) {
    case "notifications":
      return "/notifications";
    case "chat":
      return "/chat";
    case "support":
      return "/ticket";
    case "billing":
      return "/billing";
    case "profile":
      return "/profile";
    case "leaves":
      return "/leaves";
    case "home":
      return "/(tabs)/home";
    case "plans":
      return "/(tabs)/plans";
    case "progress":
      return "/(tabs)/progress";
    case "member":
      if (typeof second === "string" && second.length > 0) {
        return { pathname: "/(tabs)/members", params: { memberId: second } };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Extracts a deep link target from push notification data.
 * Checks common field names that backends send: `url`, `link`, `deep_link`, `screen`.
 */
export function parseNotificationDeepLink(data: Record<string, unknown> | null | undefined): DeepLinkTarget | null {
  if (!data) return null;

  const candidate =
    (typeof data["url"] === "string" ? data["url"] : null) ??
    (typeof data["link"] === "string" ? data["link"] : null) ??
    (typeof data["deep_link"] === "string" ? data["deep_link"] : null) ??
    (typeof data["screen"] === "string" ? data["screen"] : null);

  return parseDeepLink(candidate);
}
