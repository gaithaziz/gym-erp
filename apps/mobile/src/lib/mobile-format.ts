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

export function localizeLeaveStatus(status: string | undefined, isRTL: boolean) {
  return localizeValue(
    status,
    isRTL
      ? {
          PENDING: "قيد الانتظار",
          APPROVED: "موافق عليه",
          DENIED: "مرفوض",
        }
      : {
          PENDING: "Pending",
          APPROVED: "Approved",
          DENIED: "Denied",
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
          TRANSFER: "تحويل",
        }
      : {
          CASH: "Cash",
          CARD: "Card",
          BANK_TRANSFER: "Bank transfer",
          TRANSFER: "Transfer",
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

export function localizeAccessStatus(status: string | undefined, isRTL: boolean) {
  return localizeValue(
    status,
    isRTL
      ? {
          GRANTED: "تم السماح",
          DENIED: "مرفوض",
          ALREADY_SCANNED: "تم المسح مسبقاً",
        }
      : {
          GRANTED: "Granted",
          DENIED: "Denied",
          ALREADY_SCANNED: "Already scanned",
        },
    isRTL,
  );
}

export function localizeAccessReason(reason: string | undefined | null, isRTL: boolean) {
  if (!reason) {
    return isRTL ? "لا يوجد سبب إضافي" : "No additional reason";
  }
  const normalized = reason.toUpperCase();
  const map: Record<string, string> = isRTL
    ? {
        SUBSCRIPTION_EXPIRED: "الاشتراك منتهي",
        SUBSCRIPTION_FROZEN: "الاشتراك مجمّد",
        NO_ACTIVE_SUBSCRIPTION: "لا يوجد اشتراك نشط",
        QR_EXPIRED: "رمز المسح منتهي",
        USER_NOT_FOUND: "المستخدم غير موجود",
      }
    : {
        SUBSCRIPTION_EXPIRED: "Subscription expired",
        SUBSCRIPTION_FROZEN: "Subscription frozen",
        NO_ACTIVE_SUBSCRIPTION: "No active subscription",
        QR_EXPIRED: "Scan code expired",
        USER_NOT_FOUND: "User not found",
      };
  map["SCANNED WITHIN THE LAST 60 SECONDS"] = isRTL ? "تم المسح خلال آخر 60 ثانية" : "Scanned within the last 60 seconds";
  return map[normalized] ?? reason;
}

export function localizeNotificationEventType(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          SUPPORT_REPLY: "رد من الدعم",
          SUBSCRIPTION_RENEWED: "تم تجديد الاشتراك",
          SUBSCRIPTION_CREATED: "تم إنشاء الاشتراك",
          SUBSCRIPTION_STATUS_CHANGED: "تم تحديث حالة الاشتراك",
          ACCESS_GRANTED: "تم تسجيل الدخول",
        }
      : {
          SUPPORT_REPLY: "Support reply",
          SUBSCRIPTION_RENEWED: "Subscription renewed",
          SUBSCRIPTION_CREATED: "Subscription created",
          SUBSCRIPTION_STATUS_CHANGED: "Subscription status changed",
          ACCESS_GRANTED: "Check-in granted",
        },
    isRTL,
  );
}

export function localizeNotificationStatus(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          SENT: "تم الإرسال",
          QUEUED: "قيد الانتظار",
          FAILED: "فشل",
          SKIPPED: "تم التجاهل",
        }
      : {
          SENT: "Sent",
          QUEUED: "Queued",
          FAILED: "Failed",
          SKIPPED: "Skipped",
        },
    isRTL,
  );
}

export function localizeLostFoundStatus(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          REPORTED: "تم الإبلاغ",
          UNDER_REVIEW: "قيد المراجعة",
          READY_FOR_PICKUP: "جاهز للاستلام",
          CLOSED: "مغلق",
          REJECTED: "مرفوض",
          DISPOSED: "تم التخلص منه",
        }
      : {
          REPORTED: "Reported",
          UNDER_REVIEW: "Under review",
          READY_FOR_PICKUP: "Ready for pickup",
          CLOSED: "Closed",
          REJECTED: "Rejected",
          DISPOSED: "Disposed",
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
