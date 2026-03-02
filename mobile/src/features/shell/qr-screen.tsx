import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import QRCode from "react-native-qrcode-svg";

import { parseStandardResponse } from "@gym-erp/contracts";

import { api } from "@/src/core/api/client";
import { getApiErrorMessage } from "@/src/core/api/error-message";
import { useSession } from "@/src/core/auth/use-session";
import { fileShareDriver } from "@/src/core/device/file-share";
import {
  cancelQrScan,
  parseQrScannerValue,
  qrScannerDriver,
  resolveQrScan,
} from "@/src/core/device/qr-scanner";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { EmptyState } from "@/src/core/ui/empty-state";
import { ErrorState } from "@/src/core/ui/error-state";
import { LoadingState } from "@/src/core/ui/loading-state";
import { ResponsiveContent } from "@/src/core/ui/responsive-content";
import { SectionCard } from "@/src/core/ui/section-card";

type QrPayload = {
  qr_token: string;
  expires_in_seconds: number;
};

type AccessScanResult = {
  status: string;
  user_name: string;
  reason?: string | null;
};

async function fetchPersonalQr(): Promise<QrPayload> {
  const response = await api.get("/access/qr");
  const envelope = parseStandardResponse<unknown>(response.data);
  const payload = envelope.data as Partial<QrPayload> | undefined;

  if (!payload?.qr_token || typeof payload.expires_in_seconds !== "number") {
    throw new Error("Invalid QR response");
  }

  return {
    qr_token: payload.qr_token,
    expires_in_seconds: payload.expires_in_seconds,
  };
}

