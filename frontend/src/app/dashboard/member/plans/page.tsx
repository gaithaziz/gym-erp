'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, PlayCircle, SkipForward, Trophy } from 'lucide-react';

import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

import {
    abandonWorkoutSession,
    completeWorkoutExercise,
    fetchActiveWorkoutSession,
    fetchMemberPlans,
    fetchMemberSessionLogs,
    finishWorkoutSession,
    skipWorkoutExercise,
    startWorkoutSession,
    updateWorkoutSession,
} from '../_shared/customerData';
import type { MemberPlan, WorkoutEffortFeedback, WorkoutSessionDraft, WorkoutSessionDraftEntry, WorkoutSessionLog } from '../_shared/types';

type ExerciseLogForm = {
    sets_completed: string;
    reps_completed: string;
    weight_kg: string;
    notes: string;
    is_pr: boolean;
    pr_type: string;
    pr_value: string;
    pr_notes: string;
};

type SessionEditForm = {
    duration_minutes: string;
    notes: string;
    rpe: string;
    pain_level: string;
    effort_feedback: WorkoutEffortFeedback | '';
};

const emptyForm: ExerciseLogForm = {
    sets_completed: '',
    reps_completed: '',
    weight_kg: '',
    notes: '',
    is_pr: false,
    pr_type: 'WEIGHT',
    pr_value: '',
    pr_notes: '',
};

const emptySessionEditForm: SessionEditForm = {
    duration_minutes: '',
    notes: '',
    rpe: '',
    pain_level: '',
    effort_feedback: '',
};

