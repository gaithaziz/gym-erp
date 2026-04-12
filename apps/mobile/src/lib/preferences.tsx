import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import * as SecureStore from "expo-secure-store";

import { fonts, themes, type Locale, type ThemeMode } from "@/lib/theme";

type ThemeTokens = (typeof themes)[keyof typeof themes];
type CopySet = (typeof copy)[keyof typeof copy];

const THEME_STORAGE_KEY = "gym-erp.mobile.theme";
const LOCALE_STORAGE_KEY = "gym-erp.mobile.locale";

const copy = {
  en: {
    appName: "Gym ERP",
    controls: {
      theme: "Theme",
      language: "Language",
    },
    tabs: {
      home: "Home",
      qr: "QR",
      plans: "Plans",
      progress: "Progress",
      more: "More",
    },
    common: {
      billing: "Billing",
      notifications: "Notifications",
      support: "Support",
      chat: "Chat",
      lostFound: "Lost & Found",
      profile: "Profile",
      feedbackHistory: "Feedback History",
      signOut: "Sign out",
      noData: "No data yet.",
      loading: "Loading...",
      noActivePlan: "No active plan",
      noCurrentPlan: "No current plan",
      noComment: "No comment",
      noMessagesYet: "No messages yet.",
      noLocationAdded: "No location added",
      customer: "Customer",
      coach: "Coach",
      on: "On",
      off: "Off",
      yes: "Yes",
      no: "No",
      minutesShort: "min",
      days: "days",
      expectedSessions30d: "expected sessions / 30d",
      unread: "Unread",
      save: "Save",
      cancel: "Cancel",
      send: "Send",
      create: "Create",
      update: "Update",
      submit: "Submit",
      reply: "Reply",
      note: "Note",
      message: "Message",
      status: "Status",
      category: "Category",
      loadingDetails: "Loading details...",
      successUpdated: "Updated successfully",
      errorTryAgain: "Something went wrong. Please try again.",
      attachFile: "Attach file",
      uploading: "Uploading...",
    },
    login: {
      title: "Gym ERP",
      subtitle: "Customer mobile access for QR entry, plans, progress, and support.",
      kicker: "Phase 2 customer app",
      signIn: "Sign in",
      signInButton: "Continue",
      signingIn: "Signing in...",
      email: "Email",
      password: "Password",
      localDemo: "Local demo accounts",
      localDemoHint: "Use the seeded customer account for a full Phase 2 walkthrough.",
    },
    home: {
      greeting: "Hi",
      subtitle: "Customer control center",
      billingBadge: "Billing",
      subscription: "Subscription",
      plan: "Plan",
      status: "Status",
      renew: "Renew from billing",
      workoutPlans: "Workout plans",
      dietPlans: "Diet plans",
      checkIns: "Check-ins",
      unreadChat: "Unread chat",
      latestBiometric: "Latest biometric",
      weight: "Weight",
      bodyFat: "Body fat",
      noBiometrics: "No biometric logs yet.",
      recentReceipts: "Recent receipts",
      noReceipts: "No receipts yet.",
    },
    qr: {
      title: "Member QR",
      subtitle: "Use this token for staff check-in and entrance lookup.",
      entranceStatus: "Entrance status",
      qrToken: "QR token",
      expiresIn: "Expires in",
      seconds: "seconds",
    },
    plans: {
      title: "Plans",
      subtitle: "Your assigned workout and diet plans.",
      workoutPlans: "Workout plans",
      dietPlans: "Diet plans",
      noWorkoutPlans: "No workout plans assigned.",
      noDietPlans: "No diet plans assigned.",
    },
    progress: {
      title: "Progress",
      subtitle: "Biometrics, attendance history, and workout sessions.",
      biometrics: "Biometrics",
      noBiometrics: "No biometric history yet.",
      recentSessions: "Recent sessions",
      noSessions: "No session logs yet.",
      attendance: "Attendance",
      recentScans: "recent access scans",
    },
    more: {
      title: "More",
      subtitle: "Customer services, profile, and app settings.",
      customerAccount: "Customer account",
      billing: "Billing and renewal requests",
      notifications: "Notifications",
      support: "Support tickets",
      chat: "Chat threads",
      lostFound: "Lost & Found",
      profile: "Profile and settings",
      feedback: "Feedback history",
    },
    billingScreen: {
      subtitle: "Renewal requests, offers, receipts, and payment policy.",
      renewalRequests: "Renewal requests",
      noRenewalRequests: "No renewal requests yet.",
      renewalOffers: "Renewal offers",
      receipts: "Receipts",
      paymentPolicy: "Payment policy",
      requestTitle: "Submit renewal request",
      requestHelp: "Send your renewal request here, then pay at the gym in cash and wait for staff approval.",
      selectedOffer: "Selected offer",
      customerNote: "Customer note",
      customerNotePlaceholder: "Tell the gym when you plan to pay or leave any helpful note.",
      submitRequest: "Submit renewal request",
      submittingRequest: "Submitting request...",
    },
    notificationsScreen: {
      subtitle: "Recent customer events and inbox items.",
    },
    supportScreen: {
      subtitle: "Open customer support tickets and recent replies.",
      noTickets: "No support tickets yet.",
      newTicket: "Create support ticket",
      subject: "Subject",
      subjectPlaceholder: "Short title for your issue",
      messagePlaceholder: "Explain what you need help with",
      sendReply: "Send reply",
      sendingReply: "Sending reply...",
      creatingTicket: "Creating ticket...",
      pickTicket: "Pick a ticket to continue the conversation.",
    },
    chatScreen: {
      subtitle: "Coach conversations and unread thread counts.",
      subtitleStart: "Pick a coach, start a thread, and keep replies in one place.",
      noThreads: "No chat threads yet.",
      startThread: "Start chat",
      newConversation: "New conversation",
      selectedCoachLabel: "Selected coach:",
      coachId: "Coach",
      coachIdPlaceholder: "Choose a coach",
      openThread: "Open thread",
      threadMessages: "Thread messages",
      threadHint: "Phone-style conversation view",
      messagePlaceholder: "Write a message",
      markRead: "Mark as read",
      creatingThread: "Starting chat...",
      sendingMessage: "Sending message...",
      pickThread: "Pick a thread to see the full conversation.",
      noCoaches: "No coaches available yet.",
      threadStarted: "Chat is ready.",
      unreadActive: "Unread",
      liveNow: "Live",
    },
    lostFoundScreen: {
      subtitle: "Your reported items and recent status changes.",
      noItems: "No lost and found items yet.",
      createItem: "Report item",
      title: "Title",
      description: "Description",
      category: "Category",
      foundLocation: "Found location",
      contactNote: "Contact note",
      commentPlaceholder: "Add a comment",
      createItemBusy: "Reporting item...",
      commentBusy: "Sending comment...",
      itemComments: "Comments",
      addComment: "Add comment",
      media: "Media",
    },
    profileScreen: {
      subtitle: "Customer profile fields and notification preferences.",
      noPhone: "No phone number yet",
      noBio: "No bio yet",
      notificationSettings: "Notification settings",
      push: "Push",
      chat: "Chat",
      support: "Support",
      billing: "Billing",
      fullName: "Full name",
      phone: "Phone number",
      bio: "Bio",
      saveProfile: "Save profile",
      savingProfile: "Saving profile...",
      currentPassword: "Current password",
      newPassword: "New password",
      changePassword: "Change password",
      changingPassword: "Changing password...",
      announcements: "Announcements",
    },
    feedbackScreen: {
      subtitle: "Workout, diet, and gym feedback submitted from your account.",
      workout: "Workout feedback",
      diet: "Diet feedback",
      gym: "Gym feedback",
      noWorkout: "No workout feedback yet.",
      noDiet: "No diet feedback yet.",
      noGym: "No gym feedback yet.",
      dietPlan: "Diet plan",
    },
    session: {
      title: "Starting mobile app",
      subtitle: "Restoring your session and checking gym access.",
      loading: "Loading secure session state...",
    },
  },
  ar: {
    appName: "Gym ERP",
    controls: {
      theme: "المظهر",
      language: "اللغة",
    },
    tabs: {
      home: "الرئيسية",
      qr: "QR",
      plans: "الخطط",
      progress: "التقدم",
      more: "المزيد",
    },
    common: {
      billing: "الفوترة",
      notifications: "الإشعارات",
      support: "الدعم",
      chat: "المحادثة",
      lostFound: "المفقودات",
      profile: "الملف الشخصي",
      feedbackHistory: "سجل الملاحظات",
      signOut: "تسجيل الخروج",
      noData: "لا توجد بيانات بعد.",
      loading: "جاري التحميل...",
      noActivePlan: "لا توجد خطة نشطة",
      noCurrentPlan: "لا توجد خطة حالية",
      noComment: "لا يوجد تعليق",
      noMessagesYet: "لا توجد رسائل بعد.",
      noLocationAdded: "لم يتم تحديد موقع",
      customer: "العميل",
      coach: "المدرب",
      on: "مفعّل",
      off: "غير مفعّل",
      yes: "نعم",
      no: "لا",
      minutesShort: "د",
      days: "يوم",
      expectedSessions30d: "جلسة متوقعة خلال 30 يوماً",
      unread: "غير المقروء",
      save: "حفظ",
      cancel: "إلغاء",
      send: "إرسال",
      create: "إنشاء",
      update: "تحديث",
      submit: "إرسال",
      reply: "رد",
      note: "ملاحظة",
      message: "الرسالة",
      status: "الحالة",
      category: "الفئة",
      loadingDetails: "جاري تحميل التفاصيل...",
      successUpdated: "تم التحديث بنجاح",
      errorTryAgain: "حدث خطأ. حاول مرة أخرى.",
      attachFile: "إرفاق ملف",
      uploading: "جارٍ الرفع...",
    },
    login: {
      title: "Gym ERP",
      subtitle: "وصول العملاء من الجوال للـ QR والخطط والتقدم والدعم.",
      kicker: "تطبيق العملاء - المرحلة الثانية",
      signIn: "تسجيل الدخول",
      signInButton: "دخول",
      signingIn: "جارٍ تسجيل الدخول...",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      localDemo: "حسابات تجريبية محلية",
      localDemoHint: "استخدم حساب العميل المزروع محلياً لتجربة المرحلة الثانية كاملة.",
    },
    home: {
      greeting: "أهلاً",
      subtitle: "لوحة تحكم العميل",
      billingBadge: "الفوترة",
      subscription: "الاشتراك",
      plan: "الخطة",
      status: "الحالة",
      renew: "جدّد من الفوترة",
      workoutPlans: "خطط التمرين",
      dietPlans: "خطط الغذاء",
      checkIns: "مرات الدخول",
      unreadChat: "محادثات غير مقروءة",
      latestBiometric: "آخر قياس",
      weight: "الوزن",
      bodyFat: "دهون الجسم",
      noBiometrics: "لا توجد قياسات بعد.",
      recentReceipts: "آخر الإيصالات",
      noReceipts: "لا توجد إيصالات بعد.",
    },
    qr: {
      title: "QR العضو",
      subtitle: "استخدم هذا الرمز عند الاستقبال أو التحقق من الدخول.",
      entranceStatus: "حالة الدخول",
      qrToken: "رمز QR",
      expiresIn: "ينتهي خلال",
      seconds: "ثانية",
    },
    plans: {
      title: "الخطط",
      subtitle: "خطط التمرين والغذاء المخصصة لك.",
      workoutPlans: "خطط التمرين",
      dietPlans: "خطط الغذاء",
      noWorkoutPlans: "لا توجد خطط تمرين حالياً.",
      noDietPlans: "لا توجد خطط غذاء حالياً.",
    },
    progress: {
      title: "التقدم",
      subtitle: "القياسات وسجل الحضور وجلسات التمرين.",
      biometrics: "القياسات",
      noBiometrics: "لا يوجد سجل قياسات بعد.",
      recentSessions: "الجلسات الأخيرة",
      noSessions: "لا يوجد سجل جلسات بعد.",
      attendance: "الحضور",
      recentScans: "عملية دخول حديثة",
    },
    more: {
      title: "المزيد",
      subtitle: "خدمات العميل والملف الشخصي وإعدادات التطبيق.",
      customerAccount: "حساب العميل",
      billing: "الفوترة وطلبات التجديد",
      notifications: "الإشعارات",
      support: "تذاكر الدعم",
      chat: "المحادثات",
      lostFound: "المفقودات",
      profile: "الملف والإعدادات",
      feedback: "سجل الملاحظات",
    },
    billingScreen: {
      subtitle: "طلبات التجديد والعروض والإيصالات وسياسة الدفع.",
      renewalRequests: "طلبات التجديد",
      noRenewalRequests: "لا توجد طلبات تجديد بعد.",
      renewalOffers: "عروض التجديد",
      receipts: "الإيصالات",
      paymentPolicy: "سياسة الدفع",
      requestTitle: "إرسال طلب تجديد",
      requestHelp: "أرسل طلب التجديد هنا، ثم ادفع نقداً في النادي وانتظر موافقة الموظفين.",
      selectedOffer: "العرض المختار",
      customerNote: "ملاحظة العميل",
      customerNotePlaceholder: "أخبر النادي متى ستدفع أو اترك ملاحظة مفيدة.",
      submitRequest: "إرسال طلب التجديد",
      submittingRequest: "جارٍ إرسال الطلب...",
    },
    notificationsScreen: {
      subtitle: "آخر أحداث العميل وعناصر صندوق الإشعارات.",
    },
    supportScreen: {
      subtitle: "تذاكر دعم العميل والردود الأخيرة.",
      noTickets: "لا توجد تذاكر دعم بعد.",
      newTicket: "إنشاء تذكرة دعم",
      subject: "الموضوع",
      subjectPlaceholder: "عنوان مختصر للمشكلة",
      messagePlaceholder: "اشرح ما الذي تحتاج إليه",
      sendReply: "إرسال الرد",
      sendingReply: "جارٍ إرسال الرد...",
      creatingTicket: "جارٍ إنشاء التذكرة...",
      pickTicket: "اختر تذكرة لمتابعة المحادثة.",
    },
    chatScreen: {
      subtitle: "محادثات المدرب وعدد الرسائل غير المقروءة.",
      subtitleStart: "اختر مدرباً، وابدأ المحادثة، واحتفظ بالردود في مكان واحد.",
      noThreads: "لا توجد محادثات بعد.",
      startThread: "بدء محادثة",
      newConversation: "محادثة جديدة",
      selectedCoachLabel: "المدرب المحدد:",
      coachId: "المدرب",
      coachIdPlaceholder: "اختر مدرباً",
      openThread: "فتح المحادثة",
      threadMessages: "رسائل المحادثة",
      threadHint: "عرض محادثة مناسب للهاتف",
      messagePlaceholder: "اكتب رسالة",
      markRead: "تعيين كمقروء",
      creatingThread: "جارٍ بدء المحادثة...",
      sendingMessage: "جارٍ إرسال الرسالة...",
      pickThread: "اختر محادثة لعرضها كاملة.",
      noCoaches: "لا يوجد مدربون متاحون بعد.",
      threadStarted: "المحادثة جاهزة.",
      unreadActive: "غير مقروء",
      liveNow: "مباشر",
    },
    lostFoundScreen: {
      subtitle: "الأغراض التي أبلغت عنها وآخر تحديثات الحالة.",
      noItems: "لا توجد عناصر مفقودات بعد.",
      createItem: "الإبلاغ عن غرض",
      title: "العنوان",
      description: "الوصف",
      category: "الفئة",
      foundLocation: "مكان العثور",
      contactNote: "ملاحظة التواصل",
      commentPlaceholder: "أضف تعليقاً",
      createItemBusy: "جارٍ الإبلاغ عن الغرض...",
      commentBusy: "جارٍ إرسال التعليق...",
      itemComments: "التعليقات",
      addComment: "إضافة تعليق",
      media: "الوسائط",
    },
    profileScreen: {
      subtitle: "بيانات الملف الشخصي وتفضيلات الإشعارات.",
      noPhone: "لا يوجد رقم هاتف بعد",
      noBio: "لا توجد نبذة بعد",
      notificationSettings: "إعدادات الإشعارات",
      push: "الدفع",
      chat: "المحادثة",
      support: "الدعم",
      billing: "الفوترة",
      fullName: "الاسم الكامل",
      phone: "رقم الهاتف",
      bio: "نبذة",
      saveProfile: "حفظ الملف",
      savingProfile: "جارٍ حفظ الملف...",
      currentPassword: "كلمة المرور الحالية",
      newPassword: "كلمة المرور الجديدة",
      changePassword: "تغيير كلمة المرور",
      changingPassword: "جارٍ تغيير كلمة المرور...",
      announcements: "الإعلانات",
    },
    feedbackScreen: {
      subtitle: "ملاحظات التمرين والغذاء والنادي المرسلة من حسابك.",
      workout: "ملاحظات التمرين",
      diet: "ملاحظات الغذاء",
      gym: "ملاحظات النادي",
      noWorkout: "لا توجد ملاحظات تمرين بعد.",
      noDiet: "لا توجد ملاحظات غذاء بعد.",
      noGym: "لا توجد ملاحظات للنادي بعد.",
      dietPlan: "خطة غذاء",
    },
    session: {
      title: "جارٍ تشغيل التطبيق",
      subtitle: "يتم استرجاع الجلسة والتحقق من الوصول للنادي.",
      loading: "جاري تحميل حالة الجلسة الآمنة...",
    },
  },
} as const;

