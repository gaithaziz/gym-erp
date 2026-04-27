import { useRouter } from "expo-router";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { SessionError, useSession } from "@/lib/session";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const { copy, direction, fontSet, isRTL, locale, theme } = usePreferences();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function handleLogin() {
    if (!canSubmit) {
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await signIn(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (caught) {
      if (caught instanceof SessionError) {
        switch (caught.code) {
          case "invalid_credentials":
            setError(copy.login.invalidCredentials);
            break;
          case "connection_issue":
            setError(copy.login.connectionIssue);
            break;
          case "rate_limited":
            setError(copy.login.tooManyAttempts);
            break;
          case "account_issue":
            setError(copy.login.accountAccessIssue);
            break;
          case "server_issue":
            setError(copy.login.serverIssue);
            break;
          case "restore_failed":
          case "bootstrap_failed":
          case "unexpected":
          default:
            setError(copy.login.signInFailed);
            break;
        }
      } else {
        setError(copy.login.signInFailed);
      }
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
          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign="left"
            style={styles.ltrInput}
          />
        </View>
        <View style={styles.formBlock}>
          <Text style={[styles.label, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
            {copy.login.password}
          </Text>
          <View style={styles.passwordRow}>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => {
                void handleLogin();
              }}
              textAlign="left"
              style={[styles.ltrInput, locale === "ar" ? styles.passwordInputWithRightToggle : styles.passwordInputWithLeftToggle]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? copy.login.hidePassword : copy.login.showPassword}
              onPress={() => setPasswordVisible((current) => !current)}
              style={[
                styles.passwordToggle,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.cardAlt,
                  right: locale === "ar" ? 10 : undefined,
                  left: locale === "ar" ? undefined : 10,
                },
              ]}
            >
              <Ionicons name={passwordVisible ? "eye-off-outline" : "eye-outline"} size={18} color={theme.primary} />
            </Pressable>
          </View>
        </View>
        {error ? <Text style={[styles.error, { textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{error}</Text> : null}
        <PrimaryButton onPress={() => void handleLogin()} disabled={!canSubmit}>
          {busy ? copy.login.signingIn : copy.login.signInButton}
        </PrimaryButton>
        {__DEV__ ? (
          <SecondaryButton onPress={() => router.push("/diagnostics" as never)}>
            Diagnostics
          </SecondaryButton>
        ) : null}
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
  ltrInput: {
    textAlign: "left",
    writingDirection: "ltr",
  },
  passwordRow: {
    position: "relative",
  },
  passwordInputWithRightToggle: {
    paddingRight: 52,
  },
  passwordInputWithLeftToggle: {
    paddingLeft: 52,
  },
  passwordToggle: {
    position: "absolute",
    top: "50%",
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -16 }],
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
