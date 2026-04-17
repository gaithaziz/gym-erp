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

export function localizeRole(role: string | undefined, isRTL: boolean) {
  return localizeValue(
    role,
    isRTL
      ? {
          ADMIN: "مدير",
          MANAGER: "مشرف",
          COACH: "مدرب",
          RECEPTION: "استقبال",
          FRONT_DESK: "استقبال",
          CASHIER: "كاشير",
          EMPLOYEE: "موظف",
          CUSTOMER: "عميل",
        }
      : {
          ADMIN: "Admin",
          MANAGER: "Manager",
          COACH: "Coach",
          RECEPTION: "Reception",
          FRONT_DESK: "Front desk",
          CASHIER: "Cashier",
          EMPLOYEE: "Employee",
          CUSTOMER: "Customer",
        },
    isRTL,
  );
}

export function localizePlanStatus(status: string | undefined, isRTL: boolean) {
  return localizeValue(
    status,
    isRTL
      ? {
          DRAFT: "مسودة",
          PUBLISHED: "منشور",
          ARCHIVED: "مؤرشف",
          ACTIVE: "نشط",
          INACTIVE: "غير نشط",
        }
      : {
          DRAFT: "Draft",
          PUBLISHED: "Published",
          ARCHIVED: "Archived",
          ACTIVE: "Active",
          INACTIVE: "Inactive",
        },
    isRTL,
  );
}

export function localizeFinanceTransactionType(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          INCOME: "دخل",
          EXPENSE: "مصروف",
        }
      : {
          INCOME: "Income",
          EXPENSE: "Expense",
        },
    isRTL,
  );
}

export function localizeFinanceCategory(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          SUBSCRIPTION: "اشتراك",
          POS_SALE: "بيع نقطة البيع",
          OTHER_INCOME: "دخل آخر",
          SALARY: "راتب",
          RENT: "إيجار",
          UTILITIES: "خدمات",
          MAINTENANCE: "صيانة",
          EQUIPMENT: "معدات",
          OTHER_EXPENSE: "مصروف آخر",
        }
      : {
          SUBSCRIPTION: "Subscription",
          POS_SALE: "POS sale",
          OTHER_INCOME: "Other income",
          SALARY: "Salary",
          RENT: "Rent",
          UTILITIES: "Utilities",
          MAINTENANCE: "Maintenance",
          EQUIPMENT: "Equipment",
          OTHER_EXPENSE: "Other expense",
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
          SYSTEM: "النظام",
        }
      : {
          CASH: "Cash",
          CARD: "Card",
          BANK_TRANSFER: "Bank transfer",
          TRANSFER: "Transfer",
          SYSTEM: "System",
        },
    isRTL,
  );
}

export function localizeAuditAction(value: string | undefined, isRTL: boolean) {
  return localizeValue(
    value,
    isRTL
      ? {
          CREATE_PRODUCT: "إنشاء منتج",
          UPDATE_PRODUCT: "تحديث منتج",
          DELETE_PRODUCT: "تعطيل منتج",
          LOW_STOCK_ACKNOWLEDGED: "تأكيد مخزون منخفض",
          LOW_STOCK_SNOOZED: "تأجيل تنبيه مخزون منخفض",
          LOW_STOCK_TARGET_UPDATED: "تحديث هدف إعادة التخزين",
          MOBILE_PRODUCT_CREATED: "إنشاء منتج من الجوال",
          MOBILE_PRODUCT_UPDATED: "تحديث منتج من الجوال",
          MOBILE_PRODUCT_DEACTIVATED: "تعطيل منتج من الجوال",
          MOBILE_LOW_STOCK_ACKNOWLEDGED: "تأكيد مخزون منخفض من الجوال",
          MOBILE_LOW_STOCK_SNOOZED: "تأجيل تنبيه مخزون منخفض من الجوال",
          MOBILE_LOW_STOCK_TARGET_UPDATED: "تحديث هدف إعادة التخزين من الجوال",
          MOBILE_RENEWAL_APPROVED: "قبول تجديد من الجوال",
          MOBILE_RENEWAL_REJECTED: "رفض تجديد من الجوال",
          PAYROLL_AUTOMATION_RUN: "تشغيل أتمتة الرواتب",
          POS_SALE: "بيع نقطة البيع",
          SUPPORT_TICKET_CREATED: "إنشاء تذكرة دعم",
          SUPPORT_MESSAGE_ADDED: "إضافة رد دعم",
          SUPPORT_STATUS_UPDATED: "تحديث حالة الدعم",
          CREATE_TRANSACTION: "إنشاء معاملة",
          UPDATE_TRANSACTION: "تحديث معاملة",
          DELETE_TRANSACTION: "حذف معاملة",
          CREATE_USER: "إنشاء مستخدم",
          UPDATE_USER: "تحديث مستخدم",
          DELETE_USER: "حذف مستخدم",
        }
      : {
          CREATE_PRODUCT: "Create product",
          UPDATE_PRODUCT: "Update product",
          DELETE_PRODUCT: "Deactivate product",
          LOW_STOCK_ACKNOWLEDGED: "Low stock acknowledged",
          LOW_STOCK_SNOOZED: "Low stock snoozed",
          LOW_STOCK_TARGET_UPDATED: "Restock target updated",
          MOBILE_PRODUCT_CREATED: "Mobile product created",
          MOBILE_PRODUCT_UPDATED: "Mobile product updated",
          MOBILE_PRODUCT_DEACTIVATED: "Mobile product deactivated",
          MOBILE_LOW_STOCK_ACKNOWLEDGED: "Mobile low stock acknowledged",
          MOBILE_LOW_STOCK_SNOOZED: "Mobile low stock snoozed",
          MOBILE_LOW_STOCK_TARGET_UPDATED: "Mobile restock target updated",
          MOBILE_RENEWAL_APPROVED: "Mobile renewal approved",
          MOBILE_RENEWAL_REJECTED: "Mobile renewal rejected",
          PAYROLL_AUTOMATION_RUN: "Payroll automation run",
          POS_SALE: "POS sale",
          SUPPORT_TICKET_CREATED: "Support ticket created",
          SUPPORT_MESSAGE_ADDED: "Support reply added",
          SUPPORT_STATUS_UPDATED: "Support status updated",
          CREATE_TRANSACTION: "Create transaction",
          UPDATE_TRANSACTION: "Update transaction",
          DELETE_TRANSACTION: "Delete transaction",
          CREATE_USER: "Create user",
          UPDATE_USER: "Update user",
          DELETE_USER: "Delete user",
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
