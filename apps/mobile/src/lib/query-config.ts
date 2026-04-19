/**
 * query-config.ts — Centralized TanStack Query defaults for the mobile app.
 *
 * Key decisions:
 * - staleTime 5 min: data remains "fresh" for 5 minutes, avoiding redundant
 *   network requests while navigating between screens.
 * - gcTime 30 min: cached data lingers in memory for 30 minutes, allowing
 *   offline reads even when the user navigates away from a screen.
 * - retry 1: retry once on failure to handle transient errors, but fail fast
 *   when genuinely offline so error states appear quickly.
 * - refetchOnWindowFocus false: Expo apps don't have a "window focus" concept
 *   in the browser sense; refetching on app foreground is handled separately
 *   via the network probe in useNetwork.
 */
import { type QueryClientConfig } from "@tanstack/react-query";

export const QUERY_STALE_TIME = 5 * 60 * 1000; // 5 minutes
export const QUERY_GC_TIME = 30 * 60 * 1000; // 30 minutes

export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
};
