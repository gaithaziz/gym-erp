import type { QrScannerDriver } from "@gym-erp/contracts";

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type PendingScan = {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
};

let pendingScan: PendingScan | null = null;

export function parseQrScannerValue(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (KIOSK_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("gymerp://kiosk/")) {
    const kioskId = trimmed.replace("gymerp://kiosk/", "").trim();
    return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { kiosk_id?: string };
      const kioskId = parsed.kiosk_id?.trim();
      return kioskId && KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function resolveQrScan(value: string) {
  if (!pendingScan) return;
  pendingScan.resolve(value);
  pendingScan = null;
}

export function cancelQrScan() {
  if (!pendingScan) return;
  pendingScan.reject(new Error("QR scan cancelled"));
  pendingScan = null;
}

export const qrScannerDriver: QrScannerDriver = {
  async scan() {
    if (pendingScan) {
      throw new Error("QR scan already in progress");
    }

    return new Promise<string>((resolve, reject) => {
      pendingScan = { resolve, reject };
    });
  },
};
