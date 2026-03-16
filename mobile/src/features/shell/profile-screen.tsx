import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, fetchCurrentUser } from "@/src/core/api/client";
import { getApiErrorMessage } from "@/src/core/api/error-message";
import { resolveProfileImageUrl } from "@/src/core/api/profile-image";
import { useSession } from "@/src/core/auth/use-session";
import { filePickerDriver } from "@/src/core/device/file-picker";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { getRowDirection, getTextAlign } from "@/src/core/i18n/rtl";
import { resolveFontFamily } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { EmptyState } from "@/src/core/ui/empty-state";
import { ErrorState } from "@/src/core/ui/error-state";
import { LoadingState } from "@/src/core/ui/loading-state";
import { SectionCard } from "@/src/core/ui/section-card";
import { openDownloadableResource } from "@/src/modules/downloads/resource-actions";
import { prepareUploadFile } from "@/src/modules/uploads/prepare-upload-file";

const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;
const LATEST_BIOMETRICS_QUERY_KEY = ["fitness", "biometrics", "latest"] as const;

type ProfileFormState = {
  full_name: string;
  phone_number: string;
  date_of_birth: string;
  emergency_contact: string;
  bio: string;
};

type PasswordFormState = {
  current: string;
  next: string;
  confirm: string;
};

type BiometricsFormState = {
  height_cm: string;
  weight_kg: string;
  body_fat_pct: string;
  muscle_mass_kg: string;
};

type BiometricsRow = {
  height_cm?: number | null;
  weight_kg?: number | null;
  body_fat_pct?: number | null;
  muscle_mass_kg?: number | null;
};

function resolveUploadFileName(file: { name?: string | null; mimeType?: string | null }) {
  if (file.name?.trim()) {
    return file.name;
  }

  const mimeType = file.mimeType?.toLowerCase() ?? "";
  if (mimeType.includes("png")) return `profile-${Date.now()}.png`;
  if (mimeType.includes("webp")) return `profile-${Date.now()}.webp`;
  if (mimeType.includes("heic") || mimeType.includes("heif")) return `profile-${Date.now()}.heic`;
  return `profile-${Date.now()}.jpg`;
}

function resolveUploadMimeType(file: { mimeType?: string | null; name?: string | null }) {
  if (file.mimeType?.trim()) {
    return file.mimeType;
  }

  const lowerName = file.name?.toLowerCase() ?? "";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

function normalizeDateInput(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) {
    return value;
  }

  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const year = match[3];
  return `${year}-${month}-${day}`;
}

