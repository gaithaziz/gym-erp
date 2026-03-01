import { createContext, useContext } from "react";

import type { SessionContextValue } from "@/src/core/auth/session-types";

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
