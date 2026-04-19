/**
 * useNetwork — lightweight connectivity hook.
 *
 * Uses a periodic fetch-probe to detect online/offline state without
 * requiring @react-native-community/netinfo (which needs a native rebuild).
 * Falls back conservatively: assumes online until a probe fails, then
 * re-probes every 5 seconds until connectivity is restored.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

const PROBE_URL = "https://www.gstatic.com/generate_204";
const PROBE_TIMEOUT_MS = 4000;
const POLL_INTERVAL_OFFLINE_MS = 5000;
const POLL_INTERVAL_ONLINE_MS = 30000;

async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(PROBE_URL, {
      method: "HEAD",
      cache: "no-cache",
      signal: controller.signal,
    });
    clearTimeout(id);
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export type NetworkState = {
  isOnline: boolean;
  isChecking: boolean;
};

export function useNetwork(): NetworkState {
  // Optimistically assume online on first render so existing cached queries
  // don't show an offline banner before we've had a chance to probe.
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const probe = useCallback(async () => {
    setIsChecking(true);
    const result = await checkConnectivity();
    setIsChecking(false);
    setIsOnline(result);
    return result;
  }, []);

  const scheduleNextProbe = useCallback(
    (currentlyOnline: boolean) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        async () => {
          const next = await probe();
          scheduleNextProbe(next);
        },
        currentlyOnline ? POLL_INTERVAL_ONLINE_MS : POLL_INTERVAL_OFFLINE_MS,
      );
    },
    [probe],
  );

  useEffect(() => {
    let alive = true;

    async function start() {
      const result = await probe();
      if (alive) scheduleNextProbe(result);
    }

    void start();

    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      // Re-probe immediately when app comes to foreground
      if (prev.match(/inactive|background/) && next === "active") {
        void probe().then((result) => {
          if (alive) scheduleNextProbe(result);
        });
      }
    });

    return () => {
      alive = false;
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [probe, scheduleNextProbe]);

  return { isOnline, isChecking };
}