function computeAge(rawDateOfBirth: string) {
  const normalized = normalizeDateInput(rawDateOfBirth);
  if (!normalized) return null;
  const birthDate = new Date(normalized);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function ProfileScreen() {
  const queryClient = useQueryClient();
  const { direction, locale } = useLocale();
  const { isDark } = useTheme();
  const { user, applyUser } = useSession();

  const txt = useMemo(() => (
    locale === "ar"
      ? {
          title: "ملفي الشخصي",
          subtitle: "إدارة إعدادات حسابك",
          security: "الأمان",
          passwordFields: "حقول كلمة المرور",
          showPasswords: "إظهار كلمات المرور",
          hidePasswords: "إخفاء كلمات المرور",
          currentPassword: "كلمة المرور الحالية",
          newPassword: "كلمة المرور الجديدة",
          confirmPassword: "تأكيد كلمة المرور",
          updatePassword: "تحديث كلمة المرور",
          updating: "جارٍ التحديث...",
          personalDetails: "البيانات الشخصية",
          fullName: "الاسم الكامل",
          emailReadonly: "البريد الإلكتروني (للقراءة فقط)",
          phoneNumber: "رقم الهاتف",
          dateOfBirth: "تاريخ الميلاد",
          ageAuto: "العمر (تلقائي)",
          emergencyContact: "جهة اتصال الطوارئ",
          emergencyPlaceholder: "الاسم - +966 5X XXX XXXX",
          bioNotes: "نبذة / ملاحظات",
          bioPlaceholder: "حدثنا قليلًا عن نفسك وأهدافك الرياضية...",
          saveProfile: "حفظ الملف الشخصي",
          saving: "جارٍ الحفظ...",
          bodyMetrics: "قياسات الجسم",
          heightCm: "الطول (سم)",
          weightKg: "الوزن (كجم)",
          bodyFat: "دهون الجسم (%)",
          muscleMassKg: "الكتلة العضلية (كجم)",
          saveBodyMetrics: "حفظ قياسات الجسم",
          saveBodyMetricsLoading: "جارٍ الحفظ...",
          eg175: "مثال: 175",
          eg75: "مثال: 75",
          eg18: "مثال: 18",
          eg32: "مثال: 32",
          na: "غير متاح",
          profileUpdated: "تم تحديث الملف الشخصي بنجاح",
          profileUpdateFailed: "فشل تحديث الملف الشخصي",
          passwordMismatch: "كلمات المرور الجديدة غير متطابقة",
          passwordChanged: "تم تغيير كلمة المرور بنجاح",
          passwordChangeFailed: "فشل تغيير كلمة المرور",
          bioSaved: "تم حفظ قياسات الجسم بنجاح",
          bioSaveFailed: "فشل حفظ قياسات الجسم",
          photoChanged: "تم تحديث الصورة بنجاح",
          photoChangeFailed: "فشل تحديث الصورة",
          changePhoto: "تغيير الصورة",
          openPhoto: "فتح الصورة",
          photoOpened: "تم فتح الصورة الشخصية.",
          photoOpenFailed: "فشل فتح الصورة الشخصية.",
          adminRole: "مدير",
          coachRole: "مدرب",
          customerRole: "عضو",
          employeeRole: "موظف",
          cashierRole: "كاشير",
          receptionRole: "استقبال",
          frontDeskRole: "مكتب أمامي",
        }
      : {
          title: "My Profile",
          subtitle: "Manage your account settings",
          security: "Security",
          passwordFields: "PASSWORD FIELDS",
          showPasswords: "Show Passwords",
          hidePasswords: "Hide Passwords",
          currentPassword: "CURRENT PASSWORD",
          newPassword: "NEW PASSWORD",
          confirmPassword: "CONFIRM PASSWORD",
          updatePassword: "UPDATE PASSWORD",
          updating: "UPDATING...",
          personalDetails: "Personal Details",
          fullName: "FULL NAME",
          emailReadonly: "EMAIL ADDRESS (READ ONLY)",
          phoneNumber: "PHONE NUMBER",
          dateOfBirth: "DATE OF BIRTH",
          ageAuto: "AGE (AUTO)",
          emergencyContact: "EMERGENCY CONTACT",
          emergencyPlaceholder: "Jane Doe - +1 (555) 123-4567",
          bioNotes: "BIO / NOTES",
          bioPlaceholder: "Tell us a little bit about yourself and your fitness goals...",
          saveProfile: "Save Profile",
          saving: "Saving...",
          bodyMetrics: "Body Metrics",
          heightCm: "HEIGHT (CM)",
          weightKg: "WEIGHT (KG)",
          bodyFat: "BODY FAT (%)",
          muscleMassKg: "MUSCLE MASS (KG)",
          saveBodyMetrics: "Save Body Metrics",
          saveBodyMetricsLoading: "Saving...",
          eg175: "e.g. 175",
          eg75: "e.g. 75",
          eg18: "e.g. 18",
          eg32: "e.g. 32",
          na: "N/A",
          profileUpdated: "Profile updated successfully",
          profileUpdateFailed: "Failed to update profile",
          passwordMismatch: "New passwords do not match",
          passwordChanged: "Password changed successfully",
          passwordChangeFailed: "Failed to change password",
          bioSaved: "Body metrics saved successfully",
          bioSaveFailed: "Failed to save body metrics",
          photoChanged: "Profile picture updated successfully",
          photoChangeFailed: "Failed to update profile picture",
          changePhoto: "Change photo",
          openPhoto: "Open photo",
          photoOpened: "Profile photo opened.",
          photoOpenFailed: "Failed to open profile photo.",
          adminRole: "Admin",
          coachRole: "Coach",
          customerRole: "Member",
          employeeRole: "Employee",
          cashierRole: "Cashier",
          receptionRole: "Reception",
          frontDeskRole: "Front Desk",
        }
  ), [locale]);

  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passMsg, setPassMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [bioMsg, setBioMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);

  const [form, setForm] = useState<ProfileFormState>({
    full_name: "",
    phone_number: "",
    date_of_birth: "",
    emergency_contact: "",
    bio: "",
  });
  const [passwords, setPasswords] = useState<PasswordFormState>({
    current: "",
    next: "",
    confirm: "",
  });
  const [biometrics, setBiometrics] = useState<BiometricsFormState>({
    height_cm: "",
    weight_kg: "",
    body_fat_pct: "",
    muscle_mass_kg: "",
  });

  const profileQuery = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchCurrentUser,
    initialData: user ?? undefined,
  });

  const biometricsQuery = useQuery({
    queryKey: LATEST_BIOMETRICS_QUERY_KEY,
    enabled: !!profileQuery.data,
    queryFn: async (): Promise<BiometricsRow | null> => {
      const response = await api.get("/fitness/biometrics?limit=1&offset=0");
      const rows = (response.data?.data ?? []) as BiometricsRow[];
      return rows[0] ?? null;
    },
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    void applyUser(profileQuery.data);
    setForm({
      full_name: profileQuery.data.full_name ?? "",
      phone_number: profileQuery.data.phone_number ?? "",
      date_of_birth: profileQuery.data.date_of_birth ?? "",
      emergency_contact: profileQuery.data.emergency_contact ?? "",
      bio: profileQuery.data.bio ?? "",
    });
  }, [applyUser, profileQuery.data]);

  useEffect(() => {
    if (!biometricsQuery.data) {
      return;
    }

    setBiometrics({
      height_cm: biometricsQuery.data.height_cm?.toString() ?? "",
      weight_kg: biometricsQuery.data.weight_kg?.toString() ?? "",
      body_fat_pct: biometricsQuery.data.body_fat_pct?.toString() ?? "",
      muscle_mass_kg: biometricsQuery.data.muscle_mass_kg?.toString() ?? "",
    });
  }, [biometricsQuery.data]);

  const reloadProfile = async () => {
    const freshProfile = await queryClient.fetchQuery({
      queryKey: AUTH_ME_QUERY_KEY,
      queryFn: fetchCurrentUser,
    });
    await applyUser(freshProfile);
    return freshProfile;
  };

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      const pickedFile = (await filePickerDriver.pickFile()) as
        | ( {
            uri: string;
            name: string;
            mimeType?: string | null;
            webFile?: File | null;
          })
        | null;

      if (!pickedFile) {
        return null;
      }

      const formData = new FormData();
      const uploadFile = prepareUploadFile(pickedFile);
      const normalizedName = resolveUploadFileName(uploadFile);
      const normalizedMimeType = resolveUploadMimeType({
        name: normalizedName,
        mimeType: uploadFile.mimeType,
      });

      if (pickedFile.webFile) {
        formData.append("file", pickedFile.webFile);
      } else {
        formData.append("file", {
          uri: uploadFile.uri,
          name: normalizedName,
          type: normalizedMimeType,
        } as never);
      }

      await api.post("/auth/me/profile-picture", formData, {
        headers: {
          Accept: "application/json",
        },
      });
      return reloadProfile();
    },
    onSuccess: (result) => {
      if (!result) return;
      setProfileMsg({ type: "success", text: txt.photoChanged });
    },
    onError: (error) => {
      setProfileMsg({
        type: "error",
        text: getApiErrorMessage(error, txt.photoChangeFailed),
      });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      await api.put("/auth/me", {
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim() || null,
        date_of_birth: normalizeDateInput(form.date_of_birth) || null,
        emergency_contact: form.emergency_contact.trim() || null,
        bio: form.bio.trim() || null,
      });
      return reloadProfile();
    },
    onSuccess: () => {
      setProfileMsg({ type: "success", text: txt.profileUpdated });
    },
    onError: (error) => {
      setProfileMsg({
        type: "error",
        text: getApiErrorMessage(error, txt.profileUpdateFailed),
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      await api.put("/auth/me/password", {
        current_password: passwords.current,
        new_password: passwords.next,
      });
    },
    onSuccess: () => {
      setPassMsg({ type: "success", text: txt.passwordChanged });
      setPasswords({ current: "", next: "", confirm: "" });
    },
    onError: (error) => {
      setPassMsg({
        type: "error",
        text: getApiErrorMessage(error, txt.passwordChangeFailed),
      });
    },
  });

  const saveBiometricsMutation = useMutation({
    mutationFn: async () => {
      await api.post("/fitness/biometrics", {
        height_cm: biometrics.height_cm.trim() ? Number.parseFloat(biometrics.height_cm) : null,
        weight_kg: biometrics.weight_kg.trim() ? Number.parseFloat(biometrics.weight_kg) : null,
        body_fat_pct: biometrics.body_fat_pct.trim() ? Number.parseFloat(biometrics.body_fat_pct) : null,
        muscle_mass_kg: biometrics.muscle_mass_kg.trim() ? Number.parseFloat(biometrics.muscle_mass_kg) : null,
      });
      await queryClient.invalidateQueries({ queryKey: LATEST_BIOMETRICS_QUERY_KEY });
    },
    onSuccess: () => {
      setBioMsg({ type: "success", text: txt.bioSaved });
    },
    onError: (error) => {
      setBioMsg({
        type: "error",
        text: getApiErrorMessage(error, txt.bioSaveFailed),
      });
    },
  });

  const roleLabelMap: Record<string, string> = {
    ADMIN: txt.adminRole,
    COACH: txt.coachRole,
    CUSTOMER: txt.customerRole,
    EMPLOYEE: txt.employeeRole,
    CASHIER: txt.cashierRole,
    RECEPTION: txt.receptionRole,
    FRONT_DESK: txt.frontDeskRole,
  };

  if (profileQuery.isLoading && !profileQuery.data) {
    return <LoadingState fullScreen />;
  }

  if (profileQuery.isError) {
    return (
      <AppScreen className="justify-center">
        <ErrorState onRetry={() => void profileQuery.refetch()} />
      </AppScreen>
    );
  }

  if (!profileQuery.data) {
    return (
      <AppScreen className="justify-center">
        <EmptyState title={locale === "ar" ? "الملف غير متاح" : "Profile unavailable"} subtitle={locale === "ar" ? "تعذر تحميل بيانات الملف الشخصي." : "We could not load your profile details."} />
      </AppScreen>
    );
  }

  const profileImageUrl = resolveProfileImageUrl(profileQuery.data.profile_picture_url);
  const initials = (profileQuery.data.full_name ?? profileQuery.data.email).trim().slice(0, 2).toUpperCase();
  const roleLabel = roleLabelMap[profileQuery.data.role] ?? profileQuery.data.role;
  const age = computeAge(form.date_of_birth);
  const fieldClassName = (readOnly = false, multiline = false) =>
    `${multiline ? "min-h-[112px]" : ""} rounded-sm border px-3 py-2.5 text-base ${
      readOnly
        ? isDark
          ? "border-[#2a2f3a] bg-[#1e2329] text-[#cbd5e1]"
          : "border-border bg-muted/50 text-muted-foreground"
        : isDark
          ? "border-[#223047] bg-[#071120] text-[#e6e2dd]"
          : "border-border bg-background text-foreground"
    }`;
  const placeholderColor = isDark ? "#cbd5e1" : "#94a3b8";
  const rowDirection = getRowDirection(direction);
  const inputStyle = {
    writingDirection: direction,
    textAlign: getTextAlign(direction),
    color: isDark ? "#e6e2dd" : "#0c0a09",
    fontFamily: resolveFontFamily(locale, "serif", "regular"),
  } as const;
  const primaryActionColor = isDark ? "#e6e2dd" : "#0c0a09";

  const onRefresh = async () => {
    await Promise.all([profileQuery.refetch(), biometricsQuery.refetch()]);
  };

  const handleOpenPhoto = async () => {
    if (!profileImageUrl) {
      return;
    }

    setProfileMsg(null);
    try {
      await openDownloadableResource(profileImageUrl);
      setProfileMsg({ type: "success", text: txt.photoOpened });
    } catch (error) {
      setProfileMsg({
        type: "error",
        text: error instanceof Error ? error.message : txt.photoOpenFailed,
      });
    }
  };

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 36 }}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isFetching || biometricsQuery.isFetching}
            onRefresh={() => void onRefresh()}
          />
        }
      >
        <View className="gap-1">
          <AppText variant="title">{txt.title}</AppText>
          <AppText variant="subtitle">{txt.subtitle}</AppText>
        </View>

        <SectionCard className="items-center gap-4 px-4 py-6">
          <Pressable
            disabled={uploadPhotoMutation.isPending}
            onPress={() => {
              setProfileMsg(null);
              void uploadPhotoMutation.mutateAsync();
            }}
            className="items-center"
          >
            <View className="h-[124px] w-[124px] overflow-hidden rounded-full border-2 border-[#9ca3af] bg-background">
              {profileImageUrl ? (
                <Image source={{ uri: profileImageUrl }} className="h-full w-full" />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <AppText className="text-3xl font-bold text-primary">{initials}</AppText>
                </View>
              )}
            </View>
          </Pressable>
          <View className="items-center gap-1">
            <AppText className="text-center text-3xl font-bold text-foreground">{profileQuery.data.full_name ?? profileQuery.data.email}</AppText>
            <AppText className="font-mono text-sm text-muted-foreground">{roleLabel}</AppText>
            <Pressable
              disabled={uploadPhotoMutation.isPending}
              onPress={() => {
                setProfileMsg(null);
                void uploadPhotoMutation.mutateAsync();
              }}
            >
              {uploadPhotoMutation.isPending ? (
                <ActivityIndicator color="#ea580c" />
              ) : (
                <AppText className="mt-1 text-xs text-primary">{txt.changePhoto}</AppText>
              )}
            </Pressable>
            {profileImageUrl ? (
              <Pressable
                onPress={() => void handleOpenPhoto()}
                className="mt-1 items-center gap-1"
                style={{ flexDirection: rowDirection }}
              >
                <Feather name="external-link" size={12} color="#ea580c" />
                <AppText className="text-xs text-primary">{txt.openPhoto}</AppText>
              </Pressable>
            ) : null}
          </View>
        </SectionCard>

        <SectionCard className="gap-4 px-4 py-5">
          <View
            className="items-center gap-2 border-b border-border pb-4"
            style={{ flexDirection: rowDirection }}
          >
            <Feather name="lock" size={18} color="#ea580c" />
            <AppText className="text-3xl font-bold text-foreground">{txt.security}</AppText>
          </View>

          <View
            className="items-center justify-between"
            style={{ flexDirection: rowDirection }}
          >
            <AppText variant="label">{txt.passwordFields}</AppText>
            <Pressable
              onPress={() => setShowPasswords((value) => !value)}
              className="items-center gap-1"
              style={{ flexDirection: rowDirection }}
            >
              <Feather name={showPasswords ? "eye-off" : "eye"} size={14} color="#ea580c" />
              <AppText className="text-sm font-semibold text-primary">{showPasswords ? txt.hidePasswords : txt.showPasswords}</AppText>
            </Pressable>
          </View>

          <View className="gap-3">
            <View className="gap-1">
              <AppText variant="label">{txt.currentPassword}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                secureTextEntry={!showPasswords}
                value={passwords.current}
                onChangeText={(value) => setPasswords((current) => ({ ...current, current: value }))}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.newPassword}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                secureTextEntry={!showPasswords}
                value={passwords.next}
                onChangeText={(value) => setPasswords((current) => ({ ...current, next: value }))}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.confirmPassword}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                secureTextEntry={!showPasswords}
                value={passwords.confirm}
                onChangeText={(value) => setPasswords((current) => ({ ...current, confirm: value }))}
                placeholderTextColor={placeholderColor}
              />
            </View>
          </View>

          {passMsg ? (
            <View className={passMsg.type === "success" ? "rounded-sm border border-emerald-300 bg-emerald-50 px-3 py-2" : "rounded-sm border border-danger/30 bg-danger/10 px-3 py-2"}>
              <AppText className={passMsg.type === "success" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-danger"}>
                {passMsg.text}
              </AppText>
            </View>
          ) : null}

          <Pressable
            disabled={updatePasswordMutation.isPending}
            onPress={() => {
              setPassMsg(null);
              if (passwords.next !== passwords.confirm) {
                setPassMsg({ type: "error", text: txt.passwordMismatch });
                return;
              }
              if (!passwords.current || !passwords.next || !passwords.confirm) {
                setPassMsg({ type: "error", text: locale === "ar" ? "جميع حقول كلمة المرور مطلوبة." : "All password fields are required." });
                return;
              }
              void updatePasswordMutation.mutateAsync();
            }}
            className={`min-h-[44px] items-center justify-center border px-4 py-2.5 ${isDark ? "border-[#cbd5e1] bg-transparent" : "border-foreground bg-transparent"}`}
          >
            {updatePasswordMutation.isPending ? (
              <ActivityIndicator color={isDark ? "#cbd5e1" : "#0c0a09"} />
            ) : (
              <AppText className="text-sm font-bold text-foreground">{txt.updatePassword}</AppText>
            )}
          </Pressable>
        </SectionCard>

        <SectionCard className="gap-4 px-4 py-5">
          <View
            className="items-center gap-2 border-b border-border pb-4"
            style={{ flexDirection: rowDirection }}
          >
            <Feather name="user" size={18} color="#ea580c" />
            <AppText className="text-3xl font-bold text-foreground">{txt.personalDetails}</AppText>
          </View>

          <View className="gap-3">
            <View className="gap-1">
              <AppText variant="label">{txt.fullName}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={form.full_name}
                onChangeText={(value) => setForm((current) => ({ ...current, full_name: value }))}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.emailReadonly}</AppText>
              <TextInput
                className={fieldClassName(true)}
                style={[inputStyle, { color: isDark ? "#cbd5e1" : "#57534e" }]}
                editable={false}
                value={profileQuery.data.email}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.phoneNumber}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={form.phone_number}
                onChangeText={(value) => setForm((current) => ({ ...current, phone_number: value }))}
                placeholder={locale === "ar" ? "+966 5X XXX XXXX" : "+1 (555) 000-0000"}
                keyboardType="phone-pad"
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.dateOfBirth}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={form.date_of_birth}
                onChangeText={(value) => setForm((current) => ({ ...current, date_of_birth: value }))}
                placeholder="mm/dd/yyyy"
                autoCapitalize="none"
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.ageAuto}</AppText>
              <TextInput
                className={fieldClassName(true)}
                style={[inputStyle, { color: isDark ? "#cbd5e1" : "#57534e" }]}
                editable={false}
                value={age != null ? `${age}` : txt.na}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.emergencyContact}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={form.emergency_contact}
                onChangeText={(value) => setForm((current) => ({ ...current, emergency_contact: value }))}
                placeholder={txt.emergencyPlaceholder}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.bioNotes}</AppText>
              <TextInput
                className={fieldClassName(false, true)}
                style={inputStyle}
                multiline
                textAlignVertical="top"
                value={form.bio}
                onChangeText={(value) => setForm((current) => ({ ...current, bio: value }))}
                placeholder={txt.bioPlaceholder}
                placeholderTextColor={placeholderColor}
              />
            </View>
          </View>

          {profileMsg ? (
            <View className={profileMsg.type === "success" ? "rounded-sm border border-emerald-300 bg-emerald-50 px-3 py-2" : "rounded-sm border border-danger/30 bg-danger/10 px-3 py-2"}>
              <AppText className={profileMsg.type === "success" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-danger"}>
                {profileMsg.text}
              </AppText>
            </View>
          ) : null}

          <View className="items-end">
            <Pressable
              disabled={saveProfileMutation.isPending}
              onPress={() => {
                setProfileMsg(null);
                void saveProfileMutation.mutateAsync();
              }}
              className="min-h-[44px] min-w-[142px] items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5"
              style={{ flexDirection: rowDirection }}
            >
              {saveProfileMutation.isPending ? (
                <ActivityIndicator color={primaryActionColor} />
              ) : (
                <>
                  <Feather name="save" size={16} color={primaryActionColor} />
                  <AppText className="text-sm font-semibold" style={{ color: primaryActionColor }}>{txt.saveProfile}</AppText>
                </>
              )}
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard className="gap-4 px-4 py-5">
          <View
            className="items-center gap-2 border-b border-border pb-4"
            style={{ flexDirection: rowDirection }}
          >
            <Feather name="activity" size={18} color="#ea580c" />
            <AppText className="text-3xl font-bold text-foreground">{txt.bodyMetrics}</AppText>
          </View>

          <View className="gap-3">
            <View className="gap-1">
              <AppText variant="label">{txt.heightCm}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={biometrics.height_cm}
                onChangeText={(value) => setBiometrics((current) => ({ ...current, height_cm: value }))}
                keyboardType="decimal-pad"
                placeholder={txt.eg175}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.weightKg}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={biometrics.weight_kg}
                onChangeText={(value) => setBiometrics((current) => ({ ...current, weight_kg: value }))}
                keyboardType="decimal-pad"
                placeholder={txt.eg75}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.bodyFat}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={biometrics.body_fat_pct}
                onChangeText={(value) => setBiometrics((current) => ({ ...current, body_fat_pct: value }))}
                keyboardType="decimal-pad"
                placeholder={txt.eg18}
                placeholderTextColor={placeholderColor}
              />
            </View>
            <View className="gap-1">
              <AppText variant="label">{txt.muscleMassKg}</AppText>
              <TextInput
                className={fieldClassName()}
                style={inputStyle}
                value={biometrics.muscle_mass_kg}
                onChangeText={(value) => setBiometrics((current) => ({ ...current, muscle_mass_kg: value }))}
                keyboardType="decimal-pad"
                placeholder={txt.eg32}
                placeholderTextColor={placeholderColor}
              />
            </View>
          </View>

          {bioMsg ? (
            <View className={bioMsg.type === "success" ? "rounded-sm border border-emerald-300 bg-emerald-50 px-3 py-2" : "rounded-sm border border-danger/30 bg-danger/10 px-3 py-2"}>
              <AppText className={bioMsg.type === "success" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-danger"}>
                {bioMsg.text}
              </AppText>
            </View>
          ) : null}

          <View className="items-end">
            <Pressable
              disabled={saveBiometricsMutation.isPending}
              onPress={() => {
                setBioMsg(null);
                void saveBiometricsMutation.mutateAsync();
              }}
              className="min-h-[44px] min-w-[196px] items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5"
              style={{ flexDirection: rowDirection }}
            >
              {saveBiometricsMutation.isPending ? (
                <ActivityIndicator color={primaryActionColor} />
              ) : (
                <>
                  <Feather name="save" size={16} color={primaryActionColor} />
                  <AppText className="text-sm font-semibold" style={{ color: primaryActionColor }}>{txt.saveBodyMetrics}</AppText>
                </>
              )}
            </Pressable>
          </View>
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
