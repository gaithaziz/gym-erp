import { useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, fetchCurrentUser } from "@/src/core/api/client";
import { getApiErrorMessage } from "@/src/core/api/error-message";
import { resolveProfileImageUrl } from "@/src/core/api/profile-image";
import { useSession } from "@/src/core/auth/use-session";
import { filePickerDriver } from "@/src/core/device/file-picker";
import { fileOpenDriver } from "@/src/core/device/file-open";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { EmptyState } from "@/src/core/ui/empty-state";
import { ErrorState } from "@/src/core/ui/error-state";
import { LoadingState } from "@/src/core/ui/loading-state";
import { SectionCard } from "@/src/core/ui/section-card";

const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

type ProfileFormState = {
  full_name: string;
  phone_number: string;
  date_of_birth: string;
  emergency_contact: string;
  bio: string;
};

export function ProfileScreen() {
  const queryClient = useQueryClient();
  const { locale, t } = useLocale();
  const { user, applyUser } = useSession();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<ProfileFormState>({
    full_name: "",
    phone_number: "",
    date_of_birth: "",
    emergency_contact: "",
    bio: "",
  });

  const query = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchCurrentUser,
    initialData: user ?? undefined,
  });

  useEffect(() => {
    if (!query.data) return;

    void applyUser(query.data);
    setForm({
      full_name: query.data.full_name ?? "",
      phone_number: query.data.phone_number ?? "",
      date_of_birth: query.data.date_of_birth ?? "",
      emergency_contact: query.data.emergency_contact ?? "",
      bio: query.data.bio ?? "",
    });
  }, [applyUser, query.data]);

  const reloadProfile = async () => {
    const freshProfile = await queryClient.fetchQuery({
      queryKey: AUTH_ME_QUERY_KEY,
      queryFn: fetchCurrentUser,
    });
    await applyUser(freshProfile);
    return freshProfile;
  };

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      await api.put("/auth/me", {
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim() || null,
        date_of_birth: form.date_of_birth.trim() || null,
        emergency_contact: form.emergency_contact.trim() || null,
        bio: form.bio.trim() || null,
      });
      return reloadProfile();
    },
    onSuccess: () => {
      setMessage({ type: "success", text: t("mobile.profileSaved") });
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, t("mobile.profileSaveFailed")),
      });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      const pickedFile = (await filePickerDriver.pickFile()) as
        | ({
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
      if (pickedFile.webFile) {
        formData.append("file", pickedFile.webFile);
      } else {
        formData.append("file", {
          uri: pickedFile.uri,
          name: pickedFile.name,
          type: pickedFile.mimeType ?? "image/jpeg",
        } as never);
      }

      await api.post("/auth/me/profile-picture", formData);
      return reloadProfile();
    },
    onSuccess: (result) => {
      if (!result) return;
      setMessage({ type: "success", text: t("mobile.profilePhotoSaved") });
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, t("mobile.profilePhotoFailed")),
      });
    },
  });

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
        <EmptyState title={t("mobile.profileUnavailable")} subtitle={t("mobile.profileUnavailableBody")} />
      </AppScreen>
    );
  }

  const profileImageUrl = resolveProfileImageUrl(query.data.profile_picture_url);
  const initials = (query.data.full_name ?? query.data.email).trim().slice(0, 2).toUpperCase();
  const isSaving = saveProfileMutation.isPending || uploadPhotoMutation.isPending;
  const age = form.date_of_birth
    ? Math.max(
        0,
        new Date().getFullYear() - new Date(form.date_of_birth).getFullYear(),
      )
    : null;

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={query.isFetching && !isSaving} onRefresh={() => void query.refetch()} />}
      >
        <View className="gap-1">
          <AppText variant="title">{t("dashboard.nav.myProfile")}</AppText>
          <AppText variant="subtitle">{t("mobile.profileBody")}</AppText>
        </View>

        <SectionCard className="gap-4">
          <View className="flex-row items-center gap-4">
            {profileImageUrl ? (
              <Image source={{ uri: profileImageUrl }} className="h-20 w-20 rounded-full border border-border bg-card" />
            ) : (
              <View className="h-20 w-20 items-center justify-center rounded-full border border-border bg-background">
                <AppText className="text-2xl font-semibold text-primary">{initials}</AppText>
              </View>
            )}

            <View className="flex-1 gap-1">
              <AppText variant="label">{t("dashboard.nav.myProfile")}</AppText>
              <AppText variant="title">{query.data.full_name ?? query.data.email}</AppText>
              <AppText className="text-muted-foreground">{query.data.email}</AppText>
              <AppText className="font-mono text-xs uppercase text-muted-foreground">{query.data.role}</AppText>
            </View>
          </View>

          <AppButton
            title={uploadPhotoMutation.isPending ? t("common.loading") : t("mobile.profileChangePhoto")}
            variant="secondary"
            loading={uploadPhotoMutation.isPending}
            onPress={() => {
              setMessage(null);
              void uploadPhotoMutation.mutateAsync();
            }}
          />
          {profileImageUrl ? (
            <AppButton
              title={locale === "ar" ? "فتح الصورة" : "Open photo"}
              variant="secondary"
              onPress={() => {
                void fileOpenDriver.open(profileImageUrl);
              }}
            />
          ) : null}
        </SectionCard>

        {message ? (
          <SectionCard className={message.type === "success" ? "border-emerald-200 bg-emerald-50" : "border-danger/20 bg-danger/5"}>
            <AppText className={message.type === "success" ? "font-semibold text-emerald-700" : "font-semibold text-danger"}>
              {message.text}
            </AppText>
          </SectionCard>
        ) : null}

        <SectionCard className="gap-4">
          <View className="rounded-lg border border-border bg-background p-4">
            <View className="flex-row flex-wrap gap-4">
              <View className="min-w-[96px] gap-1">
                <AppText variant="label">{t("mobile.emailAddress")}</AppText>
                <AppText className="font-mono text-sm text-foreground">{query.data.email}</AppText>
              </View>
              <View className="min-w-[72px] gap-1">
                <AppText variant="label">{locale === "ar" ? "العمر" : "Age"}</AppText>
                <AppText className="font-mono text-sm text-foreground">{age ?? "--"}</AppText>
              </View>
            </View>
          </View>

          <AppText variant="label">{t("mobile.profileEditFields")}</AppText>

          <View className="gap-3">
            <View className="gap-2">
              <AppText variant="label">{t("mobile.profileFullName")}</AppText>
              <TextInput
                className="rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
                value={form.full_name}
                onChangeText={(value) => setForm((current) => ({ ...current, full_name: value }))}
                placeholder={t("mobile.profileFullName")}
              />
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("mobile.emailAddress")}</AppText>
              <TextInput
                className="rounded-lg border border-border bg-muted px-4 py-3 text-base text-muted-foreground"
                editable={false}
                value={query.data.email}
              />
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("mobile.phoneNumber")}</AppText>
              <TextInput
                className="rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
                value={form.phone_number}
                onChangeText={(value) => setForm((current) => ({ ...current, phone_number: value }))}
                placeholder={t("mobile.profilePhonePlaceholder")}
                keyboardType="phone-pad"
              />
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("mobile.dateOfBirth")}</AppText>
              <TextInput
                className="rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
                value={form.date_of_birth}
                onChangeText={(value) => setForm((current) => ({ ...current, date_of_birth: value }))}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("mobile.emergencyContact")}</AppText>
              <TextInput
                className="rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
                value={form.emergency_contact}
                onChangeText={(value) => setForm((current) => ({ ...current, emergency_contact: value }))}
                placeholder={t("mobile.profileEmergencyPlaceholder")}
              />
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("mobile.bio")}</AppText>
              <TextInput
                className="min-h-28 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
                multiline
                textAlignVertical="top"
                value={form.bio}
                onChangeText={(value) => setForm((current) => ({ ...current, bio: value }))}
                placeholder={t("mobile.profileBioPlaceholder")}
              />
            </View>
          </View>

          <AppButton
            title={saveProfileMutation.isPending ? t("common.loading") : t("mobile.profileSaveAction")}
            loading={saveProfileMutation.isPending}
            onPress={() => {
              setMessage(null);
              void saveProfileMutation.mutateAsync();
            }}
          />
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
