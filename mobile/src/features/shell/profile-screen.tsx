import { ScrollView, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";
import { ShellHero } from "@/src/features/shell/shell-hero";

function valueOrFallback(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

export function ProfileScreen() {
  const { t } = useLocale();
  const { user } = useSession();
  const fallback = t("mobile.notProvided");

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ShellHero
          eyebrow={t("mobile.foundationEyebrow")}
          title={t("mobile.profileTitle")}
          subtitle={t("mobile.profileBody")}
        />

        <SectionCard className="gap-2">
          <AppText variant="label">{t("mobile.signedInAs")}</AppText>
          <AppText variant="title">{valueOrFallback(user?.full_name, user?.email ?? "-")}</AppText>
          <AppText className="text-muted">{user?.email ?? "-"}</AppText>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.profileFields")}</AppText>
          <View className="gap-3">
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText variant="label">{t("mobile.emailAddress")}</AppText>
              <AppText>{valueOrFallback(user?.email, fallback)}</AppText>
            </View>
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText variant="label">{t("mobile.phoneNumber")}</AppText>
              <AppText>{valueOrFallback(user?.phone_number, fallback)}</AppText>
            </View>
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText variant="label">{t("mobile.emergencyContact")}</AppText>
              <AppText>{valueOrFallback(user?.emergency_contact, fallback)}</AppText>
            </View>
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText variant="label">{t("mobile.dateOfBirth")}</AppText>
              <AppText>{valueOrFallback(user?.date_of_birth, fallback)}</AppText>
            </View>
            <View className="rounded-3xl border border-border bg-white px-4 py-4">
              <AppText variant="label">{t("mobile.bio")}</AppText>
              <AppText>{valueOrFallback(user?.bio, fallback)}</AppText>
            </View>
          </View>
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}
