import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { API_BASE_URL } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const value = params.token;
    return Array.isArray(value) ? value[0] : value || "";
  }, [params.token]);
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : copy.login.tokenMissing);
  const [message, setMessage] = useState<string | null>(null);

  async function resetPassword() {
    if (!token) {
      setError(copy.login.tokenMissing);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(copy.login.passwordsNoMatch);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      setMessage(copy.login.resetSuccess);
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError(copy.login.resetFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.login.resetTitle} compactTitle showSubtitle subtitle={copy.login.resetSubtitle}>
      <Card style={[{ gap: 14, backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.display, fontSize: 22, fontWeight: "900", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {copy.login.resetTitle}
          </Text>
          <MutedText>{copy.login.resetSubtitle}</MutedText>
        </View>

        {!token ? (
          <Text style={{ color: "#A53A22", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>{error}</Text>
        ) : null}
        {message ? (
          <Text style={{ color: theme.primary, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>{message}</Text>
        ) : null}
        {error && token ? (
          <Text style={{ color: "#A53A22", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>{error}</Text>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {copy.login.newPassword}
          </Text>
          <Input
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            textAlign="left"
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {copy.login.confirmPassword}
          </Text>
          <Input
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            textAlign="left"
          />
        </View>

        <PrimaryButton onPress={() => void resetPassword()} disabled={busy || !token}>
          {busy ? copy.login.resettingPassword : copy.login.resetPassword}
        </PrimaryButton>
        <SecondaryButton onPress={() => router.replace("/login" as never)}>
          {copy.login.backToLogin}
        </SecondaryButton>
      </Card>
    </Screen>
  );
}
