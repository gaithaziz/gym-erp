import { router, usePathname, useSegments } from "expo-router";
import { useEffect } from "react";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { isBlockedCustomer } from "@/src/core/auth/auth-store";
import { getHomeRoute } from "@/src/core/navigation/home-route";
import { LoadingState } from "@/src/core/ui/loading-state";

export function AuthGate() {
  const pathname = usePathname();
  const segments = useSegments();
  const { isLocaleReady } = useLocale();
  const session = useSession();
  const inPublicGroup = segments[0] === "(public)";

  useEffect(() => {
    if (!isLocaleReady || session.status === "bootstrapping") return;

    if (session.status === "anonymous" && !inPublicGroup && pathname !== "/login") {
      router.replace("/login");
      return;
    }

    if (session.status === "authenticated") {
      if (!session.user) {
        router.replace("/login");
        return;
      }

      if (isBlockedCustomer(session.user) && pathname !== "/subscription") {
        router.replace("/subscription");
        return;
      }

      if (inPublicGroup) {
        const homeRoute = getHomeRoute(session.user);
        if (pathname !== homeRoute) {
          router.replace(homeRoute);
        }
      }
    }
  }, [inPublicGroup, isLocaleReady, pathname, session]);

  if (!isLocaleReady || session.status === "bootstrapping") {
    return <LoadingState fullScreen />;
  }

  return null;
}
