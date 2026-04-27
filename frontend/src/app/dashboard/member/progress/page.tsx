'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ReferenceLine,
    Tooltip,
} from 'recharts';

import { useFeedback } from '@/components/FeedbackProvider';
import SafeResponsiveChart from '@/components/SafeResponsiveChart';
import TablePagination from '@/components/TablePagination';
import { api } from '@/lib/api';
import { useLocale } from '@/context/LocaleContext';

import { fetchMemberProgressData } from '../_shared/customerData';
import type { BiometricLogResponse } from '../_shared/types';

type MetricKey = keyof Pick<BiometricLogResponse, 'weight_kg' | 'body_fat_pct' | 'muscle_mass_kg'>;
const PR_TABLE_PAGE_SIZE = 10;
const RANGE_OPTIONS = [
    { key: '7d', days: 7 },
    { key: '30d', days: 30 },
    { key: '90d', days: 90 },
    { key: 'all', days: null as null },
] as const;

export default function MemberProgressPage() {
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const txt = locale === 'ar' ? {
        metricsLogged: 'تم تسجيل قياسات الجسم.',
        metricsFailed: 'فشل تسجيل قياسات الجسم.',
        fallbackExercise: 'تمرين',
        firstLogInRange: 'أول سجل ضمن النطاق',
        vsPrevious: 'مقارنة بالسابق',
        title: 'تقدمي',
        subtitle: 'اتساق التمرين وقياسات الجسم واتجاهات حمل الجلسات.',
        consistencyTitle: 'اتساق التمرين (آخر 30 يومًا)',
        workoutsLogged: 'تمارين مسجلة',
        noWorkoutData: 'لا توجد بيانات تمرين',
        bodyTracking: 'تتبع تقدم الجسم',
        noDataInRange: 'لا توجد بيانات في النطاق المحدد',
        workoutTrend: 'اتجاه التمرين',
        quickLog: 'تسجيل سريع للجسم',
        heightCm: 'الطول (سم)',
        weightKg: 'الوزن (كجم)',
        bodyFatPct: 'دهون الجسم (%)',
        muscleKg: 'العضلات (كجم)',
        eg175: 'مثال: 175',
        eg75: 'مثال: 75',
        eg15: 'مثال: 15',
        eg32: 'مثال: 32',
        saving: 'جارٍ الحفظ...',
        log: 'تسجيل',
        prTable: 'جدول أرقام التمرين الشخصية',
        exercise: 'التمرين',
        bestWeight: 'أفضل وزن',
        bestReps: 'أفضل تكرارات',
        bestVolume: 'أفضل حجم',
        repsAt: 'تكرار عند',
        weightUnit: 'كجم',
        noPrData: 'لا توجد بيانات أرقام شخصية في النطاق المحدد بعد.',
        sessionLoad: 'تتبع حمل الجلسات',
        sessionsLogged: 'جلسات مسجلة',
        noSessionVolume: 'لا توجد بيانات لحجم الجلسات بعد.',
        noData: 'غير متاح',
        weight: 'الوزن',
        bodyFat: 'دهون الجسم',
        muscleMass: 'الكتلة العضلية',
        statsRange: 'نطاق الإحصاءات',
        range7Days: '7 أيام',
        range30Days: '30 يوم',
        range90Days: '90 يوم',
        rangeAll: 'الكل',
        selectedRange: 'النطاق المحدد',
        workoutsInRange: 'التمارين',
        attendanceInRange: 'عمليات الدخول',
    } : {
        metricsLogged: 'Body metrics logged.',
        metricsFailed: 'Failed to log biometrics.',
        fallbackExercise: 'Exercise',
        firstLogInRange: 'First log in range',
        vsPrevious: 'vs previous',
        title: 'My Progress',
        subtitle: 'Workout consistency, body metrics, and session load trends.',
        consistencyTitle: 'Workout Consistency (Last 30 Days)',
        workoutsLogged: 'Workouts Logged',
        noWorkoutData: 'No workout data',
        bodyTracking: 'Body Progress Tracking',
        noDataInRange: 'No data in selected range',
        workoutTrend: 'Workout Trend',
        quickLog: 'Quick Body Log',
        heightCm: 'Height (cm)',
        weightKg: 'Weight (kg)',
        bodyFatPct: 'Body Fat (%)',
        muscleKg: 'Muscle (kg)',
        eg175: 'e.g. 175',
        eg75: 'e.g. 75',
        eg15: 'e.g. 15',
        eg32: 'e.g. 32',
        saving: 'Saving...',
        log: 'Log',
        prTable: 'Exercise PR Table',
        exercise: 'Exercise',
        bestWeight: 'Best Weight',
        bestReps: 'Best Reps',
        bestVolume: 'Best Volume',
        repsAt: 'reps @',
        weightUnit: 'kg',
        noPrData: 'No PR data in selected range yet.',
        sessionLoad: 'Session Load Tracking',
        sessionsLogged: 'sessions logged',
        noSessionVolume: 'No session volume data yet.',
        noData: 'N/A',
        weight: 'Weight',
        bodyFat: 'Body Fat',
        muscleMass: 'Muscle Mass',
        statsRange: 'Stats range',
        range7Days: '7D',
        range30Days: '30D',
        range90Days: '90D',
        rangeAll: 'All',
        selectedRange: 'Selected range',
        workoutsInRange: 'Workouts',
        attendanceInRange: 'Check-ins',
    };
    const [progressData, setProgressData] = useState<Awaited<ReturnType<typeof fetchMemberProgressData>> | null>(null);
    const [prTablePage, setPrTablePage] = useState(1);
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [muscleMass, setMuscleMass] = useState('');
    const [trendRangeDays, setTrendRangeDays] = useState<7 | 30 | 90 | null>(30);
    const [loggingBiometrics, setLoggingBiometrics] = useState(false);
    const [loading, setLoading] = useState(true);

    const selectedRangeLabel = useMemo(() => {
        if (trendRangeDays === null) return txt.rangeAll;
        if (trendRangeDays === 7) return txt.range7Days;
        if (trendRangeDays === 90) return txt.range90Days;
        return txt.range30Days;
    }, [trendRangeDays, txt.range30Days, txt.range7Days, txt.range90Days, txt.rangeAll]);

    const rangeWindow = useMemo(() => {
        if (trendRangeDays === null) {
            return null;
        }
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - trendRangeDays + 1);
        return { fromDate: start, toDate: end };
    }, [trendRangeDays]);

    const loadData = useCallback(async () => {
        try {
            const data = await fetchMemberProgressData(rangeWindow ?? undefined);
            setProgressData(data);

            if (data.biometrics.length > 0) {
                const latest = data.biometrics[data.biometrics.length - 1];
                setHeight(latest.height_cm?.toString() ?? '');
            }
        } catch (error) {
            setProgressData(null);
            showToast(error instanceof Error ? error.message : txt.metricsFailed, 'error');
        }
    }, [rangeWindow, showToast, txt.metricsFailed]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await loadData();
            setLoading(false);
        };
        load();
    }, [loadData]);

    useEffect(() => {
        const handleRefresh = () => {
            loadData();
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key === 'member_progress_refresh_ts') {
                loadData();
            }
        };

        window.addEventListener('member-progress-refresh', handleRefresh);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('member-progress-refresh', handleRefresh);
            window.removeEventListener('storage', handleStorage);
        };
    }, [loadData]);

    const handleLogBiometrics = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoggingBiometrics(true);
        try {
            const payload: Record<string, number> = {};
            if (weight.trim()) payload.weight_kg = parseFloat(weight);
            if (height.trim()) payload.height_cm = parseFloat(height);
            if (bodyFat.trim()) payload.body_fat_pct = parseFloat(bodyFat);
            if (muscleMass.trim()) payload.muscle_mass_kg = parseFloat(muscleMass);

            await api.post('/fitness/biometrics', payload);
            await loadData();
            setWeight('');
            setBodyFat('');
            setMuscleMass('');
            showToast(txt.metricsLogged, 'success');
        } catch {
            showToast(txt.metricsFailed, 'error');
        } finally {
            setLoggingBiometrics(false);
        }
    };

    const buildMetricSeries = useCallback((metric: MetricKey) => {
        const source =
            metric === 'weight_kg'
                ? progressData?.biometric_series.weight ?? []
                : metric === 'body_fat_pct'
                    ? progressData?.biometric_series.body_fat ?? []
                    : progressData?.biometric_series.muscle ?? [];
        const sorted = [...source].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return sorted
            .map((point, index, arr) => {
                const value = Number(point.value || 0);
                const prev = index > 0 ? Number(arr[index - 1].value || 0) : null;
                return {
                    date: point.date,
                    value,
                    delta: prev === null ? null : value - prev,
                };
            });
    }, [progressData?.biometric_series.body_fat, progressData?.biometric_series.muscle, progressData?.biometric_series.weight]);

    const weightSeries = useMemo(() => buildMetricSeries('weight_kg'), [buildMetricSeries]);
    const bodyFatSeries = useMemo(() => buildMetricSeries('body_fat_pct'), [buildMetricSeries]);
    const muscleSeries = useMemo(() => buildMetricSeries('muscle_mass_kg'), [buildMetricSeries]);

    const workoutStats = progressData?.workout_stats ?? [];
    const biometrics = progressData?.biometrics ?? [];
    const recentSessions = progressData?.recent_workout_sessions ?? [];
    const sessionVolumeSeries = useMemo(() => progressData?.session_load_series ?? [], [progressData?.session_load_series]);

    const exercisePrTable = useMemo(() => progressData?.exercise_pr_table ?? [], [progressData?.exercise_pr_table]);
    const totalPrPages = Math.max(1, Math.ceil(exercisePrTable.length / PR_TABLE_PAGE_SIZE));
    const visibleExercisePrTable = exercisePrTable.slice((prTablePage - 1) * PR_TABLE_PAGE_SIZE, prTablePage * PR_TABLE_PAGE_SIZE);
    const isArabic = locale === 'ar';

    useEffect(() => {
        setPrTablePage(1);
    }, [exercisePrTable.length]);

    function MetricTooltipContent({
        active,
        payload,
        label,
        unit,
        metricLabel,
    }: {
        active?: boolean;
        payload?: ReadonlyArray<{ payload: { value: number; delta: number | null } }>;
        label?: string | number;
        unit: string;
        metricLabel: string;
    }) {
        if (!active || !payload || payload.length === 0) return null;
        const point = payload[0].payload;
        const delta = point.delta;
        const deltaText = delta === null ? txt.firstLogInRange : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${unit} ${txt.vsPrevious}`;
        const deltaClass = delta === null ? 'text-muted-foreground' : delta >= 0 ? 'text-emerald-400' : 'text-orange-400';
        const parsedLabel = typeof label === 'string' ? label : String(label ?? '');

        return (
            <div className="border border-border bg-card px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">{formatDate(parsedLabel, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                <p className="text-foreground mt-1">{metricLabel}: {point.value.toFixed(1)} {unit}</p>
                <p className={`mt-1 ${deltaClass}`}>{deltaText}</p>
            </div>
        );
    }

    const formatBestWeight = (value: number, reps: number) => {
        if (value <= 0) return '-';
        return isArabic ? `${value.toFixed(1)} ${txt.weightUnit} × ${reps}` : `${value.toFixed(1)} ${txt.weightUnit} x ${reps}`;
    };

    const formatBestReps = (reps: number, weight: number) => {
        if (reps <= 0) return '-';
        return isArabic ? `${reps} ${txt.repsAt} ${weight.toFixed(1)} ${txt.weightUnit}` : `${reps} ${txt.repsAt} ${weight.toFixed(1)} ${txt.weightUnit}`;
    };

    const formatBestVolume = (value: number) => {
        if (value <= 0) return '-';
        return `${value.toFixed(1)} ${txt.weightUnit}`;
    };

    const chartGridStroke = 'rgba(148, 163, 184, 0.58)';

    const buildChartTicks = useCallback((values: number[], divisions = 4) => {
        const maxValue = Math.max(0, ...values);
        if (maxValue <= 0) {
            return [0, 1, 2, 3, 4, 5];
        }

        const rawStep = Math.max(1, maxValue / divisions);
        const magnitude = 10 ** Math.floor(Math.log10(rawStep));
        const candidates = [1, 2, 2.5, 5, 10];
        const step = candidates.find((candidate) => rawStep <= candidate * magnitude) ?? 10;
        const tickStep = Math.max(1, step * magnitude);
        const top = Math.ceil(maxValue / tickStep) * tickStep + tickStep;

        const ticks: number[] = [];
        for (let value = 0; value <= top; value += tickStep) {
            ticks.push(value);
        }
        return ticks;
    }, []);

    const workoutTrendTicks = useMemo(() => buildChartTicks(workoutStats.map((point) => Number(point.workouts ?? 0))), [buildChartTicks, workoutStats]);
    const sessionLoadTicks = useMemo(() => buildChartTicks(sessionVolumeSeries.map((point) => Number(point.volume ?? 0))), [buildChartTicks, sessionVolumeSeries]);
    const renderGridLines = useCallback((ticks: number[]) => ticks.map((tick) => (
        <ReferenceLine
            key={`grid-${tick}`}
            y={tick}
            stroke={chartGridStroke}
            strokeDasharray="3 3"
            ifOverflow="extendDomain"
        />
    )), [chartGridStroke]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{txt.subtitle}</p>
            </div>

            <div className="kpi-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="section-chip mb-1">{txt.statsRange}</p>
                        <p className="text-sm text-muted-foreground">{txt.selectedRange}: {selectedRangeLabel}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {RANGE_OPTIONS.map((option) => {
                            const active = option.days === trendRangeDays;
                            const label = option.days === 7
                                ? txt.range7Days
                                : option.days === 30
                                    ? txt.range30Days
                                    : option.days === 90
                                        ? txt.range90Days
                                        : txt.rangeAll;
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => setTrendRangeDays(option.days)}
                                    className={`px-3 py-1.5 text-xs font-bold border rounded-sm transition-colors ${active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{txt.workoutsInRange}</p>
                        <p className="text-lg font-mono text-foreground mt-1">{progressData?.range_summary.workouts ?? 0}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{txt.bodyTracking}</p>
                        <p className="text-lg font-mono text-foreground mt-1">{biometrics.length}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{txt.sessionsLogged}</p>
                        <p className="text-lg font-mono text-foreground mt-1">{recentSessions.length}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="kpi-card p-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                        <p className="section-chip">{txt.bodyTracking}</p>
                        <p className="text-xs text-muted-foreground font-mono">{selectedRangeLabel}</p>
                    </div>
                    <div className="space-y-3">
                        {[
                            { title: txt.weight, unit: 'kg', series: weightSeries, color: 'var(--primary)' },
                            { title: txt.bodyFat, unit: '%', series: bodyFatSeries, color: '#f97316' },
                            { title: txt.muscleMass, unit: 'kg', series: muscleSeries, color: '#22c55e' },
                        ].map((metric) => (
                            <div key={metric.title} className="rounded-sm border border-border bg-muted/10 p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground">{metric.title}</p>
                                    <p className="text-xs font-mono text-foreground">
                                        {metric.series.length > 0 ? `${metric.series[metric.series.length - 1].value.toFixed(1)} ${metric.unit}` : txt.noData}
                                    </p>
                                </div>
                                <div className="h-28">
                                    {metric.series.length > 0 ? (
                                        <SafeResponsiveChart>
                                            <LineChart data={metric.series}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={(value) => {
                                                        const date = new Date(value);
                                                        return `${date.getMonth() + 1}/${date.getDate()}`;
                                                    }}
                                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                                <Tooltip content={<MetricTooltipContent unit={metric.unit} metricLabel={metric.title} />} />
                                                <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2} dot={{ r: 2, fill: metric.color }} />
                                            </LineChart>
                                        </SafeResponsiveChart>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground font-mono">
                                            {txt.noDataInRange}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="kpi-card p-5">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                            <p className="section-chip">{txt.workoutTrend}</p>
                            <p className="text-xs text-muted-foreground font-mono">{selectedRangeLabel}</p>
                        </div>
                        <div className="h-44">
                            {workoutStats.length ? (
                                <SafeResponsiveChart>
                                    <LineChart data={workoutStats}>
                                        {renderGridLines(workoutTrendTicks)}
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(value) => {
                                                const date = new Date(value);
                                                return `${date.getMonth() + 1}/${date.getDate()}`;
                                            }}
                                        />
                                        <YAxis
                                            ticks={workoutTrendTicks}
                                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            allowDecimals={false}
                                            domain={[0, workoutTrendTicks[workoutTrendTicks.length - 1] ?? 0]}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'var(--muted)' }}
                                            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                            labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: 'short', day: 'numeric' })}
                                        />
                                        <Line type="monotone" dataKey="workouts" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2, fill: 'var(--primary)' }} />
                                    </LineChart>
                                </SafeResponsiveChart>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono border border-dashed border-border flex-col">
                                    <Activity size={24} className="mb-2 opacity-50" />
                                    <span>{txt.noWorkoutData}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="kpi-card p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className="section-chip">{txt.sessionLoad}</p>
                            <p className="text-xs text-muted-foreground font-mono">{selectedRangeLabel}</p>
                        </div>
                        <div className="h-40">
                            {sessionVolumeSeries.length > 0 ? (
                                <SafeResponsiveChart>
                                    <LineChart data={sessionVolumeSeries}>
                                        {renderGridLines(sessionLoadTicks)}
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(value) => {
                                                const date = new Date(value);
                                                return `${date.getMonth() + 1}/${date.getDate()}`;
                                            }}
                                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            ticks={sessionLoadTicks}
                                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            domain={[0, sessionLoadTicks[sessionLoadTicks.length - 1] ?? 0]}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                            labelFormatter={(label) => formatDate(String(label), { year: 'numeric', month: 'short', day: 'numeric' })}
                                        />
                                        <Line type="monotone" dataKey="volume" stroke="var(--primary)" strokeWidth={2} name="Volume (kg)" dot={{ r: 2, fill: 'var(--primary)' }} />
                                    </LineChart>
                                </SafeResponsiveChart>
                            ) : (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-mono border border-dashed border-border">
                                    {txt.noSessionVolume}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="kpi-card p-4" dir={isArabic ? 'rtl' : 'ltr'}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="section-chip">{`${txt.prTable} (${selectedRangeLabel})`}</p>
                            <p className="text-xs text-muted-foreground font-mono">{exercisePrTable.length}</p>
                        </div>
                        {exercisePrTable.length > 0 ? (
                            <>
                                <div className="space-y-2">
                                    {visibleExercisePrTable.map((row) => (
                                        <div key={row.exercise} className="border border-border bg-muted/10 px-3 py-2">
                                            <div className={`flex items-start justify-between gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
                                                <div className={`min-w-0 flex-1 ${isArabic ? 'text-right' : ''}`}>
                                                    <p className="text-sm font-medium text-foreground">{row.exercise}</p>
                                                    <p className={`text-xs text-muted-foreground ${isArabic ? 'font-sans' : ''}`}>
                                                        {formatBestReps(row.best_reps, row.best_reps_weight)}
                                                    </p>
                                                </div>
                                                <div className={`text-right ${isArabic ? 'text-left' : ''}`}>
                                                    <p className="text-sm font-mono text-foreground">
                                                        {formatBestWeight(row.best_weight, row.best_weight_reps)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatBestVolume(row.best_volume)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <TablePagination
                                    page={prTablePage}
                                    totalPages={totalPrPages}
                                    onPrevious={() => setPrTablePage((prev) => Math.max(1, prev - 1))}
                                    onNext={() => setPrTablePage((prev) => Math.min(totalPrPages, prev + 1))}
                                />
                            </>
                        ) : (
                            <div className="h-24 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border">
                                {txt.noPrData}
                            </div>
                        )}
                    </div>

                    <div className="kpi-card p-4">
                        <p className="section-chip mb-3">{txt.quickLog}</p>
                        <form onSubmit={handleLogBiometrics} className="grid grid-cols-2 gap-2 items-end">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.heightCm}</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={height} onChange={(e) => setHeight(e.target.value)} placeholder={txt.eg175} />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.weightKg}</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={txt.eg75} />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.bodyFatPct}</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder={txt.eg15} />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.muscleKg}</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={muscleMass} onChange={(e) => setMuscleMass(e.target.value)} placeholder={txt.eg32} />
                            </div>
                            <button type="submit" disabled={loggingBiometrics || (!height && !weight && !bodyFat && !muscleMass)} className="btn-primary py-1.5 px-4 text-sm whitespace-nowrap col-span-2">
                                {loggingBiometrics ? txt.saving : txt.log}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