type PreferencesContextValue = {
  locale: Locale;
  themeMode: ThemeMode;
  direction: "ltr" | "rtl";
  isRTL: boolean;
  theme: ThemeTokens;
  fontSet: {
    display: string;
    body: string;
    mono: string;
  };
  copy: CopySet;
  toggleLocale: () => Promise<void>;
  toggleThemeMode: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>("en");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");

  useEffect(() => {
    let alive = true;
    async function restore() {
      const storedLocale = await SecureStore.getItemAsync(LOCALE_STORAGE_KEY);
      const storedTheme = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
      if (!alive) {
        return;
      }
      if (storedLocale === "en" || storedLocale === "ar") {
        setLocale(storedLocale);
      }
      if (storedTheme === "light" || storedTheme === "dark") {
        setThemeMode(storedTheme);
      }
    }
    void restore();
    return () => {
      alive = false;
    };
  }, []);

  async function toggleLocale() {
    const next = locale === "en" ? "ar" : "en";
    setLocale(next);
    await SecureStore.setItemAsync(LOCALE_STORAGE_KEY, next);
  }

  async function toggleThemeMode() {
    const next = themeMode === "light" ? "dark" : "light";
    setThemeMode(next);
    await SecureStore.setItemAsync(THEME_STORAGE_KEY, next);
  }

  const value = useMemo<PreferencesContextValue>(() => {
    const direction = locale === "ar" ? "rtl" : "ltr";
    return {
      locale,
      themeMode,
      direction,
      isRTL: direction === "rtl",
      theme: themes[themeMode],
      fontSet: fonts[locale] as { display: string; body: string; mono: string },
      copy: copy[locale],
      toggleLocale,
      toggleThemeMode,
    };
  }, [locale, themeMode]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}
