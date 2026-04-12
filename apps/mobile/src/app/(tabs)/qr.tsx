import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SectionTitle, ValueText } from "@/components/ui";
import { localizeSubscriptionStatus } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function QrTab() {
  const { bootstrap } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScan, setLastScan] = useState<BarcodeScanningResult | null>(null);

  const localizedStatus = useMemo(
    () => localizeSubscriptionStatus(bootstrap?.subscription?.status, isRTL),
    [bootstrap?.subscription?.status, isRTL],
  );

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    setLastScan(result);
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
                onBarcodeScanned={lastScan ? undefined : handleBarcodeScanned}
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
          </Card>

          {lastScan ? (
            <Card>
              <SectionTitle>{copy.qr.lastScan}</SectionTitle>
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
                {lastScan.data}
              </Text>
              <Pressable onPress={() => setLastScan(null)} style={[styles.scanAgainButton, { backgroundColor: theme.primary }]}>
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
