import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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

function formatVolume(volume?: number | null) {
  if (typeof volume !== "number" || !Number.isFinite(volume)) return "--";
  return `${volume.toFixed(volume % 1 === 0 ? 0 : 1)} kg`;
}

const PROGRESS_RANGES = [
  { id: "7d", days: 7, labelKey: "range7Days" as const },
  { id: "30d", days: 30, labelKey: "range30Days" as const },
  { id: "90d", days: 90, labelKey: "range90Days" as const },
  { id: "all", days: null, labelKey: "rangeAll" as const },
] as const;

export default function ProgressTab() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [rangeId, setRangeId] = useState<(typeof PROGRESS_RANGES)[number]["id"]>("30d");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [muscleMassKg, setMuscleMassKg] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const progressQuery = useQuery({
    queryKey: ["mobile-progress", rangeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      const selectedRange = PROGRESS_RANGES.find((item) => item.id === rangeId) ?? PROGRESS_RANGES[1];
      if (selectedRange.days != null) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - (selectedRange.days - 1));
        params.set("date_from", start.toISOString().slice(0, 10));
        params.set("date_to", end.toISOString().slice(0, 10));
      }
      const suffix = params.toString();
      return parseProgressEnvelope(await authorizedRequest(`/mobile/customer/progress${suffix ? `?${suffix}` : ""}`)).data;
    },
  });
  const gamificationQuery = useQuery({
    queryKey: ["mobile-gamification"],
    queryFn: async () => parseEnvelope<MobileGamificationStats>(await authorizedRequest("/gamification/stats")).data,
  });
  const progress = progressQuery.data;
  const gamification = gamificationQuery.data;
  const locale = localeTag(isRTL);
  const selectedRange = PROGRESS_RANGES.find((item) => item.id === rangeId) ?? PROGRESS_RANGES[1];
  const selectedRangeLabel = copy.progress[selectedRange.labelKey];

  const latestBiometric = progress?.biometrics.at(-1) ?? null;
  const recentAttendance = progress?.attendance_history.slice(0, 5) ?? [];
  const workoutCountInRange = progress?.range_summary.workouts ?? progress?.workout_stats.reduce((sum, row) => sum + row.workouts, 0) ?? 0;
  const grantedAttendanceCount = progress?.range_summary.attendance ?? progress?.attendance_history.filter((entry) => entry.status === "GRANTED").length ?? 0;
  const exercisePrTable = progress?.exercise_pr_table ?? [];
  const sessionVolumeSeries = progress?.session_load_series.map((row) => ({
    label: new Date(row.date).toLocaleDateString(locale, { month: "short", day: "numeric" }),
    value: row.volume,
  })) ?? [];
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
      <QueryState
        loading={progressQuery.isLoading}
        loadingVariant="detail"
        error={progressQuery.error instanceof Error ? progressQuery.error.message : null}
      />
      {progress ? (
        <>
          <Card style={styles.rangeCard}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <SectionTitle>{copy.progress.selectedRangeSummary}</SectionTitle>
              <MutedText>{selectedRangeLabel}</MutedText>
            </View>
            <View style={[styles.rangeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {PROGRESS_RANGES.map((range) => {
                const active = range.id === rangeId;
                return (
                  <Pressable
                    key={range.id}
                    onPress={() => setRangeId(range.id)}
                    style={[
                      styles.rangeChip,
                      {
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active ? theme.primarySoft : theme.cardAlt,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? theme.primary : theme.foreground, fontFamily: fontSet.mono, fontSize: 12, fontWeight: "900" }}>
                      {copy.progress[range.labelKey]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card>
            <SectionTitle>{selectedRangeLabel}</SectionTitle>
            <View style={[styles.statGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <InlineStat label={copy.progress.workoutsInRange} value={workoutCountInRange} />
              <InlineStat label={copy.progress.attendanceInRange} value={grantedAttendanceCount} />
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
              points={progress.biometric_series.weight.slice(-8).map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.value }))}
              unit="kg"
              emptyMessage={copy.progress.graphNoData}
            />
            <SparklineChart
              title={copy.progress.bodyFatTrend}
              points={progress.biometric_series.body_fat.slice(-8).map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.value }))}
              unit="%"
              emptyMessage={copy.progress.graphNoData}
            />
            <SparklineChart
              title={copy.progress.muscleTrend}
              points={progress.biometric_series.muscle.slice(-8).map((entry) => ({ label: new Date(entry.date).toLocaleDateString(locale, { month: "short", day: "numeric" }), value: entry.value }))}
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
            <SectionTitle>{copy.progress.sessionLoad}</SectionTitle>
            {sessionVolumeSeries.length === 0 ? (
              <MutedText>{copy.progress.noTrend}</MutedText>
            ) : (
              <>
                <CountBarChart
                  title={copy.progress.sessionLoad}
                  points={sessionVolumeSeries}
                  unit="kg"
                  emptyMessage={copy.progress.noSessionVolume}
                />
                {progress.recent_workout_sessions.slice(0, 5).map((session) => (
                  <View key={session.id} style={[styles.row, { borderTopColor: theme.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {new Date(session.performed_at).toLocaleDateString(locale)}
                    </Text>
                    <Text style={[styles.metricValue, { color: theme.primary, fontFamily: fontSet.mono }]}>{copy.progress.sessionVolume}: {formatVolume(session.session_volume)}</Text>
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
            {exercisePrTable.length === 0 ? (
              <MutedText>{copy.progress.noPersonalRecords}</MutedText>
            ) : (
              exercisePrTable.slice(0, 6).map((record) => (
                <View key={record.exercise} style={[styles.prCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <View style={[styles.prHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={styles.rowTextWrap}>
                      <Text style={[styles.prTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                        {record.exercise}
                      </Text>
                      <MutedText>
                        {record.best_reps} {copy.progress.repsAt} {record.best_reps_weight} {copy.progress.weightUnit}
                      </MutedText>
                    </View>
                    <Text style={[styles.prBadge, { color: theme.primary, fontFamily: fontSet.mono, textTransform: isRTL ? "none" : "uppercase" }]}>
                      {copy.progress.allTimeBest}
                    </Text>
                  </View>
                  <View style={[styles.prMetaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.prValue, { color: theme.foreground, fontFamily: fontSet.display, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {record.best_weight} {copy.progress.weightUnit} x {record.best_weight_reps}
                    </Text>
                    <MutedText>
                      {`${copy.progress.bestVolume}: ${formatVolume(record.best_volume)}`}
                    </MutedText>
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{copy.progress.recentSessions}</SectionTitle>
            {progress.recent_workout_sessions.length === 0 ? (
              <MutedText>{copy.progress.noSessions}</MutedText>
            ) : (
              progress.recent_workout_sessions.slice(0, 5).map((session) => (
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
  singlePoint = false,
}: {
  title: string;
  latest: number;
  min: number;
  max: number;
  delta?: number | null;
  unit: string;
  singlePoint?: boolean;
}) {
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const formattedLatest = `${formatChartNumber(latest)}${unit}`;
  const formattedDelta = typeof delta === "number" ? (delta === 0 ? copy.progress.noChange : `${delta > 0 ? "+" : ""}${formatChartNumber(delta)}${unit}`) : "--";
  const isFlatSeries = min === max;
  return (
    <>
      <View style={[styles.chartHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>{title}</Text>
        <Text style={[styles.chartLatest, { color: theme.primary, fontFamily: fontSet.mono }]}>{formattedLatest}</Text>
      </View>
      {!singlePoint ? (
        <View style={[styles.chartMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <MutedText>{isFlatSeries ? `${copy.progress.steadyAt}: ${formattedLatest}` : `${copy.progress.range}: ${formatChartNumber(min)}${unit} - ${formatChartNumber(max)}${unit}`}</MutedText>
          <Text style={[styles.chartDelta, { color: delta === 0 ? theme.muted : theme.primary, fontFamily: fontSet.mono }]}>
            {copy.progress.change}: {formattedDelta}
          </Text>
        </View>
      ) : null}
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
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const visiblePoints = points.filter((point): point is { label: string; value: number } => typeof point.value === "number");
  if (visiblePoints.length === 0) {
    return <MutedText>{emptyMessage}</MutedText>;
  }
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const range = rawRange || 1;
  const singlePoint = visiblePoints.length === 1;
  const latest = visiblePoints[visiblePoints.length - 1];
  const delta = visiblePoints.length > 1 ? latest.value - visiblePoints[0].value : null;
  const chartHeight = 118;
  const paddingX = 12;
  const paddingY = 14;
  const usableWidth = Math.max(chartWidth - paddingX * 2, 1);
  const usableHeight = chartHeight - paddingY * 2;
  const selectedPoint = selectedIndex == null ? null : visiblePoints[Math.min(selectedIndex, visiblePoints.length - 1)] ?? null;
  const previousPoint = selectedIndex != null && selectedIndex > 0 ? visiblePoints[selectedIndex - 1] : null;
  const selectedDelta = selectedPoint && previousPoint ? selectedPoint.value - previousPoint.value : null;
  const coordinates = visiblePoints.map((point, index) => {
    const x = paddingX + (visiblePoints.length === 1 ? usableWidth / 2 : (index / (visiblePoints.length - 1)) * usableWidth);
    const y = paddingY + (1 - (rawRange === 0 ? 0.5 : (point.value - min) / range)) * usableHeight;
    return { ...point, x, y };
  });

  return (
    <View style={[styles.chartBlock, { borderTopColor: theme.border }]}>
      <ChartSummary title={title} latest={latest.value} min={min} max={max} delta={delta} unit={unit} singlePoint={singlePoint} />
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
                  key={`segment-${index}`}
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
              <Pressable
                key={`dot-${index}`}
                onPress={() => setSelectedIndex((current) => (current === index ? null : index))}
                hitSlop={10}
                style={[
                  styles.sparklineDot,
                  {
                    left: point.x - 4,
                    top: point.y - 4,
                    backgroundColor: index === selectedIndex ? theme.primary : theme.background,
                    borderColor: theme.primary,
                  },
                ]}
              />
            ))
          : null}
      </View>
      {!singlePoint ? (
        <View style={[styles.chartEdgeLabels, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {visiblePoints[0].label}
          </Text>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {latest.label}
          </Text>
        </View>
      ) : null}
      <View style={[styles.chartInspector, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        {selectedPoint ? (
          <>
            <View style={[styles.inspectorHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>{copy.progress.selectedPoint}</MutedText>
              <Pressable onPress={() => setSelectedIndex(null)} hitSlop={8}>
                <Text style={[styles.inspectorClear, { color: theme.primary, fontFamily: fontSet.body }]}>{copy.progress.clearPoint}</Text>
              </Pressable>
            </View>
            <Text style={[styles.inspectorLabel, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {selectedPoint.label}
            </Text>
            <Text style={[styles.inspectorValue, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {formatChartNumber(selectedPoint.value)}{unit}
            </Text>
            {previousPoint ? (
              <>
                <MutedText>{`${copy.progress.previousPoint}: ${previousPoint.label} · ${formatChartNumber(previousPoint.value)}${unit}`}</MutedText>
                <MutedText>{`${copy.progress.change}: ${selectedDelta === 0 ? copy.progress.noChange : `${selectedDelta && selectedDelta > 0 ? "+" : ""}${formatChartNumber(selectedDelta ?? 0)}${unit}`}`}</MutedText>
              </>
            ) : null}
          </>
        ) : (
          <MutedText>{copy.progress.tapPointToInspect}</MutedText>
        )}
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
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const visiblePoints = points.filter((point): point is { label: string; value: number } => typeof point.value === "number");
  if (visiblePoints.length === 0) {
    return <MutedText>{emptyMessage}</MutedText>;
  }
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const range = rawRange || 1;
  const singlePoint = visiblePoints.length === 1;
  const latest = visiblePoints[visiblePoints.length - 1];
  const delta = visiblePoints.length > 1 ? latest.value - visiblePoints[0].value : null;
  const chartHeight = 118;
  const paddingX = 12;
  const paddingY = 14;
  const usableWidth = Math.max(chartWidth - paddingX * 2, 1);
  const usableHeight = chartHeight - paddingY * 2;
  const selectedPoint = selectedIndex == null ? null : visiblePoints[Math.min(selectedIndex, visiblePoints.length - 1)] ?? null;
  const previousPoint = selectedIndex != null && selectedIndex > 0 ? visiblePoints[selectedIndex - 1] : null;
  const selectedDelta = selectedPoint && previousPoint ? selectedPoint.value - previousPoint.value : null;
  const coordinates = visiblePoints.map((point, index) => {
    const x = paddingX + (visiblePoints.length === 1 ? usableWidth / 2 : (index / (visiblePoints.length - 1)) * usableWidth);
    const y = paddingY + (1 - (rawRange === 0 ? 0.5 : (point.value - min) / range)) * usableHeight;
    return { ...point, x, y };
  });

  return (
    <View style={[styles.chartBlock, { borderTopColor: theme.border }]}>
      <ChartSummary title={title} latest={latest.value} min={min} max={max} delta={delta} unit={unit} singlePoint={singlePoint} />
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
                  key={`segment-${index}`}
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
              <Pressable
                key={`dot-${index}`}
                onPress={() => setSelectedIndex((current) => (current === index ? null : index))}
                hitSlop={10}
                style={[
                  styles.sparklineDot,
                  {
                    left: point.x - 4,
                    top: point.y - 4,
                    backgroundColor: index === selectedIndex ? theme.primary : theme.background,
                    borderColor: theme.primary,
                  },
                ]}
              />
            ))
          : null}
      </View>
      {!singlePoint ? (
        <View style={[styles.chartEdgeLabels, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {visiblePoints[0].label}
          </Text>
          <Text style={[styles.chartLabel, { color: theme.muted, fontFamily: fontSet.body }]} numberOfLines={1}>
            {latest.label}
          </Text>
        </View>
      ) : null}
      <View style={[styles.chartInspector, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        {selectedPoint ? (
          <>
            <View style={[styles.inspectorHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <MutedText>{copy.progress.selectedPoint}</MutedText>
              <Pressable onPress={() => setSelectedIndex(null)} hitSlop={8}>
                <Text style={[styles.inspectorClear, { color: theme.primary, fontFamily: fontSet.body }]}>{copy.progress.clearPoint}</Text>
              </Pressable>
            </View>
            <Text style={[styles.inspectorLabel, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {selectedPoint.label}
            </Text>
            <Text style={[styles.inspectorValue, { color: theme.primary, fontFamily: fontSet.mono, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
              {formatChartNumber(selectedPoint.value)}{unit}
            </Text>
            {previousPoint ? (
              <>
                <MutedText>{`${copy.progress.previousPoint}: ${previousPoint.label} · ${formatChartNumber(previousPoint.value)}${unit}`}</MutedText>
                <MutedText>{`${copy.progress.change}: ${selectedDelta && selectedDelta > 0 ? "+" : ""}${formatChartNumber(selectedDelta ?? 0)}${unit}`}</MutedText>
              </>
            ) : null}
          </>
        ) : (
          <MutedText>{copy.progress.tapPointToInspect}</MutedText>
        )}
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
    borderTopWidth: 1,
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
  },
  rangeCard: {
    gap: 10,
  },
  sectionHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rangeRow: {
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  chartColumnSingle: {
    flex: 0,
    width: 72,
  },
  chartTrack: {
    width: "100%",
    height: 90,
    borderRadius: 999,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartTrackSingle: {
    width: 48,
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
  chartInspector: {
    borderWidth: 1,
    borderRadius: 14,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inspectorHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inspectorClear: {
    fontSize: 12,
    fontWeight: "800",
  },
  inspectorLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  inspectorValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  prCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  prHead: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  prTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  prBadge: {
    fontSize: 10,
    fontWeight: "900",
  },
  prMetaRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  prValue: {
    fontSize: 16,
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
