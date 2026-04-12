export function localeTag(isRTL: boolean) {
  return isRTL ? "ar" : "en";
}

export function localizeSubscriptionStatus(status: string | undefined, isRTL: boolean) {
  return localizeValue(
    status,
    isRTL
      ? {
          ACTIVE: "نشط",
          EXPIRED: "منتهي",
          FROZEN: "مجمّد",
        }
      : {
          ACTIVE: "Active",
          EXPIRED: "Expired",
          FROZEN: "Frozen",
        },
    isRTL,
  );
}

export function localizeRenewalStatus(status: string | undefined, isRTL: boolean) {
  return localizeValue(
    status,
    isRTL
      ? {
          PENDING: "قيد الانتظار",
          APPROVED: "مقبول",
          REJECTED: "مرفوض",
          CANCELLED: "ملغي",
        }
      : {
          PENDING: "Pending",
          APPROVED: "Approved",
          REJECTED: "Rejected",
          CANCELLED: "Cancelled",
        },
    isRTL,
  );
}

export function localizeTicketStatus(status: string | undefined, isRTL: boolean) {
  return localizeValue(
    status,
    isRTL
      ? {
          OPEN: "مفتوحة",
          IN_PROGRESS: "قيد المعالجة",
          RESOLVED: "تم الحل",
          CLOSED: "مغلقة",
        }
      : {
          OPEN: "Open",
          IN_PROGRESS: "In progress",
          RESOLVED: "Resolved",
          CLOSED: "Closed",
        },
    isRTL,
  );
}

export function localizeTicketCategory(category: string | undefined, isRTL: boolean) {
  return localizeValue(
    category,
    isRTL
      ? {
          GENERAL: "عام",
          TECHNICAL: "تقني",
          BILLING: "فوترة",
          SUBSCRIPTION: "اشتراك",
        }
      : {
          GENERAL: "General",
          TECHNICAL: "Technical",
          BILLING: "Billing",
          SUBSCRIPTION: "Subscription",
        },
    isRTL,
  );
}

export function localizePaymentMethod(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          CASH: "نقداً",
          CARD: "بطاقة",
          BANK_TRANSFER: "تحويل بنكي",
        }
      : {
          CASH: "Cash",
          CARD: "Card",
          BANK_TRANSFER: "Bank transfer",
        },
    isRTL,
  );
}

export function localizeMessageType(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          TEXT: "رسالة نصية",
          IMAGE: "صورة",
          VIDEO: "فيديو",
          VOICE: "رسالة صوتية",
        }
      : {
          TEXT: "Text message",
          IMAGE: "Image",
          VIDEO: "Video",
          VOICE: "Voice note",
        },
    isRTL,
  );
}

function localizeValue(value: string | undefined, map: Record<string, string>, isRTL: boolean) {
  if (!value) {
    return isRTL ? "غير معروف" : "Unknown";
  }

  const normalized = value.toUpperCase();
  return map[normalized] ?? value;
}
