import { Redirect } from "expo-router";

import { useSession } from "@/lib/session";
import { usePreferences } from "@/lib/preferences";
import { Screen, Card, MutedText } from "@/components/ui";

export default function IndexRoute() {
  const { status, error } = useSession();
  const { copy } = usePreferences();

  if (status === "signed_in") {
    return <Redirect href="/(tabs)/home" />;
  }

  if (status === "signed_out") {
    return <Redirect href="/login" />;
  }

  return (
    <Screen title={copy.session.title} subtitle={copy.session.subtitle}>
      <Card>
        <MutedText>{error || copy.session.loading}</MutedText>
      </Card>
    </Screen>
  );
}
