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
} from '../_shared/customerData';
import type { MemberPlan, WorkoutSessionDraft, WorkoutSessionDraftEntry, WorkoutSessionLog } from '../_shared/types';

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
                showToast(error instanceof Error ? error.message : 'Failed to load plans', 'error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [showToast]);

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
    }, [currentEntry?.id]);

    const handleStart = async () => {
        if (!selectedPlanId) return;
        setBusy(true);
        try {
            const draft = await startWorkoutSession(selectedPlanId, selectedSection);
            setActiveDraft(draft);
            showToast(txt.started, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to start workout session', 'error');
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
            showToast(error instanceof Error ? error.message : 'Failed to save exercise', 'error');
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
            showToast(error instanceof Error ? error.message : 'Failed to skip exercise', 'error');
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
            showToast(error instanceof Error ? error.message : 'Failed to finish session', 'error');
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
            showToast(error instanceof Error ? error.message : 'Failed to abandon session', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
    }

    return (
        <div className="space-y-6">
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
                                                            <p className="text-lg font-semibold text-foreground">{currentEntry.exercise_name || 'Exercise'}</p>
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
                                                                <option value="WEIGHT">Weight</option>
                                                                <option value="REPS">Reps</option>
                                                                <option value="TIME">Time</option>
                                                                <option value="VOLUME">Volume</option>
                                                                <option value="OTHER">Other</option>
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
                                                All exercises are complete. Add session notes and finish the session.
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
                                                        <span>{entry.skipped ? 'Skipped' : entry.completed_at ? 'Done' : 'Next'}</span>
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
                                        .map((session) => (
                                            <div key={session.id} className="border border-border bg-muted/10 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-foreground">{new Date(session.performed_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {session.duration_minutes || 0} min • {session.entries.filter((entry) => !entry.skipped).length} completed
                                                            {session.entries.some((entry) => entry.skipped) ? ` • ${session.entries.filter((entry) => entry.skipped).length} skipped` : ''}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{session.entries.filter((entry) => entry.is_pr).length} PRs</p>
                                                </div>
                                            </div>
                                        ))
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
