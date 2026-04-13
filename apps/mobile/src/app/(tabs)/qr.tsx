import { useMutation } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle, ValueText } from "@/components/ui";
import { type AccessScanResult } from "@/lib/api";
import { localizeAccessReason, localizeAccessStatus, localizeSubscriptionStatus, localeTag } from "@/lib/mobile-format";
import { parseScannedKioskId } from "@/lib/mobile-scan";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function QrTab() {
  const { authorizedRequest, bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScanRaw, setLastScanRaw] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<AccessScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const locale = localeTag(isRTL);

  const localizedStatus = useMemo(
    () => localizeSubscriptionStatus(bootstrap?.subscription?.status, isRTL),
    [bootstrap?.subscription?.status, isRTL],
  );

  const scanMutation = useMutation({
    mutationFn: async (kioskId: string) =>
      authorizedRequest<AccessScanResult>("/access/scan-session", {
        method: "POST",
        body: JSON.stringify({ kiosk_id: kioskId }),
      }),
    onSuccess: (payload) => {
      setScanError(null);
      setScanResult(payload.data);
    },
    onError: (error) => {
      setScanResult(null);
      setScanError(error instanceof Error ? error.message : copy.common.errorTryAgain);
    },
  });

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scanMutation.isPending || scanResult || scanError) {
      return;
    }

    const kioskId = parseScannedKioskId(result.data);
    setLastScanRaw(result.data);

    if (!kioskId) {
      setScanResult(null);
      setScanError(copy.qr.invalidCode);
      return;
    }

    scanMutation.mutate(kioskId);
  }

  function resetScanner() {
    setLastScanRaw(null);
    setScanResult(null);
    setScanError(null);
  }

  return (
    <Screen title={copy.qr.title} subtitle={copy.qr.subtitle}>
      {!permission ? (
        <QueryState loading error={null} />
      ) : permission.granted ? (
        <>
          <Card>
            <SectionTitle>{copy.qr.entranceStatus}</SectionTitle>
            <ValueText>{localizedStatus}</ValueText>
            <MutedText>{bootstrap?.subscription?.plan_name || copy.common.noCurrentPlan}</MutedText>
          </Card>

          <Card style={[styles.cameraShell, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <View style={[styles.cameraWrap, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <CameraView
                facing="back"
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={scanResult || scanError || scanMutation.isPending ? undefined : handleBarcodeScanned}
              />
              <View style={styles.overlay}>
                <View style={[styles.scanFrame, { borderColor: theme.primary }]} />
              </View>
            </View>
            <Text
              style={[
                styles.cameraLabel,
                {
                  color: theme.foreground,
                  fontFamily: fontSet.body,
                  textAlign: isRTL ? "right" : "left",
                  writingDirection: direction,
                },
              ]}
            >
              {copy.qr.cameraReady}
            </Text>
            <MutedText>{copy.qr.cameraHint}</MutedText>
            <MutedText>{copy.qr.noPersonalCode}</MutedText>
            <MutedText>{copy.qr.scannerFrame}</MutedText>
            {scanMutation.isPending ? <MutedText>{copy.qr.scanning}</MutedText> : null}
          </Card>

          {scanResult ? (
            <Card>
              <SectionTitle>{copy.qr.scanResult}</SectionTitle>
              <ValueText>{localizeAccessStatus(scanResult.status, isRTL)}</ValueText>
              <View style={styles.metaGroup}>
                <MutedText>{copy.qr.scanStatus}</MutedText>
                <Text
                  style={[
                    styles.scanValue,
                    {
                      color: theme.foreground,
                      fontFamily: fontSet.mono,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                    },
                  ]}
                >
                  {scanResult.status}
                </Text>
              </View>
              <View style={styles.metaGroup}>
                <MutedText>{copy.qr.scanReason}</MutedText>
                <Text
                  style={[
                    styles.scanValue,
                    {
                      color: theme.foreground,
                      fontFamily: fontSet.body,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                    },
                  ]}
                >
                  {localizeAccessReason(scanResult.reason, isRTL)}
                </Text>
              </View>
              <View style={styles.metaGroup}>
                <MutedText>{copy.qr.scanKiosk}</MutedText>
                <Text
                  style={[
                    styles.scanValue,
                    {
                      color: theme.foreground,
                      fontFamily: fontSet.mono,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                    },
                  ]}
                >
                  {scanResult.kiosk_id || "--"}
                </Text>
              </View>
              <View style={styles.metaGroup}>
                <MutedText>{copy.qr.scanTime}</MutedText>
                <Text
                  style={[
                    styles.scanValue,
                    {
                      color: theme.foreground,
                      fontFamily: fontSet.body,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                    },
                  ]}
                >
                  {scanResult.scan_time ? new Date(scanResult.scan_time).toLocaleString(locale) : "--"}
                </Text>
              </View>
              {lastScanRaw ? (
                <View style={styles.metaGroup}>
                  <MutedText>{copy.qr.lastScan}</MutedText>
                  <Text
                    style={[
                      styles.scanValue,
                      {
                        color: theme.foreground,
                        fontFamily: fontSet.mono,
                        textAlign: isRTL ? "right" : "left",
                        writingDirection: direction,
                      },
                    ]}
                  >
                    {lastScanRaw}
                  </Text>
                </View>
              ) : null}
              <Pressable onPress={resetScanner} style={[styles.scanAgainButton, { backgroundColor: theme.primary }]}>
                <Text style={[styles.scanAgainText, { fontFamily: fontSet.body }]}>{copy.qr.scanAgain}</Text>
              </Pressable>
            </Card>
          ) : null}

          {scanError ? (
            <Card>
              <SectionTitle>{copy.qr.scanResult}</SectionTitle>
              <Text
                style={[
                  styles.scanValue,
                  {
                    color: "#A53A22",
                    fontFamily: fontSet.body,
                    textAlign: isRTL ? "right" : "left",
                    writingDirection: direction,
                  },
                ]}
              >
                {scanError}
              </Text>
              {lastScanRaw ? (
                <View style={styles.metaGroup}>
                  <MutedText>{copy.qr.lastScan}</MutedText>
                  <Text
                    style={[
                      styles.scanValue,
                      {
                        color: theme.foreground,
                        fontFamily: fontSet.mono,
                        textAlign: isRTL ? "right" : "left",
                        writingDirection: direction,
                      },
                    ]}
                  >
                    {lastScanRaw}
                  </Text>
                </View>
              ) : null}
              <Pressable onPress={resetScanner} style={[styles.scanAgainButton, { backgroundColor: theme.primary }]}>
                <Text style={[styles.scanAgainText, { fontFamily: fontSet.body }]}>{copy.qr.scanAgain}</Text>
              </Pressable>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <SectionTitle>{copy.qr.title}</SectionTitle>
          <MutedText>{copy.qr.cameraDenied}</MutedText>
          <Pressable onPress={() => void requestPermission()} style={[styles.permissionButton, { backgroundColor: theme.primary }]}>
            <Text style={[styles.permissionText, { fontFamily: fontSet.body }]}>{copy.qr.grantCamera}</Text>
          </Pressable>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraShell: {
    gap: 12,
  },
  cameraWrap: {
    height: 320,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderRadius: 24,
    borderWidth: 3,
    backgroundColor: "transparent",
  },
  cameraLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  scanValue: {
    fontSize: 13,
    lineHeight: 20,
  },
  metaGroup: {
    gap: 4,
  },
  scanAgainButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  scanAgainText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  permissionButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  permissionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
