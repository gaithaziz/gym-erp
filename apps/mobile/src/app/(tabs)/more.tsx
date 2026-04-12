import { useRouter } from "expo-router";

import { useSession } from "@/lib/session";
import { usePreferences } from "@/lib/preferences";
import { Card, MutedText, PrimaryButton, Screen, SecondaryLink, SectionTitle } from "@/components/ui";

export default function MoreTab() {
  const router = useRouter();
  const { bootstrap, signOut } = useSession();
  const { copy } = usePreferences();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <Screen title={copy.more.title} subtitle={copy.more.subtitle}>
      <Card>
        <SectionTitle>{bootstrap?.user.full_name || copy.more.customerAccount}</SectionTitle>
        <MutedText>{bootstrap?.user.email}</MutedText>
        <MutedText>{bootstrap?.subscription.plan_name || copy.common.noActivePlan}</MutedText>
      </Card>

      <SecondaryLink href="/billing">{copy.more.billing}</SecondaryLink>
      <SecondaryLink href="/notifications">{copy.more.notifications}</SecondaryLink>
      <SecondaryLink href="/support">{copy.more.support}</SecondaryLink>
      <SecondaryLink href="/chat">{copy.more.chat}</SecondaryLink>
      <SecondaryLink href="/lost-found">{copy.more.lostFound}</SecondaryLink>
      <SecondaryLink href="/profile">{copy.more.profile}</SecondaryLink>
      <SecondaryLink href="/feedback">{copy.more.feedback}</SecondaryLink>

      <PrimaryButton onPress={() => void handleSignOut()}>{copy.common.signOut}</PrimaryButton>
    </Screen>
  );
}
