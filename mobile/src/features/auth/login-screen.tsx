import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { useLocale } from "@/src/core/i18n/locale-provider";
import { useSession } from "@/src/core/auth/use-session";
import { AppButton } from "@/src/core/ui/app-button";
import { AppScreen } from "@/src/core/ui/app-screen";
import { AppText } from "@/src/core/ui/app-text";
import { SectionCard } from "@/src/core/ui/section-card";

export function LoginScreen() {
  const { locale, setLocale, direction, t } = useLocale();
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleLocale = async () => {
    await setLocale(locale === "en" ? "ar" : "en");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      await login({ email, password });
    } catch {
      setError(t("mobile.signInFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen className="justify-center">
      <SectionCard className="gap-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="max-w-[72%] gap-1">
            <AppText variant="label">{t("mobile.foundationEyebrow")}</AppText>
            <AppText variant="title">{t("mobile.welcomeBack")}</AppText>
            <AppText variant="subtitle">{t("mobile.signInHint")}</AppText>
          </View>
          <Pressable
            onPress={toggleLocale}
            className="rounded-full border border-border bg-white px-4 py-2"
          >
            <AppText>{locale === "en" ? "AR" : "EN"}</AppText>
          </Pressable>
        </View>

        <View className="rounded-3xl border border-accent/20 bg-white/80 p-4">
          <AppText variant="label">{t("common.appName")}</AppText>
          <AppText className="mt-1 text-base text-ink">{t("mobile.foundationSubtitle")}</AppText>
        </View>

        <View className="gap-3">
          <AppText variant="label">{t("login.email")}</AppText>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t("mobile.emailPlaceholder")}
            value={email}
            onChangeText={setEmail}
            className="rounded-2xl border border-border bg-white px-4 py-3 text-base text-ink"
            style={{ textAlign: direction === "rtl" ? "right" : "left" }}
          />
        </View>

        <View className="gap-3">
          <AppText variant="label">{t("login.password")}</AppText>
          <TextInput
            secureTextEntry
            placeholder={t("mobile.passwordPlaceholder")}
            value={password}
            onChangeText={setPassword}
            className="rounded-2xl border border-border bg-white px-4 py-3 text-base text-ink"
            style={{ textAlign: direction === "rtl" ? "right" : "left" }}
          />
        </View>

        {error ? <AppText className="text-danger">{error}</AppText> : null}

        <AppButton title={t("login.signIn")} loading={submitting} onPress={handleSubmit} />
      </SectionCard>
    </AppScreen>
  );
}
