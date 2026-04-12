import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, ValueText } from "@/components/ui";
import { parseHomeEnvelope } from "@/lib/api";
import { localeTag, localizeSubscriptionStatus } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function HomeTab() {
  const router = useRouter();
  const { bootstrap, authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const homeQuery = useQuery({
    queryKey: ["mobile-home"],
    queryFn: async () => parseHomeEnvelope(await authorizedRequest("/mobile/customer/home")).data,
  });

  const home = homeQuery.data;
  const firstName = bootstrap?.user.full_name ? bootstrap.user.full_name.split(" ")[0] : "";
  const title = isRTL ? `${copy.home.greeting}${firstName ? `، ${firstName}` : ""}` : `${copy.home.greeting}${firstName ? `, ${firstName}` : ""}`;
  const locale = localeTag(isRTL);
  const localizedSubscriptionStatus = localizeSubscriptionStatus(home?.subscription.status, isRTL);

  return (
    <Screen
      title={title}
      subtitle={bootstrap?.gym.gym_name || copy.home.subtitle}
      action={
        <Pressable onPress={() => router.push("/billing")} style={[styles.badge, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.badgeText, { color: theme.foreground, fontFamily: fontSet.mono }]}>{copy.home.billingBadge}</Text>
        </Pressable>
      }
    >
      <QueryState loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {home ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <View style={[styles.heroHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.heroTextBlock}>
                <Text
                  style={[
                    styles.heroKicker,
                    { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                  ]}
                >
                  {copy.home.subscription}
                </Text>
                <Text
                  style={[
                    styles.heroStatus,
                    { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                  ]}
                >
                  {localizedSubscriptionStatus}
                </Text>
              </View>
              <Pressable onPress={() => router.push("/billing")} style={[styles.compactBadge, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
                <Text style={[styles.compactBadgeText, { color: theme.primary, fontFamily: fontSet.mono }]}>{copy.home.billingBadge}</Text>
              </Pressable>
            </View>

            <View style={[styles.heroMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.heroMetaBlock}>
                <MutedText>{copy.home.plan}</MutedText>
                <Text
                  style={[
                    styles.heroPlan,
                    { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                  ]}
                >
                  {home.subscription.plan_name || copy.common.noActivePlan}
                </Text>
              </View>
              <View style={styles.heroMetaBlock}>
                <MutedText>{copy.home.status}</MutedText>
                <Text
                  style={[
                    styles.heroStatusTag,
                    { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                  ]}
                >
                  {localizedSubscriptionStatus}
                </Text>
              </View>
            </View>

            <PrimaryButton onPress={() => router.push("/billing")}>{copy.home.renew}</PrimaryButton>
          </Card>

          <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <InlineStat label={copy.home.workoutPlans} value={home.quick_stats.active_workout_plans} />
            <InlineStat label={copy.home.dietPlans} value={home.quick_stats.active_diet_plans} />
            <InlineStat label={copy.home.checkIns} value={home.quick_stats.recent_check_ins} />
            <InlineStat label={copy.home.unreadChat} value={home.quick_stats.unread_chat_messages} />
          </View>

          <Card>
            <SectionTitle>{copy.home.latestBiometric}</SectionTitle>
            {home.latest_biometric ? (
              <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View>
                  <MutedText>{copy.home.weight}</MutedText>
                  <ValueText>{home.latest_biometric.weight_kg ?? "--"} kg</ValueText>
                </View>
                <View>
                  <MutedText>{copy.home.bodyFat}</MutedText>
                  <ValueText>{home.latest_biometric.body_fat_pct ?? "--"}%</ValueText>
                </View>
              </View>
            ) : (
              <MutedText>{copy.home.noBiometrics}</MutedText>
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.home.recentReceipts}</SectionTitle>
            {home.recent_receipts.length === 0 ? (
              <MutedText>{copy.home.noReceipts}</MutedText>
            ) : (
              home.recent_receipts.map((receipt) => (
                <View key={receipt.id} style={[styles.listRow, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={styles.listTextBlock}>
                    <Text
                      style={[
                        styles.listTitle,
                        { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction },
                      ]}
                    >
                      {receipt.description}
                    </Text>
                    <MutedText>{new Date(receipt.date).toLocaleDateString(locale)}</MutedText>
                  </View>
                  <Text style={[styles.amountText, { color: theme.primary, fontFamily: fontSet.mono }]}>{receipt.amount}</Text>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
  },
  heroCard: {
    paddingVertical: 14,
  },
  heroHeader: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  heroTextBlock: {
    flex: 1,
    gap: 4,
  },
  heroKicker: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  heroStatus: {
    fontSize: 22,
    fontWeight: "800",
  },
  heroMeta: {
    justifyContent: "space-between",
    gap: 12,
  },
  heroMetaBlock: {
    flex: 1,
    gap: 2,
  },
  heroPlan: {
    fontSize: 15,
    fontWeight: "600",
  },
  heroStatusTag: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  compactBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactBadgeText: {
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
  },
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  listRow: {
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  listTextBlock: {
    flex: 1,
  },
  amountText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
