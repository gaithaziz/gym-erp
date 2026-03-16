const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export type ParsedQrPayload = {
  kind: "client_entry" | "staff_check_in" | "staff_check_out";
  kioskId: string;
};

export function isValidQrKioskId(value: string): boolean {
  return KIOSK_ID_PATTERN.test(value.trim());
}

export function parseQrScannerPayload(rawValue: string): ParsedQrPayload | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (KIOSK_ID_PATTERN.test(trimmed)) {
    return { kind: "client_entry", kioskId: trimmed };
  }

  if (trimmed.startsWith("gymerp://kiosk/")) {
    const kioskId = trimmed.replace("gymerp://kiosk/", "").trim();
    return KIOSK_ID_PATTERN.test(kioskId) ? { kind: "client_entry", kioskId } : null;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { kiosk_id?: string; type?: string };
      const kioskId = parsed.kiosk_id?.trim();
      if (!kioskId || !KIOSK_ID_PATTERN.test(kioskId)) return null;

      if (!parsed.type) return { kind: "client_entry", kioskId };
      if (parsed.type === "client_entry" || parsed.type === "staff_check_in" || parsed.type === "staff_check_out") {
        return { kind: parsed.type, kioskId };
      }
      return null;
    } catch {
      return null;
    }
  }

  return null;
}
