import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, MutedText, PrimaryButton, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseEnvelope } from "@/lib/api";
import { localeTag } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type CoachingPackage = {
  id: string;
  user_id: string;
  coach_id?: string | null;
  coach_name?: string | null;
  member_name?: string | null;
  package_key: string;
  package_label: string;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  start_date?: string | null;
  end_date?: string | null;
  note?: string | null;
  is_active: boolean;
  updated_at?: string | null;
};

type PackagesResponse = {
  summary: {
    total_packages: number;
    total_remaining: number;
    total_used: number;
    total_members: number;
    total_coaches: number;
  };
  packages: CoachingPackage[];
};

export default function PrivateCoachingScreen() {
  const router = useRouter();
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const packagesQuery = useQuery({
    queryKey: ["mobile-private-coaching"],
    queryFn: async () => parseEnvelope<PackagesResponse>(await authorizedRequest("/coaching/packages")).data,
  });
  const packages = packagesQuery.data;
  const activePackages = packages?.packages.filter((item) => item.is_active).length ?? 0;

  return (
    <Screen title={copy.privateCoachingScreen.title} subtitle={copy.privateCoachingScreen.subtitle} showSubtitle>
      <QueryState
        loading={packagesQuery.isLoading}
        error={packagesQuery.error instanceof Error ? packagesQuery.error.message : null}
        empty={Boolean(packages && packages.packages.length === 0)}
        emptyMessage={copy.privateCoachingScreen.noPackages}
      />
      {packages ? (
        <>
          <Card style={[styles.heroCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <SectionTitle>{copy.privateCoachingScreen.summaryTitle}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.privateCoachingScreen.totalPackages} value={packages.summary.total_packages} />
              <InlineStat label={copy.privateCoachingScreen.activePackages} value={activePackages} />
              <InlineStat label={copy.privateCoachingScreen.totalRemaining} value={packages.summary.total_remaining} />
              <InlineStat label={copy.privateCoachingScreen.totalUsed} value={packages.summary.total_used} />
            </View>
            <View style={[styles.metaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>
                {copy.privateCoachingScreen.totalMembers}: {packages.summary.total_members}
              </MutedText>
              <MutedText>
                {copy.privateCoachingScreen.totalCoaches}: {packages.summary.total_coaches}
              </MutedText>
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.privateCoachingScreen.packagesTitle}</SectionTitle>
            {packages.packages.length === 0 ? (
              <MutedText>{copy.privateCoachingScreen.noPackages}</MutedText>
            ) : (
              <View style={{ gap: 12 }}>
                {packages.packages.map((item) => {
                  const startLabel = item.start_date ? new Date(item.start_date).toLocaleDateString(locale) : copy.common.noData;
                  const endLabel = item.end_date ? new Date(item.end_date).toLocaleDateString(locale) : copy.common.noData;
                  const updatedLabel = item.updated_at ? new Date(item.updated_at).toLocaleString(locale) : copy.common.noData;
                  const statusLabel = item.is_active ? copy.privateCoachingScreen.activeStatus : copy.privateCoachingScreen.inactiveStatus;
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.packageCard,
                        {
                          backgroundColor: item.is_active ? theme.cardAlt : theme.card,
                          borderColor: item.is_active ? theme.primarySoft : theme.border,
                        },
                      ]}
                    >
                      <View style={[styles.packageHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <View style={styles.titleBlock}>
                          <Text
                            style={[
                              styles.packageTitle,
                              {
                                color: theme.foreground,
                                fontFamily: fontSet.display,
                                textAlign: isRTL ? "right" : "left",
                                writingDirection: direction,
                              },
                            ]}
                          >
                            {item.package_label}
                          </Text>
                          <MutedText>
                            {copy.privateCoachingScreen.packageCode}: {item.package_key}
                          </MutedText>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: item.is_active ? theme.primarySoft : theme.card, borderColor: theme.border }]}>
                          <Text style={[styles.statusText, { color: item.is_active ? theme.primary : theme.muted, fontFamily: fontSet.mono }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <MutedText>
                          {copy.privateCoachingScreen.member}: {item.member_name || copy.common.member}
                        </MutedText>
                        <MutedText>
                          {copy.privateCoachingScreen.coach}: {item.coach_name || copy.common.noData}
                        </MutedText>
                      </View>

                      <View style={[styles.balanceRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={[styles.balanceValue, { color: theme.primary, fontFamily: fontSet.mono }]}>
                          {item.remaining_sessions}
                        </Text>
                        <MutedText>
                          {copy.privateCoachingScreen.remainingLabel} / {copy.privateCoachingScreen.totalLabel} {item.total_sessions}
                        </MutedText>
                      </View>

                      <View style={[styles.progressTrack, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, Math.max(0, (item.remaining_sessions / Math.max(item.total_sessions, 1)) * 100))}%`,
                              backgroundColor: item.is_active ? theme.primary : theme.muted,
                            },
                          ]}
                        />
                      </View>

                      <View style={[styles.footerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <MutedText>
                          {copy.privateCoachingScreen.starts}: {startLabel}
                        </MutedText>
                        <MutedText>
                          {copy.privateCoachingScreen.ends}: {endLabel}
                        </MutedText>
                      </View>
                      <MutedText>
                        {copy.privateCoachingScreen.updatedAt}: {updatedLabel}
                      </MutedText>
                      {item.note ? <MutedText>{item.note}</MutedText> : null}
                      <PrimaryButton onPress={() => router.push(`/private-coaching/${item.id}` as never)}>
                        {copy.privateCoachingScreen.openDetails}
                      </PrimaryButton>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 14,
  },
  statGrid: {
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  packageCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  packageHeader: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  detailRow: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  balanceRow: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  metaRow: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  footerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
});
