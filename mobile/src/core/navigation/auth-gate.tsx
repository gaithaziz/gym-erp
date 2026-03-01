import { router, useSegments } from "expo-router";
import { useEffect } from "react";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { isBlockedCustomer } from "@/src/core/auth/auth-store";
import { LoadingState } from "@/src/core/ui/loading-state";

export function AuthGate() {
  const segments = useSegments();
  const { isLocaleReady } = useLocale();
  const session = useSession();

  useEffect(() => {
    if (!isLocaleReady || session.status === "bootstrapping") return;

    const inPublicGroup = segments[0] === "(public)";

    if (session.status === "anonymous" && !inPublicGroup) {
      router.replace("/login");
      return;
    }

    if (session.status === "authenticated") {
      if (isBlockedCustomer(session.user)) {
        router.replace("/subscription");
        return;
      }

      if (inPublicGroup) {
        router.replace("/");
      }
    }
  }, [isLocaleReady, segments, session]);

  if (!isLocaleReady || session.status === "bootstrapping") {
    return <LoadingState fullScreen />;
  }

  return null;
}
