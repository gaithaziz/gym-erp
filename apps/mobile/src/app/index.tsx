import { Redirect } from "expo-router";

import { useSession } from "@/lib/session";
import { usePreferences } from "@/lib/preferences";
import { Screen, Card, MutedText } from "@/components/ui";

export default function IndexRoute() {
  const { status, error, bootstrap } = useSession();
  const { copy } = usePreferences();
  const isSignedForAnyLocale = Boolean(bootstrap?.policy?.locale_signatures?.en || bootstrap?.policy?.locale_signatures?.ar);

  if (status === "signed_in" && bootstrap?.role === "CUSTOMER" && !isSignedForAnyLocale) {
    return <Redirect href={"/policy" as never} />;
  }

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
