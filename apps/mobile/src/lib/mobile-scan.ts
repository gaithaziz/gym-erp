const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/;

export type ScannedKioskKind = "client_entry" | "staff_check_in" | "staff_check_out";

export type ScannedKioskPayload = {
  kind: ScannedKioskKind;
  kioskId: string;
};

export function parseScannedKioskPayload(raw: string): ScannedKioskPayload | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (KIOSK_ID_PATTERN.test(value)) {
    return { kind: "client_entry", kioskId: value };
  }

  if (value.startsWith("gymerp://kiosk/")) {
    const kioskId = value.replace("gymerp://kiosk/", "").trim();
    return KIOSK_ID_PATTERN.test(kioskId) ? { kind: "client_entry", kioskId } : null;
  }

  try {
    const parsed = JSON.parse(value) as { kiosk_id?: unknown; type?: unknown };
    const kioskId = typeof parsed.kiosk_id === "string" ? parsed.kiosk_id.trim() : "";
    if (!KIOSK_ID_PATTERN.test(kioskId)) {
      return null;
    }

    if (parsed.type === "staff_check_in" || parsed.type === "staff_check_out" || parsed.type === "client_entry") {
      return { kind: parsed.type, kioskId };
    }

    if (parsed.type === undefined || parsed.type === null) {
      return { kind: "client_entry", kioskId };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseScannedKioskId(raw: string): string | null {
  const payload = parseScannedKioskPayload(raw);
  return payload?.kind === "client_entry" ? payload.kioskId : null;
}
