import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { API_BASE_URL } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    kind: "success" | "warning";
    title: string;
    body: string;
  } | null>(null);

  async function requestReset() {
    if (!email.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as { data?: { account_found?: boolean } };
      const accountFound = Boolean(body.data?.account_found);
      setStatus(
        accountFound
          ? {
              kind: "success",
              title: copy.login.resetLinkFoundTitle,
              body: copy.login.resetLinkFoundBody,
            }
          : {
              kind: "warning",
              title: copy.login.resetLinkMissingTitle,
              body: copy.login.resetLinkMissingBody,
            }
      );
    } catch {
      setError(copy.login.resetFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.login.requestResetTitle} compactTitle showSubtitle subtitle={copy.login.requestResetSubtitle}>
      <Card style={[{ gap: 14, backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.display, fontSize: 22, fontWeight: "900", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {copy.login.requestResetTitle}
          </Text>
          <MutedText>{copy.login.requestResetSubtitle}</MutedText>
        </View>

        {status ? (
          <View
            style={[
              {
                gap: 6,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: status.kind === "success" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.28)",
                backgroundColor: status.kind === "success" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.10)",
              },
            ]}
          >
            <Text
              style={{
                color: status.kind === "success" ? "#15803d" : "#b45309",
                textAlign: isRTL ? "right" : "left",
                writingDirection: direction,
                fontFamily: fontSet.body,
                fontWeight: "800",
              }}
            >
              {status.title}
            </Text>
            <Text style={{ color: theme.foreground, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
              {status.body}
            </Text>
          </View>
        ) : null}
        {error ? (
          <Text style={{ color: "#A53A22", textAlign: isRTL ? "right" : "left", writingDirection: direction }}>{error}</Text>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
            {copy.login.email}
          </Text>
          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign="left"
          />
        </View>

        <PrimaryButton onPress={() => void requestReset()} disabled={busy || !email.trim()}>
          {busy ? copy.login.resettingPassword : copy.login.sendResetLink}
        </PrimaryButton>
        <SecondaryButton onPress={() => router.replace("/login" as never)}>
          {copy.login.backToLogin}
        </SecondaryButton>
      </Card>
    </Screen>
  );
}
