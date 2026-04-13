const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/;

export function parseScannedKioskId(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (KIOSK_ID_PATTERN.test(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as { kiosk_id?: unknown };
    const kioskId = typeof parsed.kiosk_id === "string" ? parsed.kiosk_id.trim() : "";
    return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : null;
  } catch {
    return null;
  }
}
