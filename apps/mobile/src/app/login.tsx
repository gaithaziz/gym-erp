import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    try {
      setBusy(true);
      setError(null);
      await signIn(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.login.signIn);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.login.title} compactTitle showSubtitle subtitle={copy.login.subtitle}>
      <Card style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.formHeaderText}>
          <Text style={[styles.formTitle, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
            {copy.login.signIn}
          </Text>
          <MutedText>{isRTL ? "ادخل إلى حسابك للمتابعة." : "Sign in to continue."}</MutedText>
        </View>
        <View style={styles.formBlock}>
          <Text style={[styles.label, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
            {copy.login.email}
          </Text>
          <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>
        <View style={styles.formBlock}>
          <Text style={[styles.label, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
            {copy.login.password}
          </Text>
          <Input value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        {error ? <Text style={[styles.error, { textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{error}</Text> : null}
        <PrimaryButton onPress={handleLogin} disabled={busy}>
          {busy ? copy.login.signingIn : copy.login.signInButton}
        </PrimaryButton>
        <SecondaryButton onPress={() => router.push("/diagnostics" as never)}>
          Diagnostics
        </SecondaryButton>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 14,
  },
  formHeaderText: {
    gap: 2,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  formBlock: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: "#A53A22",
    fontSize: 14,
    lineHeight: 20,
  },
});