export function QrScreen() {
  const { t, locale } = useLocale();
  const { user } = useSession();
  const { isDark } = useTheme();
  const [issuedAt, setIssuedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanState, setScanState] = useState<{ kioskId: string | null; error: string | null }>({
    kioskId: null,
    error: null,
  });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const query = useQuery({
    queryKey: ["access", "qr"],
    queryFn: fetchPersonalQr,
  });

  const scanMutation = useMutation({
    mutationFn: async (kioskId: string) => {
      const response = await api.post("/access/scan-session", { kiosk_id: kioskId });
      const envelope = parseStandardResponse<AccessScanResult>(response.data);
      if (!envelope.data) {
        throw new Error("Missing scan result");
      }
      return envelope.data;
    },
  });

  useEffect(() => {
    if (query.dataUpdatedAt) {
      setIssuedAt(query.dataUpdatedAt);
    }
  }, [query.dataUpdatedAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const secondsRemaining = useMemo(() => {
    if (!query.data) return 0;
    const elapsedSeconds = Math.floor((now - issuedAt) / 1000);
    return Math.max(query.data.expires_in_seconds - elapsedSeconds, 0);
  }, [issuedAt, now, query.data]);

  const scanCopy = locale === "ar"
    ? {
        scannerTitle: "مسح رمز الكشك",
        scannerBody: "استخدم الكاميرا لمسح رمز كشك الدخول وتسجيل العملية مباشرة.",
        openScanner: "فتح الماسح",
        closeScanner: "إغلاق الماسح",
        requestPermission: "السماح بالكاميرا",
        permissionHint: "مطلوب إذن الكاميرا لمسح رموز الكشك.",
        invalidQr: "رمز الكشك غير صالح.",
        scannerReady: "وجّه الكاميرا نحو رمز QR الخاص بالكشك.",
        submitSuccess: "تم تسجيل العملية.",
        submitFailed: "تعذر تسجيل عملية المسح.",
        scanResult: "نتيجة المسح",
        shareQr: "مشاركة الرمز",
      }
    : {
        scannerTitle: "Scan kiosk QR",
        scannerBody: "Use the camera to scan an entrance kiosk QR and submit the access action immediately.",
        openScanner: "Open scanner",
        closeScanner: "Close scanner",
        requestPermission: "Allow camera",
        permissionHint: "Camera permission is required to scan kiosk QR codes.",
        invalidQr: "Invalid kiosk QR format.",
        scannerReady: "Point the camera at the kiosk QR code.",
        submitSuccess: "Scan submitted.",
        submitFailed: "Failed to submit scan.",
        scanResult: "Scan result",
        shareQr: "Share QR",
      };

  async function handleOpenScanner() {
    setScanState({ kioskId: null, error: null });

    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setScanState({ kioskId: null, error: scanCopy.permissionHint });
        return;
      }
    }

    setScannerOpen(true);

    try {
      const kioskId = await qrScannerDriver.scan();
      setScanState({ kioskId, error: null });
      await scanMutation.mutateAsync(kioskId);
      setScannerOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "QR scan cancelled") {
        return;
      }
      setScanState({
        kioskId: null,
        error: getApiErrorMessage(error, scanCopy.submitFailed),
      });
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scanMutation.isPending || scanState.kioskId) {
      return;
    }

    const kioskId = parseQrScannerValue(result.data);
    if (!kioskId) {
      setScanState({ kioskId: null, error: scanCopy.invalidQr });
      return;
    }

    resolveQrScan(kioskId);
  }

  if (query.isLoading && !query.data) {
    return <LoadingState fullScreen />;
  }

  if (query.isError) {
    return (
      <AppScreen className="justify-center">
        <ErrorState onRetry={() => void query.refetch()} />
      </AppScreen>
    );
  }

  if (!query.data) {
    return (
      <AppScreen className="justify-center">
        <EmptyState title={t("mobile.qrUnavailable")} subtitle={t("mobile.qrUnavailableBody")} />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} />}
      >
        <ResponsiveContent className="gap-4">
        <View className="gap-1">
          <AppText variant="title">{t("dashboard.nav.myQrCode")}</AppText>
          <AppText variant="subtitle">{t("mobile.qrLiveBody")}</AppText>
        </View>

        <SectionCard className="gap-2">
          <AppText variant="label">{t("dashboard.nav.myQrCode")}</AppText>
          <AppText variant="title">{t("mobile.qrHeading")}</AppText>
          <AppText className="text-muted-foreground">{t("mobile.qrLiveBody")}</AppText>
        </SectionCard>

        <SectionCard className="items-center gap-4">
          <View className="rounded-lg border border-border bg-card p-4">
            <QRCode value={query.data.qr_token} size={220} />
          </View>

          <View className="items-center gap-1">
            <AppText variant="label">{t("mobile.signedInAs")}</AppText>
            <AppText className="text-center font-mono text-sm text-foreground">{user?.email ?? "-"}</AppText>
          </View>

          <View className="rounded-lg border border-border bg-background px-4 py-2">
            <AppText className="text-sm font-semibold text-foreground">
              {secondsRemaining > 0
                ? `${t("mobile.qrExpiresIn")} ${secondsRemaining}s`
                : t("mobile.qrExpired")}
            </AppText>
          </View>

          <AppButton
            title={query.isFetching ? t("common.loading") : t("mobile.qrRefresh")}
            variant="secondary"
            loading={query.isFetching}
            onPress={() => void query.refetch()}
          />
          <AppButton
            title={scanCopy.shareQr}
            variant="secondary"
            onPress={() => void fileShareDriver.share(query.data.qr_token)}
          />
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{scanCopy.scannerTitle}</AppText>
          <AppText className="text-sm text-muted-foreground">{scanCopy.scannerBody}</AppText>

          {scannerOpen ? (
            <View className="gap-3">
              <View className={`overflow-hidden rounded-lg border ${isDark ? "border-[#2a2f3a]" : "border-border"}`}>
                <CameraView
                  style={{ height: 280 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleBarcodeScanned}
                />
              </View>
              <AppText className="text-sm text-muted-foreground">{scanCopy.scannerReady}</AppText>
              <AppButton
                title={scanCopy.closeScanner}
                variant="secondary"
                onPress={() => {
                  cancelQrScan();
                  setScannerOpen(false);
                }}
              />
            </View>
          ) : (
            <AppButton
              title={
                cameraPermission?.granted ? scanCopy.openScanner : scanCopy.requestPermission
              }
              variant="secondary"
              onPress={() => void handleOpenScanner()}
            />
          )}

          {scanState.error ? (
            <AppText className="text-sm text-danger">{scanState.error}</AppText>
          ) : null}

          {scanMutation.data ? (
            <View className={`rounded-lg border px-4 py-4 ${scanMutation.data.status === "GRANTED" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <AppText variant="label">{scanCopy.scanResult}</AppText>
              <AppText className="mt-1 font-semibold text-foreground">{scanMutation.data.user_name}</AppText>
              <AppText className="text-sm text-muted-foreground">
                {scanMutation.data.reason ?? scanCopy.submitSuccess}
              </AppText>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.qrTokenLabel")}</AppText>
          <View className="rounded-lg border border-border bg-background px-4 py-4">
            <AppText className="font-mono text-xs text-muted-foreground">{query.data.qr_token}</AppText>
          </View>
        </SectionCard>
        </ResponsiveContent>
      </ScrollView>
    </AppScreen>
  );
}
