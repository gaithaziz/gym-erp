import { useRouter } from "expo-router";

import { useSession } from "@/lib/session";
import { getCurrentRole, hasCapability, isAdminControlRole, isCustomerRole } from "@/lib/mobile-role";
import { usePreferences } from "@/lib/preferences";
import { Card, MutedText, PrimaryButton, Screen, SecondaryLink, SectionTitle } from "@/components/ui";

export default function MoreTab() {
  const router = useRouter();
  const { bootstrap, signOut } = useSession();
  const { copy } = usePreferences();
  const role = getCurrentRole(bootstrap);
  const customer = isCustomerRole(role);
  const adminControl = isAdminControlRole(role);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <Screen title={copy.more.title} subtitle={copy.more.subtitle}>
      <Card>
        <SectionTitle>{bootstrap?.user.full_name || (customer ? copy.more.customerAccount : copy.staffMore.account)}</SectionTitle>
        <MutedText>{bootstrap?.user.email}</MutedText>
        <MutedText>{bootstrap?.subscription.plan_name || (customer ? copy.common.noActivePlan : copy.staffMore.noAssignedPlan)}</MutedText>
      </Card>

      {customer ? <SecondaryLink href="/billing">{copy.more.billing}</SecondaryLink> : null}
      {adminControl ? <SecondaryLink href="/(tabs)/members">{copy.adminControl.peopleSummary}</SecondaryLink> : null}
      {adminControl ? <SecondaryLink href="/staff-operations">{copy.adminControl.employeeOperations}</SecondaryLink> : null}
      {adminControl ? <SecondaryLink href="/(tabs)/operations">{copy.adminControl.operationsSummary}</SecondaryLink> : null}
      {adminControl ? <SecondaryLink href="/(tabs)/finance">{copy.adminControl.financeSummary}</SecondaryLink> : null}
      {adminControl ? <SecondaryLink href="/approvals">{copy.adminControl.approvalQueue}</SecondaryLink> : null}
      {role === "ADMIN" ? <SecondaryLink href="/admin-audit">{copy.adminControl.auditSummary}</SecondaryLink> : null}
      {adminControl ? <SecondaryLink href="/inventory-summary">{copy.adminControl.inventorySummary}</SecondaryLink> : null}
      <SecondaryLink href="/notifications">{copy.more.notifications}</SecondaryLink>
      {hasCapability(bootstrap, "view_support") ? <SecondaryLink href="/(tabs)/support">{copy.more.support}</SecondaryLink> : null}
      {hasCapability(bootstrap, "view_chat") ? <SecondaryLink href="/chat">{copy.more.chat}</SecondaryLink> : null}
      {(customer || role === "RECEPTION" || role === "FRONT_DESK" || role === "EMPLOYEE") ? <SecondaryLink href="/lost-found">{copy.more.lostFound}</SecondaryLink> : null}
      {role === "COACH" || role === "EMPLOYEE" || role === "RECEPTION" || role === "FRONT_DESK" || role === "CASHIER" ? <SecondaryLink href="/leaves">{copy.operationsScreen.myLeaves}</SecondaryLink> : null}
      {role === "COACH" || adminControl ? <SecondaryLink href="/coach-feedback">{copy.common.feedbackHistory}</SecondaryLink> : null}
      <SecondaryLink href="/profile">{copy.more.profile}</SecondaryLink>
      {customer ? <SecondaryLink href="/feedback">{copy.more.feedback}</SecondaryLink> : null}

      <PrimaryButton onPress={() => void handleSignOut()}>{copy.common.signOut}</PrimaryButton>
    </Screen>
  );
}
