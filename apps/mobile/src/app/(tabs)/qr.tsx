import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SkeletonBlock, ValueText } from "@/components/ui";
import { parseCheckInLookupEnvelope, parseCheckInResultEnvelope, parseStaffMemberDetailEnvelope, type AccessScanResult } from "@/lib/api";
import { localizeAccessReason, localizeAccessStatus, localizeSubscriptionStatus, localeTag } from "@/lib/mobile-format";
import { getCurrentRole, hasCapability, isCustomerRole } from "@/lib/mobile-role";
import { parseScannedKioskPayload, type ScannedKioskPayload } from "@/lib/mobile-scan";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function QrTab() {
  const { bootstrap } = useSession();
  if (!isCustomerRole(getCurrentRole(bootstrap))) {
    return <StaffQrTab />;
  }
  return <CustomerQrTab />;
}

function CustomerQrTab() {
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
  const scanDialogVisible = Boolean(scanResult || scanError);
  const scanDialogIsSuccess = scanResult?.status === "GRANTED" || scanResult?.status === "ALREADY_SCANNED";
  const scanDialogStatus = scanResult ? localizeAccessStatus(scanResult.status, isRTL) : copy.qr.scanResult;
  const scanDialogReason = scanResult?.reason || scanError || copy.common.errorTryAgain;

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

    const payload = parseScannedKioskPayload(result.data);
    setLastScanRaw(result.data);

    if (!payload) {
      setScanResult(null);
      setScanError(copy.qr.invalidCode);
      return;
    }
    if (payload.kind !== "client_entry") {
      setScanResult(null);
      setScanError(copy.qr.staffOnlyCode);
      return;
    }

    scanMutation.mutate(payload.kioskId);
  }

  function resetScanner() {
    setLastScanRaw(null);
    setScanResult(null);
    setScanError(null);
    scanMutation.reset();
  }

  return (
    <Screen title={copy.qr.title} subtitle={copy.qr.subtitle} showSubtitle>
      {!permission ? (
        <QueryState loading error={null} loadingVariant="detail" />
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

          <Modal visible={scanDialogVisible} transparent animationType="fade" onRequestClose={resetScanner}>
            <View style={styles.modalBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={resetScanner} />
              <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalBadge, { borderColor: scanDialogIsSuccess ? theme.primary : "#A53A22" }]}>
                    <Text
                      style={[
                        styles.modalBadgeText,
                        {
                          color: scanDialogIsSuccess ? theme.primary : "#A53A22",
                          fontFamily: fontSet.body,
                          textAlign: isRTL ? "right" : "left",
                          writingDirection: direction,
                        },
                      ]}
                    >
                      {scanDialogStatus}
                    </Text>
                  </View>
                  <SectionTitle>{copy.qr.scanResult}</SectionTitle>
                </View>

                <MutedText>{scanDialogReason}</MutedText>

                {scanResult ? (
                  <>
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
                        {localizeAccessStatus(scanResult.status, isRTL)}
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
                      <CodeValue value={scanResult.kiosk_id || "--"} />
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
                  </>
                ) : null}

                {lastScanRaw ? (
                  <View style={styles.metaGroup}>
                    <MutedText>{copy.qr.lastScan}</MutedText>
                    <CodeValue value={lastScanRaw} />
                  </View>
                ) : null}

                <PrimaryButton onPress={resetScanner}>{copy.qr.scanAgain}</PrimaryButton>
              </View>
            </View>
          </Modal>
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

function StaffQrTab() {
  const { authorizedRequest, bootstrap, selectedBranchId } = useSession();
  const queryClient = useQueryClient();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const role = getCurrentRole(bootstrap);
  const canCheckIn = hasCapability(bootstrap, "scan_member_qr") || hasCapability(bootstrap, "lookup_members");
  const [permission, requestPermission] = useCameraPermissions();
  const [kioskId, setKioskId] = useState("");
  const [search, setSearch] = useState("");
  const [shiftScan, setShiftScan] = useState<ScannedKioskPayload | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

  const lookupQuery = useQuery({
    queryKey: ["mobile-staff-checkin-lookup", search.trim()],
    enabled: search.trim().length >= 2,
    queryFn: async () => parseCheckInLookupEnvelope(await authorizedRequest(`/mobile/staff/check-in/lookup?q=${encodeURIComponent(search.trim())}`)).data,
  });

  const selectedMemberQuery = useQuery({
    queryKey: ["mobile-staff-member-detail", params.memberId, selectedBranchId],
    enabled: canCheckIn && typeof params.memberId === "string" && Boolean(params.memberId),
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return parseStaffMemberDetailEnvelope(await authorizedRequest(`/mobile/staff/members/${params.memberId}${suffix}`)).data;
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (memberId: string) =>
      parseCheckInResultEnvelope(
        await authorizedRequest("/mobile/staff/check-in/process", {
          method: "POST",
          body: JSON.stringify({
            member_id: memberId,
            kiosk_id: kioskId,
            branch_id: selectedBranchId ?? undefined,
          }),
        }),
      ).data,
  });

  const shiftMutation = useMutation({
    mutationFn: async (payload: ScannedKioskPayload) => {
      if (payload.kind === "client_entry") {
        throw new Error(copy.qr.invalidCode);
      }
      const response = await authorizedRequest<Record<string, never>>(payload.kind === "staff_check_in" ? "/access/check-in" : "/access/check-out", {
        method: "POST",
      });
      return {
        kind: payload.kind,
        message: response.message || (payload.kind === "staff_check_in" ? copy.qr.staffStart : copy.qr.staffEnd),
      };
    },
    onSuccess: () => {
      setShiftError(null);
      void queryClient.invalidateQueries({ queryKey: ["mobile-staff-home"] });
    },
    onError: (error) => {
      setShiftError(error instanceof Error ? error.message : copy.common.errorTryAgain);
    },
  });
  const shiftDialogVisible = Boolean(shiftMutation.data || shiftError);
  const shiftDialogIsSuccess = shiftMutation.data?.kind === "staff_check_in" || shiftMutation.data?.kind === "staff_check_out";
  const shiftDialogIsContractEnded = shiftError === "CONTRACT_EXPIRED" || shiftError === "NO_ACTIVE_CONTRACT";
  const shiftDialogTitle = shiftDialogIsContractEnded
    ? copy.qr.contractEnded
    : shiftMutation.data?.kind === "staff_check_in"
      ? copy.qr.shiftStarted
      : shiftMutation.data?.kind === "staff_check_out"
        ? copy.qr.shiftEnded
        : copy.qr.staffShiftResult;
  const shiftDialogReason = shiftDialogIsContractEnded
    ? copy.qr.contractEndedHint
    : shiftMutation.data?.message || shiftError || copy.qr.noReason;

  function handleStaffScan(result: BarcodeScanningResult) {
    if (shiftMutation.isPending || shiftScan) {
      return;
    }

    const parsed = parseScannedKioskPayload(result.data);
    if (!parsed) {
      setShiftError(copy.qr.invalidCode);
      return;
    }

    if (parsed.kind === "client_entry") {
      if (!canCheckIn) {
        setShiftError(copy.qr.invalidCode);
        return;
      }
      setKioskId(parsed.kioskId);
      setShiftError(null);
      return;
    }

    setShiftScan(parsed);
    setShiftError(null);
  }

  function resetShiftScanner() {
    setShiftScan(null);
    setShiftError(null);
    shiftMutation.reset();
  }

  return (
    <Screen title={role === "COACH" ? copy.qr.staffShiftTitle : copy.staffTabs.checkIn} subtitle={copy.qr.staffScreenSubtitle} showSubtitle>
      <QueryState loading={selectedMemberQuery.isLoading} loadingVariant="detail" error={selectedMemberQuery.error instanceof Error ? selectedMemberQuery.error.message : null} />
      <Card style={[styles.cameraShell, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <SectionTitle>{copy.qr.staffShiftTitle}</SectionTitle>
        <MutedText>{copy.qr.staffShiftHint}</MutedText>
        {!permission ? (
          <QueryState loading error={null} loadingVariant="detail" />
        ) : permission.granted ? (
          <View style={[styles.cameraWrap, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <CameraView
              facing="back"
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={shiftScan || shiftMutation.isPending ? undefined : handleStaffScan}
            />
            <View style={styles.overlay}>
              <View style={[styles.scanFrame, { borderColor: theme.primary }]} />
            </View>
          </View>
        ) : (
          <PrimaryButton onPress={() => void requestPermission()}>{copy.qr.grantCamera}</PrimaryButton>
        )}
        {shiftScan ? (
          <>
            <SectionTitle>{copy.qr.staffShiftDetected}</SectionTitle>
            <ValueText>{shiftScan.kind === "staff_check_in" ? copy.qr.staffStart : copy.qr.staffEnd}</ValueText>
            <View style={styles.metaGroup}>
              <MutedText>{copy.qr.scanKiosk}</MutedText>
              <CodeValue value={shiftScan.kioskId} />
            </View>
            <PrimaryButton onPress={() => shiftMutation.mutate(shiftScan)} disabled={shiftMutation.isPending}>
              {shiftMutation.isPending ? copy.qr.scanning : shiftScan.kind === "staff_check_in" ? copy.qr.staffStart : copy.qr.staffEnd}
            </PrimaryButton>
          </>
        ) : null}
      </Card>

      <Modal visible={shiftDialogVisible} transparent animationType="fade" onRequestClose={resetShiftScanner}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={resetShiftScanner} />
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalBadge, { borderColor: shiftDialogIsSuccess ? theme.primary : "#A53A22" }]}>
                <Text
                  style={[
                    styles.modalBadgeText,
                    {
                      color: shiftDialogIsSuccess ? theme.primary : "#A53A22",
                      fontFamily: fontSet.body,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: direction,
                    },
                  ]}
                >
                  {shiftDialogTitle}
                </Text>
              </View>
              <SectionTitle>{copy.qr.staffShiftResult}</SectionTitle>
            </View>

            <MutedText>{shiftDialogReason}</MutedText>

            {shiftMutation.data ? (
              <>
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
                    {shiftMutation.data.kind === "staff_check_in" ? copy.qr.shiftStarted : copy.qr.shiftEnded}
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
                    {shiftMutation.data.message || copy.qr.noReason}
                  </Text>
                </View>
              </>
            ) : null}

            <PrimaryButton onPress={resetShiftScanner}>{copy.qr.scanAgain}</PrimaryButton>
          </View>
        </View>
      </Modal>

      {canCheckIn ? (
        <>
          <Card>
            <SectionTitle>{copy.qr.staffMemberCheckInTitle}</SectionTitle>
            {kioskId ? (
              <>
                <MutedText>{copy.qr.staffMemberKioskReady}</MutedText>
                <CodeValue value={kioskId} />
              </>
            ) : (
              <MutedText>{copy.qr.staffMemberKioskMissing}</MutedText>
            )}
            <Input value={kioskId} onChangeText={setKioskId} placeholder={copy.qr.manualKiosk} />
            <MutedText>{copy.qr.staffMemberCheckInHint}</MutedText>
            <Input value={search} onChangeText={setSearch} placeholder={copy.membersScreen.search} />
            <MutedText>{copy.qr.staffMemberSearchHint}</MutedText>
          </Card>

          {selectedMemberQuery.data ? (
            <Card>
              <SectionTitle>{copy.qr.staffSelectedMember}</SectionTitle>
              <ValueText>{selectedMemberQuery.data.member.full_name || selectedMemberQuery.data.member.email}</ValueText>
              <MutedText>{selectedMemberQuery.data.subscription.plan_name || localizeSubscriptionStatus(selectedMemberQuery.data.subscription.status, isRTL)}</MutedText>
              <PrimaryButton
                onPress={() => {
                  if (typeof params.memberId === "string") {
                    checkInMutation.mutate(params.memberId);
                  }
                }}
                disabled={checkInMutation.isPending || !kioskId}
              >
                {copy.staffTabs.checkIn}
              </PrimaryButton>
            </Card>
          ) : null}

          {lookupQuery.isLoading ? (
            <Card>
              <SkeletonBlock height={16} width="44%" />
              <SkeletonBlock height={14} width="88%" style={{ marginTop: 10 }} />
              <SkeletonBlock height={14} width="70%" style={{ marginTop: 8 }} />
            </Card>
          ) : null}

          {lookupQuery.error instanceof Error ? (
            <Card>
              <MutedText>{lookupQuery.error.message}</MutedText>
            </Card>
          ) : null}

          {search.trim().length >= 2 && !lookupQuery.isLoading && !lookupQuery.error && lookupQuery.data?.items.length === 0 ? (
            <Card>
              <MutedText>{copy.membersScreen.noMembers}</MutedText>
            </Card>
          ) : null}

          {lookupQuery.data?.items.map((member) => (
            <Card key={member.id}>
              <SectionTitle>{member.full_name || member.email}</SectionTitle>
              <MutedText>{member.subscription.plan_name || localizeSubscriptionStatus(member.subscription.status, isRTL)}</MutedText>
              <PrimaryButton
                onPress={() => {
                  checkInMutation.mutate(member.id);
                }}
                disabled={checkInMutation.isPending || !kioskId}
              >
                {copy.staffTabs.checkIn}
              </PrimaryButton>
            </Card>
          ))}

          {checkInMutation.data ? (
            <Card>
              <SectionTitle>{checkInMutation.data.member_name || copy.common.noData}</SectionTitle>
              <MutedText>{checkInMutation.data.status ? localizeAccessStatus(checkInMutation.data.status, isRTL) : "--"}</MutedText>
              <MutedText>{checkInMutation.data.reason || "--"}</MutedText>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function CodeValue({ value }: { value: string }) {
  const { fontSet, isRTL, theme } = usePreferences();

  return (
    <Text
      style={[
        styles.scanValue,
        {
          color: theme.foreground,
          fontFamily: fontSet.mono,
          textAlign: isRTL ? "right" : "left",
          writingDirection: "ltr",
        },
      ]}
    >
      {value}
    </Text>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    gap: 10,
  },
  modalBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  modalBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
