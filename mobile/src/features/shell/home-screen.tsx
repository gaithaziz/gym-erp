import { ScrollView, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";

const roleModules: Record<string, string[]> = {
  ADMIN: [
    "dashboard.nav.dashboard",
    "dashboard.nav.financials",
    "dashboard.nav.staff",
    "dashboard.nav.inventory",
    "dashboard.nav.auditLogs",
  ],
  COACH: [
    "dashboard.nav.dashboard",
    "dashboard.nav.workoutPlans",
    "dashboard.nav.dietPlans",
    "dashboard.nav.workoutDietLibrary",
    "dashboard.nav.feedback",
  ],
  CUSTOMER: [
    "dashboard.nav.subscription",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myWorkoutPlans",
    "dashboard.nav.myDietPlans",
    "dashboard.nav.myProgress",
  ],
  RECEPTION: [
    "dashboard.nav.dashboard",
    "dashboard.nav.receptionRegistration",
    "dashboard.nav.supportDesk",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
  ],
  FRONT_DESK: [
    "dashboard.nav.dashboard",
    "dashboard.nav.receptionRegistration",
    "dashboard.nav.whatsappAutomation",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
  ],
  CASHIER: [
    "dashboard.nav.dashboard",
    "dashboard.nav.cashierPos",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
    "dashboard.nav.myProfile",
  ],
  EMPLOYEE: [
    "dashboard.nav.dashboard",
    "dashboard.nav.cashierPos",
    "dashboard.nav.myQrCode",
    "dashboard.nav.myLeaves",
    "dashboard.nav.myProfile",
  ],
};

export function HomeScreen() {
  const { t } = useLocale();
  const { logout, user } = useSession();
  const modules = roleModules[user?.role ?? ""] ?? ["dashboard.nav.dashboard"];

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.foundationEyebrow")}</AppText>
          <AppText variant="title">{t("mobile.foundationTitle")}</AppText>
          <AppText variant="subtitle">{t("mobile.roleSummaryBody")}</AppText>

          <View className="mt-2 flex-row flex-wrap gap-2">
            <View className="rounded-full bg-accent px-3 py-2">
              <AppText className="text-xs font-semibold text-white">{user?.role ?? "-"}</AppText>
            </View>
            <View className="rounded-full border border-border bg-white px-3 py-2">
              <AppText className="text-xs text-ink">{t("mobile.activeNow")}</AppText>
            </View>
          </View>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.availableModules")}</AppText>
          <AppText className="text-muted">{t("mobile.moduleHint")}</AppText>
          <View className="gap-3">
            {modules.map((moduleKey) => (
              <View key={moduleKey} className="rounded-3xl border border-border bg-white px-4 py-4">
                <AppText className="font-semibold text-ink">{t(moduleKey as never)}</AppText>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard className="gap-3">
          <AppText variant="label">{t("mobile.nextMilestone")}</AppText>
          <View className="gap-2">
            <AppText>{t("mobile.sessionReady")}</AppText>
            <AppText>{t("mobile.localeReady")}</AppText>
            <AppText>{t("mobile.contractsReady")}</AppText>
          </View>
          <AppText className="text-muted">{t("mobile.nextMilestoneBody")}</AppText>
        </SectionCard>

        <AppButton title={t("common.logout")} variant="secondary" onPress={logout} />
      </ScrollView>
    </AppScreen>
  );
}
