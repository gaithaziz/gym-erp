'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dumbbell, PlayCircle, X } from 'lucide-react';

import Modal from '@/components/Modal';
import PlanDetailsToggle from '@/components/PlanDetailsToggle';
import { useFeedback } from '@/components/FeedbackProvider';
import { api } from '@/lib/api';
import { useLocale } from '@/context/LocaleContext';

import { fetchMemberPlans, fetchMemberSessionLogs } from '../_shared/customerData';
import type { MemberPlan } from '../_shared/types';

type SessionEntryDraft = {
    exercise_id?: string;
    exercise_name: string;
    target_sets?: number;
    target_reps?: number;
    sets_completed: number;
    reps_completed: number;
    weight_kg: string;
};

type GroupedExercises = Array<{
    groupName: string;
    exercises: NonNullable<MemberPlan['exercises']>;
}>;

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

export default function MemberPlansPage() {
    const { locale } = useLocale();
    const { showToast } = useFeedback();
    const [plans, setPlans] = useState<MemberPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sessionModalPlan, setSessionModalPlan] = useState<MemberPlan | null>(null);
    const [sessionDuration, setSessionDuration] = useState('');
    const [sessionNotes, setSessionNotes] = useState('');
    const [sessionEntries, setSessionEntries] = useState<SessionEntryDraft[]>([]);
    const [selectedSessionGroup, setSelectedSessionGroup] = useState('');
    const [loggingSession, setLoggingSession] = useState(false);
    const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
    const [expandedPlanIds, setExpandedPlanIds] = useState<Record<string, boolean>>({});
    const [videoPopup, setVideoPopup] = useState<{
        title: string;
        youtubeEmbedUrl?: string;
        videoUrl?: string;
        externalUrl?: string;
    } | null>(null);
    const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    const apiOrigin = configuredApiUrl.endsWith('/api/v1')
        ? configuredApiUrl.slice(0, -'/api/v1'.length)
        : configuredApiUrl;

    const toAbsoluteUrl = (url: string) => (url.startsWith('http') ? url : `${apiOrigin}${url}`);
    const txt = locale === 'ar' ? {
        loadPlansFailed: 'فشل تحميل خطط التمرين',
        fallbackExercise: 'تمرين',
        workoutLogged: 'تم تسجيل جلسة التمرين بنجاح.',
        workoutLogFailed: 'فشل تسجيل جلسة التمرين.',
        title: 'خطط التمرين الخاصة بي',
        subtitle: 'خطط التمرين المعينة وتسجيل الجلسات.',
        plansAssigned: 'الخطط المعينة',
        totalExercises: 'إجمالي التمارين',
        sessions7d: 'الجلسات (7 أيام)',
        planLibrary: 'مكتبة الخطط',
        noDescription: 'بدون وصف',
        exercises: 'تمارين',
        logSession: 'تسجيل جلسة',
        general: 'عام',
        sets: 'الجولات',
        reps: 'التكرارات',
        duration: 'المدة',
        min: 'دقيقة',
        video: 'فيديو',
        watchVideo: 'مشاهدة الفيديو',
        noPlansTitle: 'لا توجد خطط تمرين معينة بعد.',
        noPlansHint: 'سيقوم المدرب بتعيين خطط لك.',
        logSessionTitle: 'تسجيل جلسة',
        workoutGroupDoneToday: 'مجموعة التمرين المنفذة اليوم',
        durationMinutes: 'المدة (بالدقائق)',
        durationPlaceholder: 'مثال: 60',
        sessionNotes: 'ملاحظات الجلسة',
        notesPlaceholder: 'كيف كانت الجلسة؟',
        weightKg: 'الوزن (كجم)',
        optional: 'اختياري',
        cancel: 'إلغاء',
        saving: 'جارٍ الحفظ...',
        saveSession: 'حفظ الجلسة',
        closeVideo: 'إغلاق الفيديو',
        videoTitleSuffix: 'فيديو',
        previewUnavailable: 'تعذر معاينة هذا المصدر في النافذة المنبثقة.',
        openSource: 'فتح المصدر',
        viewDetails: '\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644',
        collapseDetails: '\u0637\u064a',
        previewSummary: '\u0645\u0639\u0627\u064a\u0646\u0629',
        moreExercises: '\u062a\u0645\u0627\u0631\u064a\u0646 \u0625\u0636\u0627\u0641\u064a\u0629',
        noExercisesPreview: '\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0645\u0627\u0631\u064a\u0646 \u0645\u0636\u0627\u0641\u0629 \u0628\u0639\u062f.',
    } : {
        loadPlansFailed: 'Failed to load workout plans',
        fallbackExercise: 'Exercise',
        workoutLogged: 'Workout session logged successfully.',
        workoutLogFailed: 'Failed to log workout session.',
        title: 'My Workout Plans',
        subtitle: 'Assigned workout plans and session logging.',
        plansAssigned: 'Plans Assigned',
        totalExercises: 'Total Exercises',
        sessions7d: 'Sessions (7d)',
        planLibrary: 'Plan Library',
        noDescription: 'No description',
        exercises: 'exercises',
        logSession: 'Log Session',
        general: 'General',
        sets: 'Sets',
        reps: 'Reps',
        duration: 'Duration',
        min: 'min',
        video: 'Video',
        watchVideo: 'Watch Video',
        noPlansTitle: 'No workout plans assigned yet.',
        noPlansHint: 'Your coach will assign plans to you.',
        logSessionTitle: 'Log Session',
        workoutGroupDoneToday: 'Workout Group Done Today',
        durationMinutes: 'Duration (minutes)',
        durationPlaceholder: 'e.g. 60',
        sessionNotes: 'Session Notes',
        notesPlaceholder: 'How did it go?',
        weightKg: 'Weight (kg)',
        optional: 'Optional',
        cancel: 'Cancel',
        saving: 'Saving...',
        saveSession: 'Save Session',
        closeVideo: 'Close video',
        videoTitleSuffix: 'video',
        previewUnavailable: 'Unable to preview this source in popup.',
        openSource: 'Open Source',
        viewDetails: 'View Details',
        collapseDetails: 'Collapse',
        previewSummary: 'Preview',
        moreExercises: 'more exercises',
        noExercisesPreview: 'No exercises added yet.',
    };

    const getExerciseDisplayName = (
        exercise: NonNullable<MemberPlan['exercises']>[number],
        index: number
    ) => exercise.exercise_name || exercise.exercise?.name || exercise.name || `${txt.fallbackExercise} ${index + 1}`;

    const getGroupedExercises = (plan: MemberPlan): GroupedExercises => Array.from(
        (plan.exercises || []).reduce((acc, exercise) => {
            const groupName = exercise.section_name?.trim() || txt.general;
            if (!acc.has(groupName)) acc.set(groupName, []);
            acc.get(groupName)?.push(exercise);
            return acc;
        }, new Map<string, NonNullable<MemberPlan['exercises']>>())
    ).map(([groupName, exercises]) => ({
        groupName,
        exercises: exercises.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }));

    const renderCollapsedPlanPreview = (plan: MemberPlan) => {
        const groupedExercises = getGroupedExercises(plan);
        if (groupedExercises.length === 0) {
            return (
                <div className="rounded-sm border border-dashed border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                    {txt.noExercisesPreview}
                </div>
            );
        }

        const previewGroups = groupedExercises.slice(0, 2);
        const totalExerciseCount = groupedExercises.reduce((sum, group) => sum + group.exercises.length, 0);
        const previewExerciseCount = previewGroups.reduce((sum, group) => sum + Math.min(group.exercises.length, 2), 0);
        const remainingExerciseCount = Math.max(totalExerciseCount - previewExerciseCount, 0);

        return (
            <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">{txt.previewSummary}</p>
                {previewGroups.map(({ groupName, exercises }) => (
                    <div key={`${plan.id}-${groupName}-preview`} className="rounded-sm border border-border bg-muted/15 px-3 py-2">
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-primary font-mono">{groupName}</p>
                        <div className="space-y-1.5">
                            {exercises.slice(0, 2).map((exercise, index) => (
                                <div key={`${plan.id}-${groupName}-${exercise.id || exercise.exercise_id || index}`} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="min-w-0 truncate text-foreground">
                                        {getExerciseDisplayName(exercise, index)}
                                    </span>
                                    <span className="shrink-0 text-[11px] font-mono text-muted-foreground">
                                        {exercise.sets}x{exercise.reps}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {remainingExerciseCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                        +{remainingExerciseCount} {txt.moreExercises}
                    </p>
                )}
            </div>
        );
    };

    const renderExpandedPlanDetails = (plan: MemberPlan) => {
        const groupedExercises = getGroupedExercises(plan);
        if (groupedExercises.length === 0) return null;

        return (
            <div className="space-y-2">
                {groupedExercises.map(({ groupName, exercises }) => (
                    <div key={`${plan.id}-${groupName}`} className="border border-border bg-muted/20 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-primary font-mono mb-1">{groupName}</p>
                        <div className="space-y-2">
                            {exercises.map((exercise, index) => {
                                const videoUrl = resolveExerciseVideoUrl(exercise);
                                const exerciseName = getExerciseDisplayName(exercise, index);
                                return (
                                    <div key={`${plan.id}-${groupName}-${exercise.id || exercise.exercise_id || index}`} className="border border-border bg-background/60 p-2 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-semibold text-foreground">{exerciseName}</p>
                                            <span className="text-[11px] text-muted-foreground font-mono">{exercise.sets}x{exercise.reps}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                                            <span className="px-1.5 py-0.5 border border-border text-muted-foreground">{txt.sets}: {exercise.sets}</span>
                                            <span className="px-1.5 py-0.5 border border-border text-muted-foreground">{txt.reps}: {exercise.reps}</span>
                                            {exercise.duration_minutes ? (
                                                <span className="px-1.5 py-0.5 border border-border text-muted-foreground">{txt.duration}: {exercise.duration_minutes} {txt.min}</span>
                                            ) : null}
                                            {exercise.video_provider ? (
                                                <span className="px-1.5 py-0.5 border border-border text-primary">{txt.video}: {exercise.video_provider}</span>
                                            ) : null}
                                        </div>
                                        {videoUrl && (
                                            <div className="space-y-2">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20"
                                                    onClick={() => openVideoPopup(exerciseName, videoUrl)}
                                                >
                                                    <PlayCircle size={12} />
                                                    {txt.watchVideo}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const resolveExerciseVideoUrl = (exercise: NonNullable<MemberPlan['exercises']>[number]) => {
        if (exercise.embed_url) return toAbsoluteUrl(exercise.embed_url);
        if (exercise.video_type === 'UPLOAD' && exercise.uploaded_video_url) return toAbsoluteUrl(exercise.uploaded_video_url);
        if (exercise.video_url) return toAbsoluteUrl(exercise.video_url);
        return null;
    };

    const isYoutubeEmbed = (url: string) => {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
            return host === 'youtube.com'
                || host === 'm.youtube.com'
                || host === 'youtu.be'
                || host === 'youtube-nocookie.com';
        } catch {
            return false;
        }
    };

    const getYouTubeEmbedUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
            const isValidYouTubeId = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value);
            const toEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;

            if (host === 'youtube.com' || host === 'm.youtube.com') {
                const id = parsed.searchParams.get('v');
                if (id && isValidYouTubeId(id)) return toEmbed(id);
                const shorts = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
                if (shorts?.[1] && isValidYouTubeId(shorts[1])) return toEmbed(shorts[1]);
                const live = parsed.pathname.match(/^\/live\/([^/?]+)/);
                if (live?.[1] && isValidYouTubeId(live[1])) return toEmbed(live[1]);
                const embed = parsed.pathname.match(/^\/embed\/([^/?]+)/);
                if (embed?.[1] && isValidYouTubeId(embed[1])) return toEmbed(embed[1]);
                return null;
            }

            if (host === 'youtu.be') {
                const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
                return id && isValidYouTubeId(id) ? toEmbed(id) : null;
            }

            if (host === 'youtube-nocookie.com') {
                const match = parsed.pathname.match(/\/embed\/([^/?]+)/);
                return match?.[1] && isValidYouTubeId(match[1]) ? toEmbed(match[1]) : null;
            }

            return null;
        } catch {
            return null;
        }
    };

    const openVideoPopup = (exerciseName: string, videoUrl: string) => {
        const youtubeEmbedUrl = isYoutubeEmbed(videoUrl) ? (getYouTubeEmbedUrl(videoUrl) || videoUrl) : undefined;
        setVideoPopup({
            title: exerciseName,
            youtubeEmbedUrl,
            videoUrl: youtubeEmbedUrl ? undefined : videoUrl,
            externalUrl: videoUrl,
        });
    };

    const loadPlans = useCallback(async () => {
        try {
            const data = await fetchMemberPlans();
            setPlans(data);
            setLoadError(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : txt.loadPlansFailed;
            setPlans([]);
            setLoadError(message);
            showToast(message, 'error');
        }
    }, [showToast, txt.loadPlansFailed]);

    const loadSessionSummary = useCallback(async () => {
        const logs = await fetchMemberSessionLogs();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setHours(0, 0, 0, 0);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        setSessionsThisWeek(logs.filter((session) => new Date(session.performed_at) >= sevenDaysAgo).length);
    }, []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await Promise.all([loadPlans(), loadSessionSummary()]);
            setLoading(false);
        };
        load();
    }, [loadPlans, loadSessionSummary]);

    const totalExercises = useMemo(
        () => plans.reduce((sum, plan) => sum + (plan.exercises?.length || 0), 0),
        [plans]
    );

    const openSessionLogger = (plan: MemberPlan) => {
        const groups = Array.from(
            new Set((plan.exercises || []).map((exercise) => exercise.section_name?.trim() || 'General'))
        );
        const defaultGroup = groups[0] || 'General';
        const groupExercises = (plan.exercises || []).filter(
            (exercise) => (exercise.section_name?.trim() || 'General') === defaultGroup
        );
        const baseEntries = groupExercises.map((exercise, index) => ({
            exercise_id: exercise.exercise_id,
            exercise_name: exercise.exercise_name || exercise.exercise?.name || exercise.name || `${txt.fallbackExercise} ${index + 1}`,
            target_sets: exercise.sets || 0,
            target_reps: exercise.reps || 0,
            sets_completed: exercise.sets || 0,
            reps_completed: exercise.reps || 0,
            weight_kg: '',
        }));
        setSessionModalPlan(plan);
        setSelectedSessionGroup(defaultGroup);
        setSessionEntries(baseEntries.length > 0 ? baseEntries : [{
            exercise_name: `${txt.fallbackExercise} 1`,
            sets_completed: 0,
            reps_completed: 0,
            weight_kg: '',
        }]);
        setSessionDuration('');
        setSessionNotes('');
    };

    const updateSessionGroup = (groupName: string) => {
        if (!sessionModalPlan) return;
        const groupExercises = (sessionModalPlan.exercises || []).filter(
            (exercise) => (exercise.section_name?.trim() || txt.general) === groupName
        );
        const nextEntries = groupExercises.map((exercise, index) => ({
            exercise_id: exercise.exercise_id,
            exercise_name: exercise.exercise_name || exercise.exercise?.name || exercise.name || `${txt.fallbackExercise} ${index + 1}`,
            target_sets: exercise.sets || 0,
            target_reps: exercise.reps || 0,
            sets_completed: exercise.sets || 0,
            reps_completed: exercise.reps || 0,
            weight_kg: '',
        }));
        setSelectedSessionGroup(groupName);
        setSessionEntries(nextEntries.length > 0 ? nextEntries : [{
            exercise_name: `${txt.fallbackExercise} 1`,
            sets_completed: 0,
            reps_completed: 0,
            weight_kg: '',
        }]);
    };

    const updateSessionEntry = (
        index: number,
        field: 'sets_completed' | 'reps_completed' | 'weight_kg',
        value: string
    ) => {
        setSessionEntries((prev) => prev.map((entry, idx) => {
            if (idx !== index) return entry;
            if (field === 'weight_kg') return { ...entry, weight_kg: value };
            return { ...entry, [field]: Number(value) || 0 };
        }));
    };

    const handleLogSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sessionModalPlan) return;

        setLoggingSession(true);
        try {
            await api.post('/fitness/session-logs', {
                plan_id: sessionModalPlan.id,
                duration_minutes: sessionDuration ? Number(sessionDuration) : undefined,
                notes: sessionNotes || undefined,
                entries: sessionEntries.map((entry, index) => ({
                    exercise_id: entry.exercise_id || undefined,
                    exercise_name: entry.exercise_name,
                    target_sets: entry.target_sets ?? undefined,
                    target_reps: entry.target_reps ?? undefined,
                    sets_completed: entry.sets_completed,
                    reps_completed: entry.reps_completed,
                    weight_kg: entry.weight_kg ? Number(entry.weight_kg) : undefined,
                    order: index,
                })),
            });

            await loadSessionSummary();
            setSessionModalPlan(null);

            // Notify progress pages/tabs to refresh PR and session analytics immediately.
            const refreshTs = String(Date.now());
            localStorage.setItem('member_progress_refresh_ts', refreshTs);
            window.dispatchEvent(new Event('member-progress-refresh'));

            showToast(txt.workoutLogged, 'success');
        } catch (error) {
            showToast(getApiErrorMessage(error, txt.workoutLogFailed), 'error');
        } finally {
            setLoggingSession(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                <p className="text-sm text-muted-foreground">{txt.subtitle}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="kpi-card p-5">
                    <p className="section-chip">{txt.plansAssigned}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground font-mono">{plans.length}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="section-chip">{txt.totalExercises}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground font-mono">{totalExercises}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="section-chip">{txt.sessions7d}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground font-mono">{sessionsThisWeek}</p>
                </div>
            </div>

            <div className="kpi-card p-6">
                <p className="section-chip mb-4">{txt.planLibrary}</p>
                {loadError && (
                    <div className="mb-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {loadError}
                    </div>
                )}
                {plans.length > 0 ? (
                    <div className="space-y-3">
                        {plans.map((plan) => (
                            <div key={plan.id} className="p-4 border border-border bg-muted/10 hover:border-primary transition-colors">
                                <div className="flex items-start justify-between mb-3 gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2 bg-muted/30 border border-border text-primary">
                                            <Dumbbell size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-foreground font-bold text-sm uppercase truncate">{plan.name}</h3>
                                            <p className="text-muted-foreground text-xs">{plan.description || txt.noDescription}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 font-mono whitespace-nowrap">
                                        {plan.exercises?.length || 0} {txt.exercises}
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    className="btn-primary !py-1 !px-3 text-xs"
                                    onClick={() => openSessionLogger(plan)}
                                >
                                    {txt.logSession}
                                </button>

                                <div className="mt-3">
                                    {expandedPlanIds[plan.id]
                                        ? renderExpandedPlanDetails(plan)
                                        : renderCollapsedPlanPreview(plan)}
                                </div>

                                <div className="mt-3 border-t border-border pt-3">
                                    <PlanDetailsToggle
                                        expanded={!!expandedPlanIds[plan.id]}
                                        onClick={() => setExpandedPlanIds((prev) => ({
                                            ...prev,
                                            [plan.id]: !prev[plan.id],
                                        }))}
                                        expandLabel={txt.viewDetails}
                                        collapseLabel={txt.collapseDetails}
                                        size="sm"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                        <Dumbbell size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">{txt.noPlansTitle}</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">{txt.noPlansHint}</p>
                    </div>
                )}
            </div>

            <Modal
                isOpen={!!sessionModalPlan}
                onClose={() => setSessionModalPlan(null)}
                title={sessionModalPlan ? `${txt.logSession}: ${sessionModalPlan.name}` : txt.logSessionTitle}
            >
                {sessionModalPlan && (
                    <form onSubmit={handleLogSession} className="space-y-4">
                        {(() => {
                            const groups = Array.from(
                                new Set((sessionModalPlan.exercises || []).map((exercise) => exercise.section_name?.trim() || txt.general))
                            );
                            return (
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.workoutGroupDoneToday}</label>
                                    <select
                                        className="input-dark"
                                        value={selectedSessionGroup}
                                        onChange={(e) => updateSessionGroup(e.target.value)}
                                    >
                                        {groups.map((groupName) => (
                                            <option key={groupName} value={groupName}>{groupName}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })()}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.durationMinutes}</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="input-dark"
                                    value={sessionDuration}
                                    onChange={(e) => setSessionDuration(e.target.value)}
                                    placeholder={txt.durationPlaceholder}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.sessionNotes}</label>
                                <input
                                    type="text"
                                    className="input-dark"
                                    value={sessionNotes}
                                    onChange={(e) => setSessionNotes(e.target.value)}
                                    placeholder={txt.notesPlaceholder}
                                />
                            </div>
                        </div>

                        <div className="space-y-2 max-h-[360px] overflow-y-auto ltr:pr-1 rtl:pl-1">
                            {sessionEntries.map((entry, idx) => (
                                <div key={`${entry.exercise_name}-${idx}`} className="rounded-sm border border-border bg-muted/10 p-3 space-y-2">
                                    <p className="text-sm font-semibold text-foreground">{entry.exercise_name}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.sets}</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.sets_completed}
                                                onChange={(e) => updateSessionEntry(idx, 'sets_completed', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.reps}</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.reps_completed}
                                                onChange={(e) => updateSessionEntry(idx, 'reps_completed', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.weightKg}</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.5"
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.weight_kg}
                                                onChange={(e) => updateSessionEntry(idx, 'weight_kg', e.target.value)}
                                                placeholder={txt.optional}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end gap-3 pt-2 border-t border-border">
                            <button type="button" className="btn-ghost" onClick={() => setSessionModalPlan(null)} disabled={loggingSession}>{txt.cancel}</button>
                            <button type="submit" className="btn-primary" disabled={loggingSession}>
                                {loggingSession ? txt.saving : txt.saveSession}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {videoPopup && (
                <div className="fixed inset-0 z-[100] bg-background/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                    <div className="w-full max-w-4xl rounded-sm border border-border bg-card shadow-lg overflow-hidden">
                        <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                            <h3 className="text-sm sm:text-base font-semibold text-foreground truncate ltr:pr-3 rtl:pl-3">{videoPopup.title}</h3>
                            <button
                                type="button"
                                onClick={() => setVideoPopup(null)}
                                className="inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label={txt.closeVideo}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-3 sm:p-4">
                            {videoPopup.youtubeEmbedUrl ? (
                                <div className="aspect-video w-full rounded-sm overflow-hidden border border-border bg-black">
                                    <iframe
                                        src={`${videoPopup.youtubeEmbedUrl}?rel=0&playsinline=1&autoplay=1`}
                                        title={`${videoPopup.title} ${txt.videoTitleSuffix}`}
                                        className="h-full w-full"
                                        loading="lazy"
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                    />
                                </div>
                            ) : videoPopup.videoUrl ? (
                                <video controls playsInline src={videoPopup.videoUrl} className="w-full max-h-[70vh] rounded-sm border border-border bg-black" />
                            ) : (
                                <div className="rounded-sm border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                                    {txt.previewUnavailable}
                                </div>
                            )}
                            {videoPopup.externalUrl && (
                                <div className="mt-3">
                                    <a
                                        href={videoPopup.externalUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                                    >
                                        {txt.openSource}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
