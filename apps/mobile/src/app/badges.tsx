import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseEnvelope, type MobileGamificationStats } from "@/lib/api";
import { localeTag } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type IconName = ComponentProps<typeof Ionicons>["name"];

const BADGE_CATALOG = [
  { type: "STREAK_3", en: "3-Day Streak", ar: "سلسلة 3 أيام", enDesc: "Visit 3 days in a row", arDesc: "زر النادي 3 أيام متتالية" },
  { type: "STREAK_7", en: "Weekly Warrior", ar: "مقاتل الأسبوع", enDesc: "Visit 7 days in a row", arDesc: "زر النادي 7 أيام متتالية" },
  { type: "STREAK_14", en: "Fortnight Force", ar: "قوة الأسبوعين", enDesc: "Visit 14 days in a row", arDesc: "زر النادي 14 يومًا متتاليًا" },
  { type: "STREAK_30", en: "Monthly Machine", ar: "آلة الشهر", enDesc: "Visit 30 days in a row", arDesc: "زر النادي 30 يومًا متتاليًا" },
  { type: "VISITS_10", en: "10 Club Visits", ar: "10 زيارات للنادي", enDesc: "Check in 10 times", arDesc: "سجّل دخول 10 مرات" },
  { type: "VISITS_25", en: "25 Club Visits", ar: "25 زيارة للنادي", enDesc: "Check in 25 times", arDesc: "سجّل دخول 25 مرة" },
  { type: "VISITS_50", en: "50 Club Visits", ar: "50 زيارة للنادي", enDesc: "Check in 50 times", arDesc: "سجّل دخول 50 مرة" },
  { type: "VISITS_100", en: "100 Club", ar: "نادي الـ100", enDesc: "Check in 100 times", arDesc: "سجّل دخول 100 مرة" },
  { type: "VISITS_250", en: "250 Club Legend", ar: "أسطورة الـ250", enDesc: "Check in 250 times", arDesc: "سجّل دخول 250 مرة" },
  { type: "EARLY_BIRD", en: "Early Bird", ar: "الطائر المبكر", enDesc: "Check in before 7 AM", arDesc: "سجّل دخول قبل 7 صباحًا" },
  { type: "NIGHT_OWL", en: "Night Owl", ar: "بومة الليل", enDesc: "Check in after 9 PM", arDesc: "سجّل دخول بعد 9 مساءً" },
];

function badgeIcon(type: string): IconName {
  if (type.startsWith("STREAK")) {
    return "flame-outline";
  }
  if (type.startsWith("VISITS")) {
    return "medal-outline";
  }
  if (type === "EARLY_BIRD") {
    return "sunny-outline";
  }
  if (type === "NIGHT_OWL") {
    return "moon-outline";
  }
  return "star-outline";
}

export default function BadgesScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const statsQuery = useQuery({
    queryKey: ["mobile-gamification"],
    queryFn: async () => parseEnvelope<MobileGamificationStats>(await authorizedRequest("/gamification/stats")).data,
  });
  const stats = statsQuery.data;
  const earnedByType = new Map((stats?.badges ?? []).map((badge) => [badge.badge_type, badge]));

  return (
    <Screen title={copy.home.achievements} subtitle={copy.home.achievementsSubtitle}>
      <QueryState loading={statsQuery.isLoading} error={statsQuery.error instanceof Error ? statsQuery.error.message : null} />
      {stats ? (
        <>
          <Card>
            <SectionTitle>{copy.home.achievements}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.home.currentStreak} value={stats.streak.current_streak} />
              <InlineStat label={copy.home.bestStreak} value={stats.streak.best_streak} />
              <InlineStat label={copy.home.totalVisits} value={stats.total_visits} />
              <InlineStat label={copy.home.unlocked} value={`${stats.badges.length}/${BADGE_CATALOG.length}`} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.home.viewAllBadges}</SectionTitle>
            <View style={[styles.catalogGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {BADGE_CATALOG.map((badge) => {
                const earned = earnedByType.get(badge.type);
                return (
                  <View
                    key={badge.type}
                    style={[
                      styles.badgeCard,
                      {
                        backgroundColor: earned ? theme.primarySoft : theme.cardAlt,
                        borderColor: earned ? theme.primary : theme.border,
                        opacity: earned ? 1 : 0.55,
                      },
                    ]}
                  >
                    <View style={[styles.badgeIconWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <Ionicons name={badgeIcon(badge.type)} size={24} color={earned ? theme.primary : theme.muted} />
                    </View>
                    <Text style={[styles.badgeTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: "center", writingDirection: direction }]}>
                      {isRTL ? badge.ar : badge.en}
                    </Text>
                    <MutedText>{isRTL ? badge.arDesc : badge.enDesc}</MutedText>
                    <Text style={[styles.badgeStatus, { color: earned ? theme.primary : theme.muted, fontFamily: fontSet.mono, textAlign: "center" }]}>
                      {earned?.earned_at ? `${copy.home.earnedOn}: ${new Date(earned.earned_at).toLocaleDateString(locale)}` : copy.home.locked}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  catalogGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  badgeCard: {
    width: "47%",
    minHeight: 178,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  badgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: "900",
  },
  badgeStatus: {
    fontSize: 10,
    fontWeight: "800",
  },
});
