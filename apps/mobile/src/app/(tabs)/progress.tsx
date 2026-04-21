import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, InlineStat, Input, MutedText, PrimaryButton, QueryState, Screen, SectionTitle } from "@/components/ui";
import { parseEnvelope, parseProgressEnvelope, type MobileGamificationStats } from "@/lib/api";
import { localeTag, localizeAccessReason, localizeAccessStatus } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

function parseMetricValue(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function ProgressTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [muscleMassKg, setMuscleMassKg] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const progressQuery = useQuery({
    queryKey: ["mobile-progress"],
    queryFn: async () => parseProgressEnvelope(await authorizedRequest("/mobile/customer/progress")).data,
  });
  const gamificationQuery = useQuery({
    queryKey: ["mobile-gamification"],
    queryFn: async () => parseEnvelope<MobileGamificationStats>(await authorizedRequest("/gamification/stats")).data,
  });
  const progress = progressQuery.data;
  const gamification = gamificationQuery.data;
  const locale = localeTag(isRTL);

  const latestBiometric = progress?.biometrics.at(-1) ?? null;
  const recentAttendance = progress?.attendance_history.slice(0, 5) ?? [];
  const recentSessions = progress?.recent_workout_sessions.slice(0, 5) ?? [];
  const workoutCount30d = progress?.workout_stats.reduce((sum, row) => sum + row.workouts, 0) ?? 0;
  const grantedAttendanceCount = progress?.attendance_history.filter((entry) => entry.status === "GRANTED").length ?? 0;
  const metricPayload = {
    weight_kg: parseMetricValue(weightKg),
    height_cm: parseMetricValue(heightCm),
    body_fat_pct: parseMetricValue(bodyFatPct),
    muscle_mass_kg: parseMetricValue(muscleMassKg),
  };
  const canSaveMetrics = Object.values(metricPayload).some((value) => value !== undefined);

  const metricsMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/fitness/biometrics", {
        method: "POST",
        body: JSON.stringify(metricPayload),
      }),
    onSuccess: async () => {
      setWeightKg("");
      setHeightCm("");
      setBodyFatPct("");
      setMuscleMassKg("");
      setFormMessage(copy.progress.metricsSaved);
      await queryClient.invalidateQueries({ queryKey: ["mobile-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-home"] });
    },
    onError: (error) => setFormMessage(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  return (
    <Screen title={copy.progress.title} subtitle={copy.progress.subtitle}>
      <QueryState loading={progressQuery.isLoading} loadingVariant="detail" error={progressQuery.error instanceof Error ? progressQuery.error.message : null} />
      {progress ? (
        <>
          <Card>
            <SectionTitle>{copy.progress.thisMonth}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.progress.workouts30d} value={workoutCount30d} />
              <InlineStat label={copy.progress.attendance} value={grantedAttendanceCount} />
            </View>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.progress.lastWeight} value={latestBiometric?.weight_kg != null ? `${latestBiometric.weight_kg} kg` : "--"} />
              <InlineStat label={copy.progress.lastBodyFat} value={latestBiometric?.body_fat_pct != null ? `${latestBiometric.body_fat_pct}%` : "--"} />
            </View>
          </Card>

          <Card>
            <SectionTitle>{copy.progress.logBodyMetrics}</SectionTitle>
            <View style={[styles.inputGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.metricInput}>
                {weightKg ? <MutedText>{copy.progress.weightKg}</MutedText> : null}
                <Input value={weightKg} onChangeText={setWeightKg} placeholder={copy.progress.weightKg} keyboardType="decimal-pad" />
              </View>
              <View style={styles.metricInput}>
                {heightCm ? <MutedText>{copy.progress.heightCm}</MutedText> : null}
                <Input value={heightCm} onChangeText={setHeightCm} placeholder={copy.progress.heightCm} keyboardType="decimal-pad" />
              </View>
              <View style={styles.metricInput}>
                {bodyFatPct ? <MutedText>{copy.progress.bodyFatPct}</MutedText> : null}
                <Input value={bodyFatPct} onChangeText={setBodyFatPct} placeholder={copy.progress.bodyFatPct} keyboardType="decimal-pad" />
              </View>
              <View style={styles.metricInput}>
                {muscleMassKg ? <MutedText>{copy.progress.muscleMassKg}</MutedText> : null}
                <Input value={muscleMassKg} onChangeText={setMuscleMassKg} placeholder={copy.progress.muscleMassKg} keyboardType="decimal-pad" />
              </View>
            </View>
            <PrimaryButton onPress={() => metricsMutation.mutate()} disabled={metricsMutation.isPending || !canSaveMetrics}>
              {metricsMutation.isPending ? copy.progress.savingBodyMetrics : copy.progress.saveBodyMetrics}
            </PrimaryButton>
            {formMessage ? <MutedText>{formMessage}</MutedText> : null}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.bodyMetricsTrend}</SectionTitle>
            <SparklineChart
              title={copy.progress.weightTrend}
              points={progress.biometrics.slice(-8).map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.weight_kg }))}
              unit="kg"
              emptyMessage={copy.progress.graphNoData}
            />
            <SparklineChart
              title={copy.progress.bodyFatTrend}
              points={progress.biometrics.slice(-8).map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.body_fat_pct }))}
              unit="%"
              emptyMessage={copy.progress.graphNoData}
            />
            <SparklineChart
              title={copy.progress.muscleTrend}
              points={progress.biometrics.slice(-8).map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.muscle_mass_kg }))}
              unit="kg"
              emptyMessage={copy.progress.graphNoData}
            />
          </Card>

          <Card>
            <SectionTitle>{copy.progress.workoutTrend}</SectionTitle>
            {progress.workout_stats.length === 0 ? (
              <MutedText>{copy.progress.noTrend}</MutedText>
            ) : (
              <>
                <CountBarChart
                  title={copy.progress.workoutTrend}
                  points={progress.workout_stats.slice(-8).map((row) => ({ label: new Date(row.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: row.workouts }))}
                  unit=""
                  emptyMessage={copy.progress.noTrend}
                />
                {progress.workout_stats.slice(-6).map((row) => (
                  <View key={row.date} style={[styles.row, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {new Date(row.date).toLocaleDateString(locale)}
                    </Text>
                    <Text style={[styles.metricValue, { color: theme.primary, fontFamily: fontSet.mono }]}>{row.workouts}</Text>
                  </View>
                ))}
              </>
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.attendanceStats}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.home.currentStreak} value={gamification?.streak.current_streak ?? "--"} />
              <InlineStat label={copy.home.bestStreak} value={gamification?.streak.best_streak ?? "--"} />
              <InlineStat label={copy.home.totalVisits} value={gamification?.total_visits ?? "--"} />
            </View>
            {gamification?.weekly_progress ? (
              <MutedText>
                {gamification.weekly_progress.current}/{gamification.weekly_progress.goal} {copy.progress.attendanceStats}
              </MutedText>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.prSection}</SectionTitle>
            {progress.personal_records.length === 0 ? (
              <MutedText>{copy.progress.noPersonalRecords}</MutedText>
            ) : (
              progress.personal_records.slice(0, 6).map((record) => (
                <View key={record.id} style={[styles.prCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <View style={[styles.prHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.rowTextWrap}>
                      <Text style={[styles.prTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                        {record.exercise_name || copy.progress.prFallback}
                      </Text>
                      <MutedText>{record.plan_name || copy.common.noCurrentPlan}</MutedText>
                    </View>
                    <Text style={[styles.prBadge, { color: theme.primary, fontFamily: fontSet.mono, textTransform: isRTL ? "none" : "uppercase" }]}>
                      {record.pr_type || copy.progress.prFallback}
                    </Text>
                  </View>
                  <Text style={[styles.prValue, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                    {record.pr_value || `${record.weight_kg ?? "--"} kg / ${record.reps_completed} reps`}
                  </Text>
                  {record.pr_notes ? <MutedText>{record.pr_notes}</MutedText> : null}
                  <MutedText>{new Date(record.performed_at).toLocaleDateString(locale)}</MutedText>
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.recentSessions}</SectionTitle>
            {recentSessions.length === 0 ? (
              <MutedText>{copy.progress.noSessions}</MutedText>
            ) : (
              recentSessions.map((session) => (
                <View key={session.id} style={[styles.blockRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                    {new Date(session.performed_at).toLocaleString(locale)}
                  </Text>
                  <MutedText>
                    {session.duration_minutes ?? "--"} {copy.common.minutesShort}
                  </MutedText>
                  <MutedText>{session.notes || copy.progress.noSessionNotes}</MutedText>
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.attendanceTimeline}</SectionTitle>
            {recentAttendance.length === 0 ? (
              <MutedText>{copy.progress.noAttendance}</MutedText>
            ) : (
              recentAttendance.map((entry) => (
                <View key={entry.id} style={[styles.row, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {new Date(entry.scan_time).toLocaleString(locale)}
                    </Text>
                    <MutedText>{entry.kiosk_id || "--"}</MutedText>
                    {entry.reason ? <MutedText>{localizeAccessReason(entry.reason, isRTL)}</MutedText> : null}
                  </View>
                  <Text style={[styles.metricValue, { color: entry.status === "GRANTED" ? theme.primary : theme.muted, fontFamily: fontSet.mono }]}>
                    {localizeAccessStatus(entry.status, isRTL)}
                  </Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.biometrics}</SectionTitle>
            {progress.biometrics.length === 0 ? (
              <MutedText>{copy.progress.noBiometrics}</MutedText>
            ) : (
              progress.biometrics.slice(-6).reverse().map((entry) => (
                <View key={entry.id} style={[styles.blockRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                    {new Date(entry.date).toLocaleDateString(locale)}
                  </Text>
                  <MutedText>{entry.weight_kg ?? "--"} kg</MutedText>
                  <MutedText>{entry.body_fat_pct ?? "--"}% {copy.progress.bodyFat}</MutedText>
                  <MutedText>{entry.muscle_mass_kg ?? "--"} kg {copy.progress.muscleMass}</MutedText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function ChartSummary({
  title,
  latest,
  min,
  max,
  delta,
  unit,
}: {
  title: string;
  latest: number;
  min: number;
  max: number;
  delta?: number | null;
  unit: string;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const formattedLatest = `${formatChartNumber(latest)}${unit}`;
  const formattedDelta = typeof delta === "number" ? `${delta > 0 ? "+" : ""}${formatChartNumber(delta)}${unit}` : "--";
  return (
    <>
      <View style={[styles.chartHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{title}</Text>
        <Text style={[styles.chartLatest, { color: theme.primary, fontFamily: fontSet.mono }]}>{formattedLatest}</Text>
      </View>
      <View style={[styles.chartMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <MutedText>
          {copy.progress.range}:{" "}
          {formatChartNumber(min)}
          {unit} - {formatChartNumber(max)}
          {unit}
        </MutedText>
        <Text style={[styles.chartDelta, { color: !delta ? theme.muted : theme.primary, fontFamily: fontSet.mono }]}>
          {copy.progress.change}: {formattedDelta}
        </Text>
      </View>
    </>
  );
}

function SparklineChart({
  title,
  points,
  unit,
  emptyMessage,
}: {
  title: string;
  points: { label: string; value?: number | null }[];
  unit: string;
  emptyMessage: string;
}) {
  const { fontSet, isRTL, theme } = usePreferences();
  const [chartWidth, setChartWidth] = useState(0);
  const visiblePoints = points.filter((point): point is { label: string; value: number } => typeof point.value === "number");
  if (visiblePoints.length === 0) {
    return <MutedText>{emptyMessage}</MutedText>;
  }
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const range = rawRange || 1;
  const latest = visiblePoints[visiblePoints.length - 1];
  const previous = visiblePoints[visiblePoints.length - 2];
  const delta = previous ? latest.value - previous.value : null;
  const chartHeight = 118;
  const paddingX = 12;
  const paddingY = 14;
  const usableWidth = Math.max(chartWidth - paddingX * 2, 1);
  const usableHeight = chartHeight - paddingY * 2;
  const coordinates = visiblePoints.map((point, index) => {
    const x = paddingX + (visiblePoints.length === 1 ? usableWidth / 2 : (index / (visiblePoints.length - 1)) * usableWidth);
    const y = paddingY + (1 - (rawRange === 0 ? 0.5 : (point.value - min) / range)) * usableHeight;
    return { ...point, x, y };
  });

  return (
    <View style={styles.chartBlock}>
      <ChartSummary title={title} latest={latest.value} min={min} max={max} delta={delta} unit={unit} />
      <View
        onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
        style={[styles.sparklineFrame, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}
      >
        <View style={[styles.sparklineGuide, { top: chartHeight / 2, backgroundColor: theme.border }]} />
        {chartWidth > 0
          ? coordinates.slice(0, -1).map((point, index) => {
              const next = coordinates[index + 1];
              const dx = next.x - point.x;
              const dy = next.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = `${Math.atan2(dy, dx)}rad`;
              return (
                <View
                  key={`${point.label}-${next.label}`}
                  style={[
                    styles.sparklineSegment,
                    {
                      width: length,
                      left: point.x,
                      top: point.y,
                      backgroundColor: theme.primary,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            })
          : null}
        {chartWidth > 0
          ? coordinates.map((point, index) => (
              <View
                key={`${point.label}-${point.value}`}
                style={[
                  styles.sparklineDot,
                  {
                    left: point.x - 4,
                    top: point.y - 4,
                    backgroundColor: index === coordinates.length - 1 ? theme.primary : theme.background,
                    borderColor: theme.primary,
                  },
                ]}
              />
            ))
          : null}
      </View>
      <View style={[styles.chartEdgeLabels, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
          {visiblePoints[0].label}
        </Text>
        <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
          {latest.label}
        </Text>
      </View>
    </View>
  );
}

function CountBarChart({
  title,
  points,
  unit,
  emptyMessage,
}: {
  title: string;
  points: { label: string; value?: number | null }[];
  unit: string;
  emptyMessage: string;
}) {
  const { fontSet, isRTL, theme } = usePreferences();
  const visiblePoints = points.filter((point): point is { label: string; value: number } => typeof point.value === "number");
  if (visiblePoints.length === 0) {
    return <MutedText>{emptyMessage}</MutedText>;
  }
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const range = rawRange || 1;
  const latest = visiblePoints[visiblePoints.length - 1];
  const previous = visiblePoints[visiblePoints.length - 2];
  const delta = previous ? latest.value - previous.value : null;

  return (
    <View style={styles.chartBlock}>
      <ChartSummary title={title} latest={latest.value} min={min} max={max} delta={delta} unit={unit} />
      <View style={[styles.chartRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {visiblePoints.map((point) => {
          const normalized = rawRange === 0 ? 0.5 : (point.value - min) / range;
          const height = 24 + normalized * 66;
          return (
            <View key={`${point.label}-${point.value}`} style={styles.chartColumn}>
              <View style={[styles.chartTrack, { backgroundColor: theme.primarySoft }]}>
                <View style={[styles.chartBar, { height, backgroundColor: theme.primary }]} />
              </View>
              <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function formatChartNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = StyleSheet.create({
  statGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  inputGrid: {
    flexWrap: "wrap",
    gap: 10,
  },
  metricInput: {
    flex: 1,
    minWidth: 132,
  },
  chartBlock: {
    gap: 8,
  },
  chartHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  chartLatest: {
    fontSize: 13,
    fontWeight: "800",
  },
  chartMeta: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chartDelta: {
    fontSize: 11,
    fontWeight: "800",
  },
  chartRow: {
    alignItems: "flex-end",
    gap: 8,
  },
  chartColumn: {
    flex: 1,
    minWidth: 36,
    alignItems: "center",
    gap: 5,
  },
  chartTrack: {
    width: "100%",
    height: 90,
    borderRadius: 999,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBar: {
    width: "100%",
    borderRadius: 999,
  },
  chartLabel: {
    fontSize: 10,
    maxWidth: 58,
  },
  sparklineFrame: {
    height: 118,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  sparklineGuide: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 1,
    opacity: 0.7,
  },
  sparklineSegment: {
    position: "absolute",
    height: 3,
    borderRadius: 999,
    transformOrigin: "left center",
  },
  sparklineDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 2,
  },
  chartEdgeLabels: {
    justifyContent: "space-between",
    gap: 12,
  },
  prCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  prHead: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  prTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  prBadge: {
    fontSize: 10,
    fontWeight: "900",
  },
  prValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  row: {
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 12,
  },
  blockRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 4,
  },
  rowTextWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "800",
  },
});
