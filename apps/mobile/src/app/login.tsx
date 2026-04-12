import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, Screen, SectionTitle } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [email, setEmail] = useState("alice@client.com");
  const [password, setPassword] = useState("GymPass123!");
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
    <Screen title={copy.login.title} subtitle={copy.login.subtitle}>
      <Card style={[styles.heroCard, { backgroundColor: theme.inverseBackground, borderColor: theme.inverseBackground }]}>
        <Text style={[styles.kicker, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
          {copy.login.kicker}
        </Text>
        <SectionTitle>{copy.login.signIn}</SectionTitle>
        <MutedText>{copy.login.localDemoHint}</MutedText>
      </Card>

      <Card>
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
      </Card>

      <Card>
        <SectionTitle>{copy.login.localDemo}</SectionTitle>
        <MutedText>`alice@client.com` / `GymPass123!` after seeding.</MutedText>
        <MutedText>`admin.demo@gym-erp.com` exists too.</MutedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {},
  kicker: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: "700",
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
