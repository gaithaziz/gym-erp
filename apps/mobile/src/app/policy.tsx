import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Card, Input, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type PolicySection = {
  title: string;
  points: string[];
};

type PolicyPayload = {
  version?: string;
  title: string;
  effectiveDate: string;
  updatedAt: string;
  intro: string;
  sections: PolicySection[];
  footerNote: string;
};

type PolicySignature = {
  version: string;
  signedAt: string;
  signerName: string;
  accepted: true;
};

export default function MobilePolicyScreen() {
  const router = useRouter();
  const { bootstrap, authorizedRequest, refreshBootstrap, markPolicySignatureAccepted } = useSession();
  const { direction, fontSet, isRTL, locale, theme } = usePreferences();
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);
  const [signerName, setSignerName] = useState(bootstrap?.user.full_name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const policyLocale = locale === "ar" ? "ar" : "en";

  const txt = locale === "ar"
    ? {
        title: "السياسة والعقد",
        subtitle: "يجب توقيع عقد العضوية قبل متابعة بقية التطبيق.",
        signerName: "اسم الموقّع",
        sign: "توقيع العقد",
        signing: "جارٍ التوقيع...",
        signed: "موقّع",
        unsigned: "غير موقّع",
        continue: "العودة إلى التطبيق",
        version: "الإصدار",
        effectiveDate: "تاريخ السريان",
        updatedAt: "آخر تحديث",
        note: "بعد التوقيع ستعود إلى التطبيق مباشرة.",
        loading: "جارٍ تحميل السياسة...",
        actionRequired: "يلزم التوقيع للمتابعة.",
      }
    : {
        title: "Policy & Contract",
        subtitle: "The membership contract must be signed before you can use the rest of the app.",
        signerName: "Signer name",
        sign: "Sign Contract",
        signing: "Signing...",
        signed: "Signed",
        unsigned: "Unsigned",
        continue: "Return to app",
        version: "Version",
        effectiveDate: "Effective date",
        updatedAt: "Updated at",
        note: "After signing, you will return to the app immediately.",
        loading: "Loading policy...",
        actionRequired: "Signature required to continue.",
      };

  useEffect(() => {
    const load = async () => {
      if (!bootstrap?.user.id) return;
      try {
        const policyRes = await authorizedRequest<PolicyPayload>(`/membership/policy?locale=${policyLocale}`, { method: "GET" });
        const policyData = policyRes.data;
        setPolicy(policyData);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : txt.loading);
      }
    };
    void load();
    setSignerName(bootstrap?.user.full_name || "");
  }, [authorizedRequest, bootstrap?.user.id, bootstrap?.user.full_name, locale, txt.loading]);

  const policyVersion = policy?.version || bootstrap?.policy.current_policy_version || "1.0";
  const isSigned = Boolean(bootstrap?.policy?.locale_signatures?.en || bootstrap?.policy?.locale_signatures?.ar);
  const returnToApp = async () => {
    await refreshBootstrap().catch(() => undefined);
    router.replace("/(tabs)/home");
  };
  const handleSign = async () => {
    if (!bootstrap?.user.id || !signerName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await authorizedRequest<PolicySignature>(`/membership/policy/signature?locale=${policyLocale}`, {
        method: "POST",
        body: JSON.stringify({ signerName: signerName.trim(), accepted: true }),
      });
      await markPolicySignatureAccepted(policyLocale, response.data.version || policyVersion).catch(() => undefined);
      await returnToApp();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : txt.actionRequired);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={txt.title} subtitle={txt.subtitle} showSubtitle hideFloatingChat scrollable={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { borderColor: isSigned ? "#10B981" : "#F59E0B" }]}>
              <Ionicons name={isSigned ? "checkmark-circle-outline" : "lock-closed-outline"} size={16} color={isSigned ? "#10B981" : "#F59E0B"} />
              <Text style={[styles.statusText, { color: theme.foreground, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                {isSigned ? txt.signed : txt.unsigned}
              </Text>
            </View>
            <Text style={[styles.noteText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {txt.note}
            </Text>
          </View>

          <View style={styles.metaGrid}>
            <View style={[styles.metaCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.metaLabel, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{txt.version}</Text>
              <Text style={[styles.metaValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{policyVersion}</Text>
            </View>
            <View style={[styles.metaCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.metaLabel, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{txt.effectiveDate}</Text>
              <Text style={[styles.metaValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                {policy ? new Date(policy.effectiveDate).toLocaleDateString(locale) : txt.loading}
              </Text>
            </View>
            <View style={[styles.metaCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.metaLabel, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{txt.updatedAt}</Text>
              <Text style={[styles.metaValue, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                {policy ? new Date(policy.updatedAt).toLocaleDateString(locale) : txt.loading}
              </Text>
            </View>
          </View>

          <View style={styles.formBlock}>
            <Text style={[styles.label, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {txt.signerName}
            </Text>
            <Input value={signerName} onChangeText={setSignerName} autoCapitalize="words" />
          </View>

          {error ? <Text style={[styles.error, { textAlign: isRTL ? "right" : "left" }]}>{error}</Text> : null}

          <PrimaryButton onPress={() => void handleSign()} disabled={busy || !signerName.trim()}>
            {busy ? txt.signing : txt.sign}
          </PrimaryButton>
          <SecondaryButton onPress={() => void returnToApp()}>
            {txt.continue}
          </SecondaryButton>
        </Card>

        {policy ? (
          <View style={styles.policyList}>
            <Card style={{ borderColor: theme.border, backgroundColor: theme.card }}>
              <Text style={[styles.policyTitle, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{policy.title}</Text>
              <View style={{ marginTop: 6 }}>
                <Text style={[styles.policyIntro, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{policy.intro}</Text>
              </View>
            </Card>
            {policy.sections.map((section) => (
              <Card key={section.title} style={{ borderColor: theme.border, backgroundColor: theme.card }}>
                <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{section.title}</Text>
                <View style={styles.pointList}>
                  {section.points.map((point) => (
                    <Text key={point} style={[styles.point, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      • {point}
                    </Text>
                  ))}
                </View>
              </Card>
            ))}
            <Card style={{ borderColor: theme.border, backgroundColor: theme.card }}>
              <Text style={[styles.footerText, { color: theme.muted, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{policy.footerNote}</Text>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 16,
  },
  statusRow: {
    gap: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  metaGrid: {
    gap: 10,
  },
  metaCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  formBlock: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: "#DC2626",
    fontSize: 13,
    lineHeight: 18,
  },
  policyList: {
    gap: 12,
    marginTop: 16,
  },
  policyTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  policyIntro: {
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  pointList: {
    gap: 8,
  },
  point: {
    fontSize: 13,
    lineHeight: 19,
  },
  footerText: {
    fontSize: 13,
    lineHeight: 19,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 19,
  },
});
