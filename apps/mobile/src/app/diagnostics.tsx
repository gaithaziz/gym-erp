import Constants from "expo-constants";
import * as Device from "expo-device";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, PrimaryButton, Screen, SectionTitle, SecondaryButton } from "@/components/ui";
import { API_BASE_URL } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type HealthState = {
  ok: boolean;
  statusCode: number | null;
  response: string;
  durationMs: number | null;
};

function formatMaybe(value: unknown) {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DiagnosticsScreen() {
  const { direction, fontSet, isRTL, theme } = usePreferences();
  const { bootstrap, error, selectedBranchId, status } = useSession();
  const [health, setHealth] = useState<HealthState>({ ok: false, statusCode: null, response: "Not checked yet", durationMs: null });
  const [checking, setChecking] = useState(false);

  const resolvedHostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? null;
  const resolvedDevClient = Constants.executionEnvironment ?? null;
  const isPhysicalDevice = Device.isDevice;
  const apiOrigin = useMemo(() => API_BASE_URL.replace(/\/api\/v1\/?$/, ""), []);

  async function runHealthCheck() {
    setChecking(true);
    const started = Date.now();
    try {
      const response = await fetch(`${apiOrigin}/health`, {
        headers: { Accept: "application/json" },
      });
      const elapsed = Date.now() - started;
      const text = await response.text();
      setHealth({
        ok: response.ok,
        statusCode: response.status,
        response: text || "(empty response)",
        durationMs: elapsed,
      });
    } catch (caught) {
      const elapsed = Date.now() - started;
      setHealth({
        ok: false,
        statusCode: null,
        response: caught instanceof Error ? caught.message : "Network request failed",
        durationMs: elapsed,
      });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void runHealthCheck();
  }, []);

  return (
    <Screen title="Diagnostics" subtitle="Backend connection, session state, and mobile runtime details." scrollable>
      <Card>
        <SectionTitle>Network</SectionTitle>
        <View style={styles.row}>
          <MutedText>API base URL</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{API_BASE_URL}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>API origin</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{apiOrigin}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Physical device</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{isPhysicalDevice ? "Yes" : "No"}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Platform</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{Platform.OS}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Execution env</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{formatMaybe(resolvedDevClient)}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Expo host</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{formatMaybe(resolvedHostUri)}</Text>
        </View>
      </Card>

      <Card>
        <SectionTitle>Health Check</SectionTitle>
        <View style={styles.row}>
          <MutedText>Reachable</MutedText>
          <Text style={[styles.value, { color: health.ok ? "#15803D" : "#B91C1C", fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{health.statusCode ? `Yes (${health.statusCode})` : "No"}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Latency</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{health.durationMs !== null ? `${health.durationMs} ms` : "n/a"}</Text>
        </View>
        <View style={styles.responseBox}>
          <Text style={[styles.responseText, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{health.response}</Text>
        </View>
        <SecondaryButton onPress={() => void runHealthCheck()} disabled={checking}>
          {checking ? "Checking..." : "Recheck backend"}
        </SecondaryButton>
      </Card>

      <Card>
        <SectionTitle>Session</SectionTitle>
        <View style={styles.row}>
          <MutedText>Status</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{status}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Selected branch</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{selectedBranchId || "n/a"}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>User</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{bootstrap?.user.email || "n/a"}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Role</MutedText>
          <Text style={[styles.value, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{bootstrap?.role || "n/a"}</Text>
        </View>
        <View style={styles.row}>
          <MutedText>Session error</MutedText>
          <Text style={[styles.value, { color: "#B91C1C", fontFamily: fontSet.body, textAlign: isRTL ? "left" : "right", writingDirection: direction }]}>{error || "none"}</Text>
        </View>
      </Card>

      <Card>
        <SectionTitle>Quick note</SectionTitle>
        <MutedText>
          If you are testing on a physical device and the API base URL is localhost or 10.0.2.2, set EXPO_PUBLIC_API_BASE_URL to your computer's LAN IP before launching the app.
        </MutedText>
      </Card>

      <PrimaryButton onPress={() => void runHealthCheck()} disabled={checking}>
        {checking ? "Checking..." : "Refresh diagnostics"}
      </PrimaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
    marginBottom: 12,
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
  },
  responseBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "rgba(148, 163, 184, 0.08)",
  },
  responseText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