function toNumber(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function resolveExerciseVideoUrl(entry: WorkoutSessionDraftEntry): string | null {
    if (entry.embed_url) return entry.embed_url;
    if (entry.video_type === 'UPLOAD' && entry.uploaded_video_url) return entry.uploaded_video_url;
    return entry.video_url || null;
}

function isEmbedUrl(url: string) {
    return url.includes('youtube') || url.includes('youtu.be') || url.includes('/embed/');
}

export default function MemberPlansPage() {
    const { locale } = useLocale();
    const { showToast } = useFeedback();
    const [plans, setPlans] = useState<MemberPlan[]>([]);
    const [history, setHistory] = useState<WorkoutSessionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);
    const [activeDraft, setActiveDraft] = useState<WorkoutSessionDraft | null>(null);
    const [busy, setBusy] = useState(false);
    const [sessionNotes, setSessionNotes] = useState('');
    const [sessionDuration, setSessionDuration] = useState('');
    const [form, setForm] = useState<ExerciseLogForm>(emptyForm);
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [sessionEditForm, setSessionEditForm] = useState<SessionEditForm>(emptySessionEditForm);

    const txt = locale === 'ar' ? {
        title: 'جلسة التمرين',
        subtitle: 'ابدأ الجلسة وامشِ تمرينًا بتمرين مع تسجيل الـ PR أثناء التنفيذ.',
        plans: 'الخطط المعينة',
        noPlans: 'لا توجد خطط تمرين معينة بعد.',
        chooseSection: 'اختر القسم',
        start: 'ابدأ الجلسة',
        resume: 'استئناف الجلسة',
        abandon: 'إلغاء الجلسة',
        complete: 'إكمال التمرين',
        skip: 'تخطي',
        finish: 'إنهاء الجلسة',
        sets: 'الجولات المنفذة',
        reps: 'التكرارات المنفذة',
        weight: 'الوزن (كجم)',
        notes: 'ملاحظات',
        pr: 'هذا إنجاز شخصي',
        prType: 'نوع الـ PR',
        prValue: 'قيمة الـ PR',
        prNotes: 'ملاحظات الـ PR',
        prWeight: 'وزن',
        prReps: 'تكرارات',
        prTime: 'وقت',
        prVolume: 'حجم',
        prOther: 'أخرى',
        current: 'التمرين الحالي',
        progress: 'التقدم',
        target: 'الهدف',
        section: 'القسم',
        history: 'آخر الجلسات',
        noHistory: 'لا توجد جلسات مكتملة بعد.',
        sessionNotes: 'ملاحظات الجلسة',
        duration: 'مدة الجلسة (دقيقة)',
        saved: 'تم حفظ التمرين.',
        started: 'تم بدء الجلسة.',
        skipped: 'تم تخطي التمرين.',
        finished: 'تم إنهاء الجلسة.',
        abandoned: 'تم حذف الجلسة النشطة.',
        details: 'التفاصيل',
        hideDetails: 'إخفاء التفاصيل',
        editSession: 'تعديل الجلسة',
        saveSession: 'حفظ الجلسة',
        rpe: 'شدة الجهد',
        pain: 'الألم',
        effort: 'الإحساس بالجهد',
        tooEasy: 'سهل جداً',
        justRight: 'مناسب',
        tooHard: 'صعب جداً',
        attachment: 'المرفق',
        skippedLabel: 'تم التخطي',
        completedLabel: 'مكتمل',
        doneLabel: 'تم',
        nextLabel: 'التالي',
        autoPr: 'إنجاز شخصي',
        sessionUpdated: 'تم تحديث الجلسة.',
        cancel: 'إلغاء',
        exercise: 'تمرين',
        allExercisesComplete: 'اكتملت كل التمارين. أضف ملاحظات الجلسة ثم أنهِها.',
        minuteShort: 'د',
        weightUnit: 'كجم',
        prCount: 'إنجازات',
        loadFailed: 'تعذر تحميل الخطط',
        updateFailed: 'تعذر تحديث الجلسة',
        startFailed: 'تعذر بدء جلسة التمرين',
        saveFailed: 'تعذر حفظ التمرين',
        skipFailed: 'تعذر تخطي التمرين',
        finishFailed: 'تعذر إنهاء الجلسة',
        abandonFailed: 'تعذر إلغاء الجلسة',
    } : {
        title: 'Workout Session Runner',
        subtitle: 'Start a session, move exercise by exercise, and log PRs as they happen.',
        plans: 'Assigned plans',
        noPlans: 'No workout plans assigned yet.',
        chooseSection: 'Choose section',
        start: 'Start session',
        resume: 'Resume session',
        abandon: 'Abandon session',
        complete: 'Complete exercise',
        skip: 'Skip exercise',
        finish: 'Finish session',
        sets: 'Sets completed',
        reps: 'Reps completed',
        weight: 'Weight (kg)',
        notes: 'Notes',
        pr: 'This was a PR',
        prType: 'PR type',
        prValue: 'PR value',
        prNotes: 'PR notes',
        prWeight: 'Weight',
        prReps: 'Reps',
        prTime: 'Time',
        prVolume: 'Volume',
        prOther: 'Other',
        current: 'Current exercise',
        progress: 'Progress',
        target: 'Target',
        section: 'Section',
        history: 'Recent completed sessions',
        noHistory: 'No completed sessions yet.',
        sessionNotes: 'Session notes',
        duration: 'Session duration (min)',
        saved: 'Exercise logged.',
        started: 'Workout session started.',
        skipped: 'Exercise skipped.',
        finished: 'Workout session finished.',
        abandoned: 'Active workout session discarded.',
        details: 'Details',
        hideDetails: 'Hide details',
        editSession: 'Edit session',
        saveSession: 'Save session',
        rpe: 'RPE',
        pain: 'Pain',
        effort: 'Effort',
        tooEasy: 'Too easy',
        justRight: 'Just right',
        tooHard: 'Too hard',
        attachment: 'Attachment',
        skippedLabel: 'Skipped',
        completedLabel: 'Completed',
        doneLabel: 'Done',
        nextLabel: 'Next',
        autoPr: 'Auto PR',
        sessionUpdated: 'Session updated.',
        cancel: 'Cancel',
        exercise: 'Exercise',
        allExercisesComplete: 'All exercises are complete. Add session notes and finish the session.',
        minuteShort: 'min',
        weightUnit: 'kg',
        prCount: 'PRs',
        loadFailed: 'Failed to load plans',
        updateFailed: 'Failed to update session',
        startFailed: 'Failed to start workout session',
        saveFailed: 'Failed to save exercise',
        skipFailed: 'Failed to skip exercise',
        finishFailed: 'Failed to finish session',
        abandonFailed: 'Failed to abandon session',
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [plansData, historyData] = await Promise.all([
                    fetchMemberPlans(),
                    fetchMemberSessionLogs(),
                ]);
                setPlans(plansData);
                setHistory(historyData);
                const firstPlanId = plansData[0]?.id ?? null;
                setSelectedPlanId((current) => current ?? firstPlanId);
            } catch (error) {
                showToast(error instanceof Error ? error.message : txt.loadFailed, 'error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [showToast, txt.loadFailed]);

    useEffect(() => {
        if (!selectedPlanId) {
            setActiveDraft(null);
            return;
        }
        const loadDraft = async () => {
            try {
                const draft = await fetchActiveWorkoutSession(selectedPlanId);
                setActiveDraft(draft);
            } catch {
                setActiveDraft(null);
            }
        };
        void loadDraft();
    }, [selectedPlanId]);

    const selectedPlan = useMemo(
        () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
        [plans, selectedPlanId],
    );

    const sections = useMemo(() => {
        const values = new Set<string>();
        for (const exercise of selectedPlan?.exercises || []) {
            if (exercise.section_name?.trim()) values.add(exercise.section_name.trim());
        }
        return Array.from(values);
    }, [selectedPlan]);

    useEffect(() => {
        if (!selectedPlan) return;
        if (sections.length === 0) {
            setSelectedSection(null);
            return;
        }
        setSelectedSection((current) => (current && sections.includes(current) ? current : sections[0]));
    }, [selectedPlan, sections]);

    const currentEntry = activeDraft?.entries[activeDraft.current_exercise_index] ?? null;
    const completedCount = activeDraft?.entries.filter((entry) => entry.completed_at || entry.skipped).length ?? 0;
    const effortOptions: Array<{ value: WorkoutEffortFeedback; label: string }> = [
        { value: 'TOO_EASY', label: txt.tooEasy },
        { value: 'JUST_RIGHT', label: txt.justRight },
        { value: 'TOO_HARD', label: txt.tooHard },
    ];

    const canEditSession = (session: WorkoutSessionLog) => {
        const performedAt = new Date(session.performed_at).getTime();
        return Number.isFinite(performedAt) && Date.now() - performedAt <= 24 * 60 * 60 * 1000;
    };

    const startEditingSession = (session: WorkoutSessionLog) => {
        setExpandedSessionId(session.id);
        setEditingSessionId(session.id);
        setSessionEditForm({
            duration_minutes: session.duration_minutes != null ? String(session.duration_minutes) : '',
            notes: session.notes || '',
            rpe: session.rpe != null ? String(session.rpe) : '',
            pain_level: session.pain_level != null ? String(session.pain_level) : '',
            effort_feedback: session.effort_feedback || '',
        });
    };

    const effortLabel = (value?: WorkoutEffortFeedback | null) => {
        if (value === 'TOO_EASY') return txt.tooEasy;
        if (value === 'JUST_RIGHT') return txt.justRight;
        if (value === 'TOO_HARD') return txt.tooHard;
        return '';
    };

    const saveSessionEdit = async (session: WorkoutSessionLog) => {
        setBusy(true);
        try {
            const updated = await updateWorkoutSession(session.id, {
                duration_minutes: sessionEditForm.duration_minutes ? Number(sessionEditForm.duration_minutes) : null,
                notes: sessionEditForm.notes || null,
                rpe: sessionEditForm.rpe ? Number(sessionEditForm.rpe) : null,
                pain_level: sessionEditForm.pain_level ? Number(sessionEditForm.pain_level) : null,
                effort_feedback: sessionEditForm.effort_feedback || null,
                attachment_url: session.attachment_url || null,
                attachment_mime: session.attachment_mime || null,
                attachment_size_bytes: session.attachment_size_bytes || null,
            });
            setHistory((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            setEditingSessionId(null);
            setSessionEditForm(emptySessionEditForm);
            showToast(txt.sessionUpdated, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.updateFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (!currentEntry) {
            setForm(emptyForm);
            return;
        }
        setForm({
            sets_completed: currentEntry.sets_completed ? String(currentEntry.sets_completed) : '',
            reps_completed: currentEntry.reps_completed ? String(currentEntry.reps_completed) : '',
            weight_kg: currentEntry.weight_kg != null ? String(currentEntry.weight_kg) : '',
            notes: currentEntry.notes || '',
            is_pr: !!currentEntry.is_pr,
            pr_type: currentEntry.pr_type || 'WEIGHT',
            pr_value: currentEntry.pr_value || '',
            pr_notes: currentEntry.pr_notes || '',
        });
    }, [currentEntry]);

    const handleStart = async () => {
        if (!selectedPlanId) return;
        setBusy(true);
        try {
            const draft = await startWorkoutSession(selectedPlanId, selectedSection);
            setActiveDraft(draft);
            showToast(txt.started, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.startFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleComplete = async () => {
        if (!activeDraft || !currentEntry) return;
        setBusy(true);
        try {
            const nextDraft = await completeWorkoutExercise(activeDraft.id, currentEntry.id, {
                sets_completed: toNumber(form.sets_completed),
                reps_completed: toNumber(form.reps_completed),
                weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
                notes: form.notes || null,
                is_pr: form.is_pr,
                pr_type: form.is_pr ? form.pr_type : null,
                pr_value: form.is_pr ? form.pr_value || null : null,
                pr_notes: form.is_pr ? form.pr_notes || null : null,
            });
            setActiveDraft(nextDraft);
            showToast(txt.saved, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.saveFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleSkip = async () => {
        if (!activeDraft || !currentEntry) return;
        setBusy(true);
        try {
            const nextDraft = await skipWorkoutExercise(activeDraft.id, currentEntry.id, form.notes || null);
            setActiveDraft(nextDraft);
            showToast(txt.skipped, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.skipFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleFinish = async () => {
        if (!activeDraft) return;
        setBusy(true);
        try {
            const session = await finishWorkoutSession(activeDraft.id, {
                duration_minutes: sessionDuration ? Number(sessionDuration) : null,
                notes: sessionNotes || null,
            });
            setHistory((current) => [session, ...current]);
            setActiveDraft(null);
            setSessionDuration('');
            setSessionNotes('');
            showToast(txt.finished, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.finishFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleAbandon = async () => {
        if (!activeDraft) return;
        setBusy(true);
        try {
            await abandonWorkoutSession(activeDraft.id);
            setActiveDraft(null);
            showToast(txt.abandoned, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.abandonFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
    }

    return (
        <div className="space-y-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{txt.subtitle}</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="kpi-card p-5 space-y-3">
                    <p className="section-chip">{txt.plans}</p>
                    {plans.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">{txt.noPlans}</div>
                    ) : (
                        plans.map((plan) => (
                            <button
                                key={plan.id}
                                type="button"
                                onClick={() => setSelectedPlanId(plan.id)}
                                className={`w-full border p-4 text-left transition-colors ${selectedPlanId === plan.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/10 hover:border-primary/50'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                                        <p className="text-xs text-muted-foreground">{plan.description || ' '}</p>
                                    </div>
                                    <Dumbbell size={16} className="text-primary" />
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{plan.exercises?.length || 0} exercises</p>
                            </button>
                        ))
                    )}
                </div>

                <div className="space-y-6">
                    {selectedPlan ? (
                        <>
                            <div className="kpi-card p-5 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="section-chip">{selectedPlan.name}</p>
                                        <p className="mt-2 text-sm text-muted-foreground">{selectedPlan.description || ''}</p>
                                    </div>
                                    {!activeDraft ? (
                                        <button type="button" onClick={handleStart} disabled={busy} className="btn-primary px-4 py-2 text-sm">
                                            {txt.start}
                                        </button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button type="button" onClick={handleAbandon} disabled={busy} className="border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary">
                                                {txt.abandon}
                                            </button>
                                            <button type="button" onClick={handleFinish} disabled={busy} className="btn-primary px-4 py-2 text-sm">
                                                {txt.finish}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {sections.length > 0 && !activeDraft ? (
                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-muted-foreground">{txt.chooseSection}</label>
                                        <div className="flex flex-wrap gap-2">
                                            {sections.map((section) => (
                                                <button
                                                    key={section}
                                                    type="button"
                                                    onClick={() => setSelectedSection(section)}
                                                    className={`border px-3 py-1 text-xs ${selectedSection === section ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                                                >
                                                    {section}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {activeDraft ? (
                                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                                    <div className="kpi-card p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="section-chip">{txt.progress}</p>
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    {completedCount} / {activeDraft.entries.length}
                                                </p>
                                            </div>
                                            <p className="text-sm font-semibold text-foreground">
                                                {txt.current}: {Math.min(activeDraft.current_exercise_index + 1, activeDraft.entries.length)} / {activeDraft.entries.length}
                                            </p>
                                        </div>

                                        {currentEntry ? (
                                            <div className="space-y-4">
                                                <div className="rounded-sm border border-border bg-muted/10 p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-lg font-semibold text-foreground">{currentEntry.exercise_name || txt.exercise}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {txt.target}: {currentEntry.target_sets || 0} x {currentEntry.target_reps || 0}
                                                                {currentEntry.section_name ? ` • ${txt.section}: ${currentEntry.section_name}` : ''}
                                                            </p>
                                                        </div>
                                                        <Trophy size={18} className={currentEntry.is_pr ? 'text-primary' : 'text-muted-foreground'} />
                                                    </div>
                                                </div>

                                                {(() => {
                                                    const videoUrl = resolveExerciseVideoUrl(currentEntry);
                                                    if (!videoUrl) return null;
                                                    return (
                                                        <div className="overflow-hidden rounded-sm border border-border bg-black/60">
                                                            {isEmbedUrl(videoUrl) ? (
                                                                <iframe
                                                                    className="aspect-video w-full"
                                                                    src={videoUrl}
                                                                    title={`${currentEntry.exercise_name} demo`}
                                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                    allowFullScreen
                                                                />
                                                            ) : (
                                                                <video className="aspect-video w-full" src={videoUrl} controls />
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                <div className="grid gap-3 md:grid-cols-3">
                                                    <label className="space-y-1">
                                                        <span className="text-xs text-muted-foreground">{txt.sets}</span>
                                                        <input value={form.sets_completed} onChange={(event) => setForm((current) => ({ ...current, sets_completed: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                    </label>
                                                    <label className="space-y-1">
                                                        <span className="text-xs text-muted-foreground">{txt.reps}</span>
                                                        <input value={form.reps_completed} onChange={(event) => setForm((current) => ({ ...current, reps_completed: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                    </label>
                                                    <label className="space-y-1">
                                                        <span className="text-xs text-muted-foreground">{txt.weight}</span>
                                                        <input value={form.weight_kg} onChange={(event) => setForm((current) => ({ ...current, weight_kg: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                    </label>
                                                </div>

                                                <label className="flex items-center gap-2 text-sm text-foreground">
                                                    <input type="checkbox" checked={form.is_pr} onChange={(event) => setForm((current) => ({ ...current, is_pr: event.target.checked }))} />
                                                    {txt.pr}
                                                </label>

                                                {form.is_pr ? (
                                                    <div className="grid gap-3 md:grid-cols-3">
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.prType}</span>
                                                            <select value={form.pr_type} onChange={(event) => setForm((current) => ({ ...current, pr_type: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground">
                                                                <option value="WEIGHT">{txt.prWeight}</option>
                                                                <option value="REPS">{txt.prReps}</option>
                                                                <option value="TIME">{txt.prTime}</option>
                                                                <option value="VOLUME">{txt.prVolume}</option>
                                                                <option value="OTHER">{txt.prOther}</option>
                                                            </select>
                                                        </label>
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.prValue}</span>
                                                            <input value={form.pr_value} onChange={(event) => setForm((current) => ({ ...current, pr_value: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                        </label>
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.prNotes}</span>
                                                            <input value={form.pr_notes} onChange={(event) => setForm((current) => ({ ...current, pr_notes: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                        </label>
                                                    </div>
                                                ) : null}

                                                <label className="space-y-1">
                                                    <span className="text-xs text-muted-foreground">{txt.notes}</span>
                                                    <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                </label>

                                                <div className="flex flex-wrap gap-3">
                                                    <button type="button" onClick={handleComplete} disabled={busy} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                                                        <PlayCircle size={16} />
                                                        {txt.complete}
                                                    </button>
                                                    <button type="button" onClick={handleSkip} disabled={busy} className="inline-flex items-center gap-2 border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary">
                                                        <SkipForward size={16} />
                                                        {txt.skip}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-sm border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                                                {txt.allExercisesComplete}
                                            </div>
                                        )}
                                    </div>

                                    <div className="kpi-card p-5 space-y-3">
                                        <p className="section-chip">{txt.finish}</p>
                                        <label className="space-y-1">
                                            <span className="text-xs text-muted-foreground">{txt.duration}</span>
                                            <input value={sessionDuration} onChange={(event) => setSessionDuration(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs text-muted-foreground">{txt.sessionNotes}</span>
                                            <textarea value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} className="min-h-28 w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                        </label>
                                        <div className="space-y-2">
                                            {activeDraft.entries.map((entry, index) => (
                                                <div key={entry.id} className={`border px-3 py-2 text-xs ${index === activeDraft.current_exercise_index ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span>{index + 1}. {entry.exercise_name}</span>
                                                        <span>{entry.skipped ? txt.skippedLabel : entry.completed_at ? txt.doneLabel : txt.nextLabel}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div className="kpi-card p-5 space-y-3">
                                <p className="section-chip">{txt.history}</p>
                                {history.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{txt.noHistory}</p>
                                ) : (
                                    history
                                        .filter((session) => session.plan_id === selectedPlan.id)
                                        .slice(0, 6)
                                        .map((session) => {
                                            const expanded = expandedSessionId === session.id;
                                            const editing = editingSessionId === session.id;
                                            return (
                                            <div key={session.id} className="border border-border bg-muted/10 p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-foreground">{new Date(session.performed_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {session.duration_minutes || 0} {txt.minuteShort} • {session.entries.filter((entry) => !entry.skipped).length} {txt.completedLabel}
                                                            {session.entries.some((entry) => entry.skipped) ? ` • ${session.entries.filter((entry) => entry.skipped).length} ${txt.skippedLabel}` : ''}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{session.entries.filter((entry) => entry.is_pr).length} {txt.prCount}</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                    {session.rpe != null ? <span>{txt.rpe}: {session.rpe}</span> : null}
                                                    {session.pain_level != null ? <span>{txt.pain}: {session.pain_level}</span> : null}
                                                    {session.effort_feedback ? <span>{effortLabel(session.effort_feedback)}</span> : null}
                                                    {session.attachment_url ? <a href={session.attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80">{txt.attachment}</a> : null}
                                                </div>
                                                {session.notes ? <p className="rounded-sm border border-border bg-background/40 p-3 text-sm text-muted-foreground">{session.notes}</p> : null}
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedSessionId((current) => current === session.id ? null : session.id)}
                                                        className="border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary"
                                                    >
                                                        {expanded ? txt.hideDetails : txt.details}
                                                    </button>
                                                    {canEditSession(session) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditingSession(session)}
                                                            className="border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary"
                                                        >
                                                            {txt.editSession}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {expanded ? (
                                                    <div className="space-y-2 border-t border-border pt-3">
                                                        {session.entries.map((entry, index) => (
                                                            <div key={entry.id || `${session.id}-${index}`} className="rounded-sm border border-border bg-background/40 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <p className="text-sm font-semibold text-foreground">
                                                                        {entry.exercise_name || txt.exercise}
                                                                        {entry.skipped ? ` • ${txt.skippedLabel}` : ''}
                                                                        {entry.is_pr ? ` • ${txt.autoPr}` : ''}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {entry.skipped ? txt.skippedLabel : `${entry.sets_completed} x ${entry.reps_completed} @ ${entry.weight_kg ?? 0}${txt.weightUnit}`}
                                                                    </p>
                                                                </div>
                                                                {entry.set_details?.length ? (
                                                                    <p className="mt-2 text-xs font-mono text-muted-foreground">
                                                                        {entry.set_details.map((row, rowIndex) => `${row.set || rowIndex + 1}: ${row.reps || 0} @ ${row.weightKg ?? 0}${txt.weightUnit}`).join(' | ')}
                                                                    </p>
                                                                ) : null}
                                                                {entry.notes ? <p className="mt-2 text-xs text-muted-foreground">{entry.notes}</p> : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {editing ? (
                                                    <div className="grid gap-3 border-t border-border pt-3 md:grid-cols-2">
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.duration}</span>
                                                            <input value={sessionEditForm.duration_minutes} onChange={(event) => setSessionEditForm((current) => ({ ...current, duration_minutes: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                        </label>
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.rpe}</span>
                                                            <input value={sessionEditForm.rpe} onChange={(event) => setSessionEditForm((current) => ({ ...current, rpe: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                        </label>
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.pain}</span>
                                                            <input value={sessionEditForm.pain_level} onChange={(event) => setSessionEditForm((current) => ({ ...current, pain_level: event.target.value }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                        </label>
                                                        <label className="space-y-1">
                                                            <span className="text-xs text-muted-foreground">{txt.effort}</span>
                                                            <select value={sessionEditForm.effort_feedback} onChange={(event) => setSessionEditForm((current) => ({ ...current, effort_feedback: event.target.value as WorkoutEffortFeedback | '' }))} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground">
                                                                <option value="">--</option>
                                                                {effortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                            </select>
                                                        </label>
                                                        <label className="space-y-1 md:col-span-2">
                                                            <span className="text-xs text-muted-foreground">{txt.sessionNotes}</span>
                                                            <textarea value={sessionEditForm.notes} onChange={(event) => setSessionEditForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                        </label>
                                                        <div className="flex gap-2 md:col-span-2">
                                                            <button type="button" onClick={() => void saveSessionEdit(session)} disabled={busy} className="btn-primary px-4 py-2 text-sm">
                                                                {txt.saveSession}
                                                            </button>
                                                            <button type="button" onClick={() => { setEditingSessionId(null); setSessionEditForm(emptySessionEditForm); }} className="border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary">
                                                                {txt.cancel}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                            );
                                        })
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
