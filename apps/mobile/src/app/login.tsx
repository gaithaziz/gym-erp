import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { Card, Input, MutedText, PrimaryButton, Screen } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const glow = useRef(new Animated.Value(0)).current;
  const [email, setEmail] = useState("alice@client.com");
  const [password, setPassword] = useState("GymPass123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [glow]);

  const pulseStyle = {
    opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
    transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }],
  };

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
    <Screen title={copy.login.title} compactTitle accentHeight={0} accentOpacity={0}>
      <View style={[styles.stage, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowOrb,
            styles.glowOrbPrimary,
            { backgroundColor: theme.primary },
            pulseStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowOrb,
            styles.glowOrbSecondary,
            { backgroundColor: theme.primarySoft },
            pulseStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.speedLine,
            styles.speedLineTop,
            { backgroundColor: theme.primary },
            pulseStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.speedLine,
            styles.speedLineBottom,
            { backgroundColor: theme.primary },
            pulseStyle,
          ]}
        />
        <View style={[styles.brandMark, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
          <Animated.View style={[styles.brandPulse, { backgroundColor: theme.primary }, pulseStyle]} />
          <Text style={[styles.brandLetter, { color: "#FFFFFF", fontFamily: fontSet.display }]}>G</Text>
        </View>
        <Text
          style={[
            styles.brandTitle,
            {
              color: theme.foreground,
              fontFamily: fontSet.display,
              textAlign: "center",
              writingDirection: direction,
            },
          ]}
        >
          {copy.login.title}
        </Text>
        <Text style={[styles.brandTagline, { color: theme.primary, fontFamily: fontSet.mono, textAlign: "center", writingDirection: direction }]}>
          {isRTL ? "ادخل. تمرّن. تقدّم." : "Check in. Train hard. Track progress."}
        </Text>
      </View>

      <Card style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.formHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.formHeaderText}>
            <Text style={[styles.formTitle, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {copy.login.signIn}
            </Text>
            <MutedText>{isRTL ? "جاهز للجلسة؟" : "Ready for your session?"}</MutedText>
          </View>
          <View style={[styles.formBolt, { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.formBoltText, { color: theme.primary, fontFamily: fontSet.mono }]}>ERP</Text>
          </View>
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
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
  },
  glowOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  glowOrbPrimary: {
    width: 230,
    height: 230,
    top: -28,
    right: -72,
    opacity: 0.2,
  },
  glowOrbSecondary: {
    width: 180,
    height: 180,
    bottom: -32,
    left: -58,
    opacity: 0.32,
  },
  speedLine: {
    position: "absolute",
    width: 170,
    height: 8,
    borderRadius: 999,
    opacity: 0.32,
    transform: [{ rotate: "-18deg" }],
  },
  speedLineTop: {
    top: 44,
    left: -56,
  },
  speedLineBottom: {
    bottom: 54,
    right: -44,
  },
  brandMark: {
    width: 104,
    height: 104,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  brandPulse: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 999,
    opacity: 0.26,
  },
  brandLetter: {
    fontSize: 54,
    fontWeight: "900",
  },
  brandTitle: {
    marginTop: 18,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  brandTagline: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroCard: {
    gap: 14,
  },
  formHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  formHeaderText: {
    flex: 1,
    gap: 2,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: "900",
  },
  formBolt: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formBoltText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
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
