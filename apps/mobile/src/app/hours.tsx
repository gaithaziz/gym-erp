import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Card, MutedText, QueryState, Screen, SecondaryButton, SectionTitle } from "@/components/ui";
import { parseHomeEnvelope } from "@/lib/api";
import { localeTag, localizeWeekday } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

export default function HoursScreen() {
  const router = useRouter();
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);

  const homeQuery = useQuery({
    queryKey: ["mobile-hours"],
    queryFn: async () => parseHomeEnvelope(await authorizedRequest("/mobile/customer/home")).data,
  });

  const home = homeQuery.data;
  const branchHours = home?.branch_hours as
    | {
        branch: { name: string; display_name?: string | null };
        summary: {
          current_weekday: number;
          current_is_closed: boolean;
          current_open_time?: string | null;
          current_close_time?: string | null;
          current_note?: string | null;
          updated_at?: string | null;
        };
        days: Array<{
          weekday: number;
          is_closed: boolean;
          open_time?: string | null;
          close_time?: string | null;
          note?: string | null;
        }>;
      }
    | null
    | undefined;

  const currentWeekday = branchHours?.summary.current_weekday ?? null;
  const currentDay = currentWeekday === null ? null : branchHours?.days?.find((day) => day.weekday === currentWeekday) ?? null;
  const hasConfiguredHours = Boolean(branchHours?.days?.some((day) => !day.is_closed && day.open_time && day.close_time));
  const currentHours = !branchHours
    ? copy.home.hoursNotSet
    : branchHours.summary.current_is_closed
      ? copy.home.hoursClosedToday
      : branchHours.summary.current_open_time && branchHours.summary.current_close_time
        ? `${branchHours.summary.current_open_time} - ${branchHours.summary.current_close_time}`
        : currentDay && !currentDay.is_closed && currentDay.open_time && currentDay.close_time
          ? `${currentDay.open_time} - ${currentDay.close_time}`
          : copy.home.hoursClosedToday;
  const branchName = branchHours?.branch.display_name || branchHours?.branch.name || copy.home.hours;
  const updatedAt = branchHours?.summary.updated_at ? new Date(branchHours.summary.updated_at) : null;

  return (
    <Screen
      title={copy.home.hours}
      subtitle={branchName}
      action={<SecondaryButton onPress={() => router.back()}>{locale === "ar" ? "رجوع" : "Back"}</SecondaryButton>}
    >
      <QueryState loading={homeQuery.isLoading} loadingVariant="dashboard" error={homeQuery.error instanceof Error ? homeQuery.error.message : null} />
      {branchHours ? (
        <View style={{ gap: 16 }}>
          <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.primary }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <SectionTitle>{copy.home.hoursToday}</SectionTitle>
                <Text style={[styles.title, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                  {!hasConfiguredHours ? copy.home.hoursNotSet : currentDay?.is_closed ? copy.home.hoursClosedToday : currentHours}
                </Text>
                <MutedText>
                {localizeWeekday(branchHours.summary.current_weekday, isRTL)}
                {" · "}
                {!hasConfiguredHours ? copy.home.hoursNotSet : currentDay?.is_closed ? copy.home.hoursClosedToday : copy.home.hoursOpenNow}
              </MutedText>
              {branchHours.summary.current_note ? (
                  <View style={{ marginTop: 6 }}>
                    <MutedText>{branchHours.summary.current_note}</MutedText>
                  </View>
                ) : null}
            </View>
          </View>
            {updatedAt ? (
              <View style={{ marginTop: 12 }}>
                <MutedText>
                  {locale === "ar" ? "آخر تحديث" : "Updated"}: {updatedAt.toLocaleString(locale)}
                </MutedText>
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>{locale === "ar" ? "الجدول الأسبوعي" : "Weekly schedule"}</SectionTitle>
            <View style={{ marginTop: 12, gap: 10 }}>
              {branchHours.days.map((day) => {
                const isCurrent = day.weekday === branchHours.summary.current_weekday;
                return (
                  <View
                    key={day.weekday}
                    style={[
                      styles.row,
                      {
                        borderColor: isCurrent ? theme.primary : theme.border,
                        backgroundColor: isCurrent ? theme.primarySoft : theme.cardAlt,
                        flexDirection: isRTL ? "row-reverse" : "row",
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dayLabel, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                        {localizeWeekday(day.weekday, isRTL)}
                      </Text>
                      {day.note ? (
                        <View style={{ marginTop: 4 }}>
                          <MutedText>{day.note}</MutedText>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.dayHours, { color: day.is_closed ? theme.muted : theme.primary, fontFamily: fontSet.mono }]}>
                      {day.is_closed ? copy.home.hoursClosedToday : `${day.open_time} - ${day.close_time}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>
      ) : (
        <Card>
          <MutedText>{copy.home.hoursNotSet}</MutedText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    alignItems: "center",
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  dayHours: {
    fontSize: 13,
    fontWeight: "700",
  },
});
