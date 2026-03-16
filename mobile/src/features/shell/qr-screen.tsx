import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";

import { parseStandardResponse } from "@gym-erp/contracts";

import { api } from "@/src/core/api/client";
import { getApiErrorMessage } from "@/src/core/api/error-message";
import { useSession } from "@/src/core/auth/use-session";
import { isValidQrKioskId, parseQrScannerPayload, type ParsedQrPayload } from "@/src/core/device/qr-scanner";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { getRowDirection, getTextAlign } from "@/src/core/i18n/rtl";
import { resolveFontFamily } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { ResponsiveContent } from "@/src/core/ui/responsive-content";
import { SectionCard } from "@/src/core/ui/section-card";
import { shareDownloadableResource } from "@/src/modules/downloads/resource-actions";

type ScanKind = "client_entry" | "staff_check_in" | "staff_check_out";
type ScanResult = {
  status: string;
  user_name?: string;
  reason?: string | null;
};
type AccessScanResult = {
  status: string;
  user_name?: string;
  reason?: string | null;
};

const STAFF_ROLES = new Set(["ADMIN", "COACH", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"]);

const SCAN_KIND_ORDER: ScanKind[] = ["client_entry", "staff_check_in", "staff_check_out"];

function cycleKind(current: ScanKind): ScanKind {
  const index = SCAN_KIND_ORDER.indexOf(current);
  return SCAN_KIND_ORDER[(index + 1) % SCAN_KIND_ORDER.length] ?? SCAN_KIND_ORDER[0];
}

function buildQrSharePayload(kind: ScanKind, kioskId: string) {
  return JSON.stringify({
    type: kind,
    kiosk_id: kioskId,
  });
}

export function QrScreen() {
  const { direction, locale } = useLocale();
  const { isDark } = useTheme();
  const { user } = useSession();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [detectedKioskId, setDetectedKioskId] = useState("");
  const [detectedMode, setDetectedMode] = useState<ScanKind>("client_entry");
  const [manualKioskId, setManualKioskId] = useState("");
  const [manualMode, setManualMode] = useState<ScanKind>("client_entry");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [shareMessage, setShareMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const txt = locale === "ar"
    ? {
        subtitle: "امسح رمز QR وأكّد الإجراء. دخول العميل يمنح الوصول، ورموز الموظفين تسجل الحضور/الانصراف.",
        cameraReady: "الكاميرا جاهزة",
        cameraNotReady: "الكاميرا غير جاهزة",
        restartCamera: "إعادة تشغيل الكاميرا",
        detectedQr: "رمز QR المكتشف",
        scanAutofill: "امسح لملء معرف الكشك تلقائيًا",
        processing: "جارٍ المعالجة...",
        confirmDetected: "تأكيد الإجراء المكتشف",
        supportedPayloads: "المدخلات المدعومة: kiosk_id خام، gymerp://kiosk/{id}، أو JSON typed.",
        manualFallback: "إدخال يدوي بديل",
        enterKioskManually: "أدخل معرف الكشك يدويًا",
        submitManual: "إرسال الإجراء اليدوي",
        shareDetected: "مشاركة الرمز المكتشف",
        shareManual: "مشاركة الرمز اليدوي",
        actionRecorded: "تم تسجيل الإجراء.",
        shareReady: "تم فتح مشاركة رمز QR.",
        clientEntry: "client_entry",
        staffIn: "staff_check_in",
        staffOut: "staff_check_out",
        cameraAccessError: "تعذر الوصول إلى الكاميرا. تحقق من أذونات المتصفح/النظام.",
        invalidQr: "تنسيق رمز الكشك غير صالح.",
        staffOnlyQr: "هذا الرمز مخصص لتسجيل حضور الموظفين فقط.",
        staffModeHint: "استخدم رمز بدء/إنهاء الدوام للحضور.",
        roleDenied: "دورك غير مسموح له بتسجيل حضور الموظفين.",
        checkInSuccess: "تم تسجيل الحضور بنجاح.",
        checkOutSuccess: "تم تسجيل الانصراف بنجاح.",
        actionFailed: "فشل تنفيذ الإجراء.",
        shareFailed: "فشلت مشاركة رمز QR.",
        granted: "مسموح",
        denied: "مرفوض",
        alreadyScanned: "مسجل مسبقًا",
      }
    : {
        subtitle: "Scan a QR and confirm the action. Client entry grants access, staff QR codes clock in/out.",
        cameraReady: "Camera ready",
        cameraNotReady: "Camera not ready",
        restartCamera: "Restart Camera",
        detectedQr: "Detected QR",
        scanAutofill: "Scan to auto-fill kiosk ID",
        processing: "Processing...",
        confirmDetected: "Confirm Detected Action",
        supportedPayloads: "Supported payloads: raw kiosk_id, gymerp://kiosk/{id}, or typed JSON.",
        manualFallback: "Manual Fallback",
        enterKioskManually: "Enter kiosk ID manually",
        submitManual: "Submit Manual Action",
        shareDetected: "Share Detected QR",
        shareManual: "Share Manual QR",
        actionRecorded: "Action recorded.",
        shareReady: "QR share sheet opened.",
        clientEntry: "client_entry",
        staffIn: "staff_check_in",
        staffOut: "staff_check_out",
        cameraAccessError: "Unable to access camera. Check browser/system permissions.",
        invalidQr: "Invalid kiosk QR format.",
        staffOnlyQr: "This QR is for staff attendance only.",
        staffModeHint: "Use staff start/end QR for attendance.",
        roleDenied: "Your role is not allowed to record staff attendance.",
        checkInSuccess: "Clocked in successfully.",
        checkOutSuccess: "Clocked out successfully.",
        actionFailed: "Action failed.",
        shareFailed: "Failed to share QR payload.",
        granted: "Granted",
        denied: "Denied",
        alreadyScanned: "Already scanned",
      };

  useEffect(() => {
    if (user?.role === "CUSTOMER") {
      setManualMode("client_entry");
      setDetectedMode("client_entry");
    } else {
      setManualMode("staff_check_in");
      setDetectedMode("staff_check_in");
    }
  }, [user?.role]);

  useEffect(() => {
    void (async () => {
      if (!cameraPermission) return;
      if (cameraPermission.granted) return;
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setCameraError(txt.cameraAccessError);
      }
    })();
  }, [cameraPermission, requestCameraPermission, txt.cameraAccessError]);

  const scanMutation = useMutation({
    mutationFn: async (payload: ParsedQrPayload) => {
      if (!isValidQrKioskId(payload.kioskId)) {
        throw new Error(txt.invalidQr);
      }

      const role = user?.role ?? "";
      if (role === "CUSTOMER" && payload.kind !== "client_entry") {
        throw new Error(txt.staffOnlyQr);
      }
      if (role !== "CUSTOMER" && payload.kind === "client_entry") {
        throw new Error(txt.staffModeHint);
      }
      if (payload.kind !== "client_entry" && !STAFF_ROLES.has(role)) {
        throw new Error(txt.roleDenied);
      }

      if (payload.kind === "client_entry") {
        const response = await api.post("/access/scan-session", { kiosk_id: payload.kioskId });
        const envelope = parseStandardResponse<AccessScanResult>(response.data);
        if (envelope.data) {
          return envelope.data;
        }
        return { status: "GRANTED", reason: txt.actionRecorded } satisfies ScanResult;
      }

      if (payload.kind === "staff_check_in") {
        const response = await api.post("/access/check-in");
        return {
          status: "GRANTED",
          reason: (response.data?.message as string | undefined) ?? txt.checkInSuccess,
        } satisfies ScanResult;
      }

      const response = await api.post("/access/check-out");
      return {
        status: "GRANTED",
        reason: (response.data?.message as string | undefined) ?? txt.checkOutSuccess,
      } satisfies ScanResult;
    },
    onSuccess: (result) => {
      setScanResult(result);
    },
    onError: (error) => {
      const errorMessage = error instanceof Error
        ? error.message
        : getApiErrorMessage(error, txt.actionFailed);
      setScanResult({ status: "DENIED", reason: errorMessage });
    },
  });

  function getKindLabel(kind: ScanKind) {
    if (kind === "client_entry") return txt.clientEntry;
    if (kind === "staff_check_in") return txt.staffIn;
    return txt.staffOut;
  }

  async function restartCamera() {
    setCameraReady(false);
    setCameraError("");
    setDetectedKioskId("");
    setDetectedMode(user?.role === "CUSTOMER" ? "client_entry" : "staff_check_in");
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setCameraError(txt.cameraAccessError);
      }
    }
    setCameraKey((value) => value + 1);
  }

  async function submitAction(payload: ParsedQrPayload) {
    setScanResult(null);
    await scanMutation.mutateAsync(payload);
  }

  async function shareQrPayload(payload: ParsedQrPayload) {
    setShareMessage(null);
    try {
      await shareDownloadableResource(buildQrSharePayload(payload.kind, payload.kioskId));
      setShareMessage({ type: "success", text: txt.shareReady });
    } catch (error) {
      setShareMessage({
        type: "error",
        text: error instanceof Error ? error.message : txt.shareFailed,
      });
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scanMutation.isPending || detectedKioskId) {
      return;
    }

    const parsed = parseQrScannerPayload(result.data);
    if (!parsed) {
      return;
    }

    setDetectedKioskId(parsed.kioskId);
    setDetectedMode(parsed.kind);
    setScanResult(null);
  }

  const currentKind: ScanKind = detectedKioskId ? detectedMode : manualMode;
  const currentHeading = getKindLabel(currentKind);
  const fieldClassName = isDark
    ? "rounded-sm border border-[#223047] bg-[#1e2329] px-3 py-2.5 text-[#e6e2dd]"
    : "rounded-sm border border-border bg-background px-3 py-2.5 text-foreground";
  const placeholderColor = isDark ? "#cbd5e1" : "#94a3b8";
  const rowDirection = getRowDirection(direction);
  const inputStyle = {
    writingDirection: direction,
    textAlign: getTextAlign(direction),
    color: isDark ? "#e6e2dd" : "#0c0a09",
    fontFamily: resolveFontFamily(locale, "serif", "regular"),
  } as const;
  const primaryActionColor = isDark ? "#e6e2dd" : "#0c0a09";
  const scanStatusLabel =
    scanResult?.status === "GRANTED"
      ? txt.granted
      : scanResult?.status === "ALREADY_SCANNED"
        ? txt.alreadyScanned
        : txt.denied;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ResponsiveContent className="gap-4">
          <View className="gap-1">
            <AppText variant="title">{currentHeading}</AppText>
            <AppText variant="subtitle">{txt.subtitle}</AppText>
          </View>

          <SectionCard className="gap-4 px-4 py-4">
            <View className={`overflow-hidden rounded-sm border ${isDark ? "border-[#223047] bg-black" : "border-border bg-black"}`}>
              {cameraPermission?.granted ? (
                <CameraView
                  key={cameraKey}
                  style={{ height: 260 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={detectedKioskId || scanMutation.isPending ? undefined : handleBarcodeScanned}
                  onCameraReady={() => {
                    setCameraReady(true);
                    setCameraError("");
                  }}
                  onMountError={() => {
                    setCameraReady(false);
                    setCameraError(txt.cameraAccessError);
                  }}
                />
              ) : (
                <View style={{ height: 260 }} />
              )}
            </View>

            <View
              className="items-center justify-between"
              style={{ flexDirection: rowDirection }}
            >
              <View
                className="items-center gap-2"
                style={{ flexDirection: rowDirection }}
              >
                <Feather name={cameraReady ? "camera" : "camera-off"} size={15} color={isDark ? "#cbd5e1" : "#64748b"} />
                <AppText className="text-sm text-muted-foreground">{cameraReady ? txt.cameraReady : txt.cameraNotReady}</AppText>
              </View>

              <Pressable
                className="items-center gap-2"
                style={{ flexDirection: rowDirection }}
                onPress={() => void restartCamera()}
              >
                <Feather name="refresh-cw" size={15} color={isDark ? "#cbd5e1" : "#64748b"} />
                <AppText className="text-sm font-semibold text-muted-foreground">{txt.restartCamera}</AppText>
              </Pressable>
            </View>

            {cameraError ? (
              <AppText className="text-sm font-semibold text-primary">{cameraError}</AppText>
            ) : null}
          </SectionCard>

          <SectionCard className="gap-3 px-4 py-4">
            <AppText variant="label">{txt.detectedQr}</AppText>
            <TextInput
              className={fieldClassName}
              style={inputStyle}
              value={detectedKioskId}
              onChangeText={setDetectedKioskId}
              placeholder={txt.scanAutofill}
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setDetectedMode((value) => cycleKind(value))}
              className={`items-center justify-between rounded-sm border px-3 py-2.5 ${isDark ? "border-[#223047] bg-[#1e2329]" : "border-border bg-background"}`}
              style={{ flexDirection: rowDirection }}
            >
              <AppText className="text-base text-foreground">{getKindLabel(detectedMode)}</AppText>
              <Feather name="chevron-down" size={16} color={isDark ? "#cbd5e1" : "#64748b"} />
            </Pressable>

            <Pressable
              disabled={!detectedKioskId.trim() || scanMutation.isPending}
              onPress={() => void submitAction({ kind: detectedMode, kioskId: detectedKioskId.trim() })}
              className={`min-h-[44px] items-center justify-center gap-2 rounded-lg px-5 py-2.5 ${!detectedKioskId.trim() || scanMutation.isPending ? "bg-primary/60" : "bg-primary"}`}
              style={{ flexDirection: rowDirection }}
            >
              <Feather name="maximize" size={15} color={primaryActionColor} />
              <AppText className="text-sm font-semibold" style={{ color: primaryActionColor }}>
                {scanMutation.isPending ? txt.processing : txt.confirmDetected}
              </AppText>
            </Pressable>

            <Pressable
              disabled={!detectedKioskId.trim() || scanMutation.isPending}
              onPress={() => void shareQrPayload({ kind: detectedMode, kioskId: detectedKioskId.trim() })}
              className="min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5"
              style={{ flexDirection: rowDirection }}
            >
              <Feather name="share" size={15} color={isDark ? "#cbd5e1" : "#57534e"} />
              <AppText className="text-sm font-semibold text-muted-foreground">{txt.shareDetected}</AppText>
            </Pressable>

            <AppText className="text-sm text-muted-foreground">{txt.supportedPayloads}</AppText>
          </SectionCard>

          <SectionCard className="gap-3 px-4 py-4">
            <AppText variant="label">{txt.manualFallback}</AppText>
            <TextInput
              className={fieldClassName}
              style={inputStyle}
              value={manualKioskId}
              onChangeText={setManualKioskId}
              placeholder={txt.enterKioskManually}
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setManualMode((value) => cycleKind(value))}
              className={`items-center justify-between rounded-sm border px-3 py-2.5 ${isDark ? "border-[#223047] bg-[#1e2329]" : "border-border bg-background"}`}
              style={{ flexDirection: rowDirection }}
            >
              <AppText className="text-base text-foreground">{getKindLabel(manualMode)}</AppText>
              <Feather name="chevron-down" size={16} color={isDark ? "#cbd5e1" : "#64748b"} />
            </Pressable>

            <Pressable
              disabled={!manualKioskId.trim() || scanMutation.isPending}
              onPress={() => void submitAction({ kind: manualMode, kioskId: manualKioskId.trim() })}
              className="min-h-[44px] items-center justify-center px-5 py-2.5"
            >
              <AppText className="text-sm font-semibold text-muted-foreground">{txt.submitManual}</AppText>
            </Pressable>

            <Pressable
              disabled={!manualKioskId.trim() || scanMutation.isPending}
              onPress={() => void shareQrPayload({ kind: manualMode, kioskId: manualKioskId.trim() })}
              className="min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5"
              style={{ flexDirection: rowDirection }}
            >
              <Feather name="share" size={15} color={isDark ? "#cbd5e1" : "#57534e"} />
              <AppText className="text-sm font-semibold text-muted-foreground">{txt.shareManual}</AppText>
            </Pressable>
          </SectionCard>

          {shareMessage ? (
            <SectionCard className="gap-1 px-4 py-4">
              <AppText className={`text-sm font-semibold ${shareMessage.type === "success" ? "text-emerald-500" : "text-danger"}`}>
                {shareMessage.text}
              </AppText>
            </SectionCard>
          ) : null}

          {scanResult ? (
            <SectionCard className="gap-1 px-4 py-4">
              <AppText className={`text-sm font-semibold ${scanResult.status === "GRANTED" || scanResult.status === "ALREADY_SCANNED" ? "text-emerald-500" : "text-danger"}`}>
                {scanStatusLabel}
              </AppText>
              <AppText className="text-sm text-muted-foreground">{scanResult.reason ?? txt.actionRecorded}</AppText>
              {scanResult.user_name ? <AppText className="text-sm text-foreground">{scanResult.user_name}</AppText> : null}
            </SectionCard>
          ) : null}
        </ResponsiveContent>
      </ScrollView>
    </AppScreen>
  );
}
