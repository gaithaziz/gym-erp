import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AxiosError } from "axios";

import { parseStandardResponse, parseTokenPair, type AuthUser } from "@gym-erp/contracts";

import { SessionContext } from "@/src/core/auth/use-session";
import { clearPersistedTokens, configureApiAuth, fetchCurrentUser } from "@/src/core/api/client";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/src/core/auth/auth-store";
import type { LoginInput, SessionContextValue, SessionState } from "@/src/core/auth/session-types";
import { api, persistTokenPair } from "@/src/core/api/client";
import { getHomeRoute } from "@/src/core/navigation/home-route";
import { secureStorageDriver } from "@/src/core/storage/secure-storage";

const initialState: SessionState = {
  status: "bootstrapping",
  accessToken: null,
  refreshToken: null,
  user: null,
};

async function readStoredState(): Promise<Pick<SessionState, "accessToken" | "refreshToken">> {
  const [accessToken, refreshToken] = await Promise.all([
    secureStorageDriver.getItem(ACCESS_TOKEN_KEY),
    secureStorageDriver.getItem(REFRESH_TOKEN_KEY),
  ]);

  return { accessToken, refreshToken };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>(initialState);

  const finalizeAuthenticatedState = async (user: AuthUser) => {
    const stored = await readStoredState();
    setState({
      status: "authenticated",
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      user,
    });
  };

  const markAnonymous = async () => {
    await clearPersistedTokens();
    setState({
      status: "anonymous",
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  };

  const refreshProfile = async () => {
    const user = await fetchCurrentUser();
    await finalizeAuthenticatedState(user);
  };

  const bootstrap = async () => {
    const stored = await readStoredState();
    if (!stored.accessToken && !stored.refreshToken) {
      setState({
        status: "anonymous",
        accessToken: null,
        refreshToken: null,
        user: null,
      });
      return;
    }

    try {
      await refreshProfile();
    } catch {
      await markAnonymous();
    }
  };

  useEffect(() => {
    configureApiAuth({
      onSessionInvalid: async () => {
        queryClient.clear();
        await markAnonymous();
      },
      onSubscriptionBlocked: () => {
        router.replace("/subscription");
      },
    });

    void bootstrap();
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(() => ({
    ...state,
    login: async ({ email, password }: LoginInput) => {
      const response = await api.post("/auth/login", { email, password });
      const envelope = parseStandardResponse<unknown>(response.data);
      const tokens = parseTokenPair(envelope.data);

      await persistTokenPair(tokens);
      const user = await fetchCurrentUser();
      await finalizeAuthenticatedState(user);

      router.replace(getHomeRoute(user));
    },
    logout: async () => {
      queryClient.clear();
      await markAnonymous();
      router.replace("/login");
    },
    refreshProfile: async () => {
      try {
        await refreshProfile();
      } catch (error) {
        if (error instanceof AxiosError) {
          await markAnonymous();
          router.replace("/login");
          return;
        }
        throw error;
      }
    },
  }), [queryClient, state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
