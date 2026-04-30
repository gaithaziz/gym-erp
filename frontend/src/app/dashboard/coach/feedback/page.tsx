'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { MessageSquare, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { BranchSelector } from '@/components/BranchSelector';
import { useBranch } from '@/context/BranchContext';
import { getBranchParams } from '@/lib/branch';

interface Plan {
    id: string;
    name: string;
}

interface DietPlanSummary {
    id: string;
    name: string;
}

interface WorkoutLog {
    id: string;
    member_id: string;
    plan_id: string;
    date: string;
    completed: boolean;
    difficulty_rating: number | null;
    comment: string | null;
}

interface DietFeedbackRow {
    id: string;
    member_id: string;
    diet_plan_id: string;
    diet_plan_name?: string | null;
    rating: number;
    comment: string | null;
    created_at: string;
}

interface GymFeedbackRow {
    id: string;
    member_id: string;
    category: string;
    rating: number;
    comment: string | null;
    created_at: string;
}

interface CoachFeedbackSummary {
    stats: {
        workout_feedback: number;
        diet_feedback: number;
        gym_feedback: number;
        flagged_sessions: number;
    };
}

interface FlaggedWorkoutSession {
    id: string;
    member_id?: string | null;
    member_name?: string | null;
    plan_id: string;
    plan_name?: string | null;
    performed_at: string;
    duration_minutes?: number | null;
    notes?: string | null;
    rpe?: number | null;
    pain_level?: number | null;
    effort_feedback?: string | null;
    attachment_url?: string | null;
    attachment_mime?: string | null;
    session_volume?: number | null;
    review_status?: string;
    reviewed_at?: string | null;
    reviewer_note?: string | null;
    skipped_count?: number;
    pr_count?: number;
    entries?: Array<{
        id?: string;
        exercise_name?: string | null;
        sets_completed: number;
        reps_completed: number;
        weight_kg?: number | null;
        notes?: string | null;
        is_pr?: boolean;
        skipped?: boolean;
        set_details?: Array<{ set?: unknown; reps?: unknown; weightKg?: unknown }>;
        entry_volume?: number | null;
    }>;
}

export default function FeedbackPage() {
    const { locale, direction, formatDate } = useLocale();
    const { user } = useAuth();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [dietPlans, setDietPlans] = useState<DietPlanSummary[]>([]);
    const [selectedPlan, setSelectedPlan] = useState('');
    const [logs, setLogs] = useState<WorkoutLog[]>([]);
    const [dietFeedback, setDietFeedback] = useState<DietFeedbackRow[]>([]);
    const [gymFeedback, setGymFeedback] = useState<GymFeedbackRow[]>([]);
    const [flaggedSessions, setFlaggedSessions] = useState<FlaggedWorkoutSession[]>([]);
    const [summary, setSummary] = useState<CoachFeedbackSummary | null>(null);
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
    const [tab, setTab] = useState<'FLAGGED' | 'WORKOUT' | 'DIET' | 'GYM'>('FLAGGED');
    const [minRating, setMinRating] = useState(1);
    const [loading, setLoading] = useState(true);
    const canReviewSessions = ['ADMIN', 'MANAGER', 'COACH'].includes(user?.role || '');
    const canAdjustPlans = ['ADMIN', 'MANAGER', 'COACH'].includes(user?.role || '');
    const branchParams = useMemo(() => getBranchParams(selectedBranchId), [selectedBranchId]);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const [workoutRes, dietRes] = await Promise.all([
                    api.get('/fitness/plans', { params: branchParams }),
                    api.get('/fitness/diet-summaries', { params: branchParams }).catch(() => api.get('/fitness/diets', { params: branchParams })),
                ]);
                setPlans(workoutRes.data.data || []);
                setDietPlans(dietRes.data.data || []);
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        };
        fetchPlans();
    }, [branchParams]);

    useEffect(() => {
        api.get('/fitness/diet-feedback', { params: { min_rating: minRating, ...branchParams } })
            .then((res) => setDietFeedback(res.data.data || []))
            .catch(() => setDietFeedback([]));

        api.get('/fitness/gym-feedback', { params: { min_rating: minRating, ...branchParams } })
            .then((res) => setGymFeedback(res.data.data || []))
            .catch(() => setGymFeedback([]));

        api.get('/mobile/staff/coach/feedback', { params: branchParams })
            .then((res) => {
                setSummary(res.data.data || null);
                setFlaggedSessions(res.data.data?.flagged_sessions || []);
            })
            .catch(() => setFlaggedSessions([]));
    }, [branchParams, minRating]);

    const fetchLogs = async (planId: string) => {
        try {
            const res = await api.get(`/fitness/logs/${planId}`, { params: branchParams });
            setLogs(res.data.data);
        } catch (err) {
            console.error(err);
            setLogs([]);
        }
    };

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setSelectedPlan('');
            setLogs([]);
            setExpandedSessionId(null);
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [branchParams, setSelectedPlan]);

    const markSessionReviewed = async (sessionId: string) => {
        await api.post(`/fitness/session-logs/${sessionId}/review`, {
            reviewed: true,
            reviewer_note: locale === 'ar' ? 'تمت المراجعة من المدرب' : 'Reviewed by coach',
        });
        setFlaggedSessions((current) => current.filter((session) => session.id !== sessionId));
        setExpandedSessionId((current) => current === sessionId ? null : current);
    };

    const handlePlanChange = (planId: string) => {
        setSelectedPlan(planId);
        if (planId) fetchLogs(planId);
        else setLogs([]);
    };

    const workoutRows = useMemo(() => logs.filter((row) => !minRating || (row.difficulty_rating || 0) >= minRating), [logs, minRating]);

    const gymCategoryLabel = (category: string) => {
        const normalized = category.trim().toUpperCase();
        if (locale === 'ar') {
            if (normalized === 'GENERAL') return 'عام';
            if (normalized === 'EQUIPMENT') return 'المعدات';
            if (normalized === 'CLEANLINESS') return 'النظافة';
            if (normalized === 'STAFF') return 'الطاقم';
            if (normalized === 'CLASSES') return 'الحصص';
        } else {
            if (normalized === 'GENERAL') return 'General';
            if (normalized === 'EQUIPMENT') return 'Equipment';
            if (normalized === 'CLEANLINESS') return 'Cleanliness';
            if (normalized === 'STAFF') return 'Staff';
            if (normalized === 'CLASSES') return 'Classes';
        }
        return category;
    };

    const dietPlanNameById = useMemo(() => {
        const map = new Map<string, string>();
        dietPlans.forEach((plan) => map.set(plan.id, plan.name));
        return map;
    }, [dietPlans]);

    const effortLabel = (value?: string | null) => {
        if (locale === 'ar') {
            if (value === 'TOO_EASY') return 'سهل جداً';
            if (value === 'JUST_RIGHT') return 'مناسب';
            if (value === 'TOO_HARD') return 'صعب جداً';
        }
        if (value === 'TOO_EASY') return 'Too easy';
        if (value === 'JUST_RIGHT') return 'Just right';
        if (value === 'TOO_HARD') return 'Too hard';
        return value || '';
    };

    const minuteLabel = locale === 'ar' ? 'د' : 'min';
    const weightUnit = locale === 'ar' ? 'كجم' : 'kg';
    const prLabel = locale === 'ar' ? 'إنجازات' : 'PRs';
    const volumeUnit = locale === 'ar' ? 'كجم' : 'kg';

    const attachmentHref = (value?: string | null) => {
        if (!value) return null;
        return value.startsWith('http://') || value.startsWith('https://') ? value : value;
    };

    const renderStars = (rating: number | null) => {
        if (!rating) return <span className="text-[#333] text-xs">{locale === 'ar' ? 'بدون تقييم' : 'No rating'}</span>;
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={14} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-[#333]'} />
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-8" dir={direction}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">{locale === 'ar' ? 'ملاحظات المتدربين' : 'Trainee Feedback'}</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">{locale === 'ar' ? 'نظرة عامة على ملاحظات التدريب والتغذية وتجربة النادي' : 'Workout, diet, and full gym feedback overview'}</p>
                    {user?.role === 'MANAGER' ? (
                        <p className="mt-2 text-xs font-mono uppercase text-muted-foreground">{locale === 'ar' ? 'عرض فرع المدير' : 'Branch manager overview'}</p>
                    ) : null}
                </div>
                {branches.length > 0 && (
                    <BranchSelector
                        branches={branches}
                        selectedBranchId={selectedBranchId}
                        onSelect={setSelectedBranchId}
                    />
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {[
                    { label: locale === 'ar' ? 'مراجعات التمرين' : 'Workout Reviews', value: summary?.stats.workout_feedback ?? '--' },
                    { label: locale === 'ar' ? 'مراجعات التغذية' : 'Diet Reviews', value: summary?.stats.diet_feedback ?? '--' },
                    { label: locale === 'ar' ? 'ملاحظات النادي' : 'Gym Feedback', value: summary?.stats.gym_feedback ?? '--' },
                    { label: locale === 'ar' ? 'جلسات تحتاج مراجعة' : 'Flagged Sessions', value: summary?.stats.flagged_sessions ?? '--' },
                ].map((card) => (
                    <div key={card.label} className="kpi-card p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                        <p className="mt-2 text-3xl font-bold font-mono text-foreground">{card.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <button type="button" onClick={() => setTab('FLAGGED')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'FLAGGED' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                    {locale === 'ar' ? `مراجعة (${flaggedSessions.length})` : `Review (${flaggedSessions.length})`}
                </button>
                <button type="button" onClick={() => setTab('WORKOUT')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'WORKOUT' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{locale === 'ar' ? 'تمارين' : 'Workout'}</button>
                <button type="button" onClick={() => setTab('DIET')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'DIET' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{locale === 'ar' ? 'تغذية' : 'Diet'}</button>
                <button type="button" onClick={() => setTab('GYM')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'GYM' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{locale === 'ar' ? 'النادي' : 'Gym'}</button>
            </div>

            <div className="max-w-sm">
                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">{locale === 'ar' ? 'مرشح المشرف: الحد الأدنى للتقييم' : 'Admin Overview Filter: Min Rating'}</label>
                <select className="input-dark" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                    <option value={1}>1+</option>
                    <option value={2}>2+</option>
                    <option value={3}>3+</option>
                    <option value={4}>4+</option>
                    <option value={5}>{locale === 'ar' ? '5 فقط' : '5 only'}</option>
                </select>
            </div>

            {tab === 'FLAGGED' && (
                <div className="space-y-4">
                    {flaggedSessions.length === 0 ? (
                        <div className="chart-card text-center py-12 border border-dashed border-border">
                            <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد جلسات تحتاج مراجعة' : 'No flagged sessions yet'}</p>
                        </div>
                    ) : (
                        flaggedSessions.map((session) => (
                            <div key={session.id} className="kpi-card">
                                <div className="flex justify-between items-start gap-3 mb-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{session.plan_name || (locale === 'ar' ? 'جلسة تمرين' : 'Workout session')}</p>
                                        <p className="text-xs text-muted-foreground">{session.member_name || (locale === 'ar' ? 'عضو' : 'Member')}</p>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{formatDate(session.performed_at, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    {session.duration_minutes != null && <span>{session.duration_minutes} {minuteLabel}</span>}
                                    {session.session_volume != null && <span>{locale === 'ar' ? 'الحجم' : 'Volume'} {Math.round(session.session_volume)} {volumeUnit}</span>}
                                    {session.rpe != null && <span>RPE {session.rpe}</span>}
                                    {session.pain_level != null && <span>{locale === 'ar' ? 'الألم' : 'Pain'} {session.pain_level}</span>}
                                    {session.effort_feedback && <span>{effortLabel(session.effort_feedback)}</span>}
                                    <span>{session.skipped_count || 0} {locale === 'ar' ? 'تخطي' : 'skipped'}</span>
                                    <span>{session.pr_count || 0} {prLabel}</span>
                                    {session.attachment_url && <span>{locale === 'ar' ? 'مرفق' : 'attachment'}</span>}
                                </div>
                                {session.notes && (
                                    <div className="rounded-sm p-3 text-sm text-muted-foreground mt-3 bg-muted/40 border border-border">
                                        {session.notes}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setExpandedSessionId((current) => current === session.id ? null : session.id)}
                                    className="mt-3 text-xs font-mono uppercase text-primary hover:text-primary/80"
                                >
                                    {expandedSessionId === session.id ? (locale === 'ar' ? 'إخفاء التفاصيل' : 'Hide details') : (locale === 'ar' ? 'مراجعة الجلسة' : 'Review session')}
                                </button>
                                {expandedSessionId === session.id && (
                                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                                        {session.attachment_url && (
                                            <a href={attachmentHref(session.attachment_url) || '#'} target="_blank" rel="noreferrer" className="inline-flex text-xs font-mono uppercase text-primary hover:text-primary/80">
                                                {locale === 'ar' ? 'فتح المرفق' : 'Open attachment'}
                                            </a>
                                        )}
                                        {(session.entries || []).map((entry, index) => (
                                            <div key={entry.id || `${session.id}-${index}`} className="rounded-sm border border-border bg-muted/20 p-3">
                                                <div className="flex justify-between gap-3 text-xs">
                                                    <span className="font-semibold text-foreground">
                                                        {entry.exercise_name || (locale === 'ar' ? 'تمرين' : 'Exercise')}
                                                        {entry.skipped ? ` • ${locale === 'ar' ? 'تم التخطي' : 'Skipped'}` : ''}
                                                        {entry.is_pr ? ' • PR' : ''}
                                                    </span>
                                                    <span className="font-mono text-muted-foreground">
                                                        {entry.skipped
                                                            ? (locale === 'ar' ? 'تم التخطي' : 'Skipped')
                                                            : `${entry.sets_completed}x${entry.reps_completed} @ ${entry.weight_kg ?? 0}${weightUnit}${entry.entry_volume != null ? ` • ${Math.round(entry.entry_volume)} ${volumeUnit}` : ''}`}
                                                    </span>
                                                </div>
                                                {entry.set_details?.length ? (
                                                    <p className="mt-2 text-[11px] font-mono text-muted-foreground">
                                                        {entry.set_details.map((row, rowIndex) => `${Number(row.set ?? rowIndex + 1)}: ${Number(row.reps ?? 0)} @ ${Number(row.weightKg ?? 0)}${weightUnit}`).join(' | ')}
                                                    </p>
                                                ) : null}
                                                {entry.notes ? <p className="mt-2 text-xs text-muted-foreground">{entry.notes}</p> : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {canAdjustPlans && session.member_id ? (
                                        <Link
                                            href={`/dashboard/coach/plans?memberId=${session.member_id}`}
                                            className="rounded-sm border border-border px-3 py-2 text-xs font-mono uppercase text-muted-foreground hover:border-primary hover:text-primary"
                                        >
                                            {locale === 'ar' ? 'تعديل الخطة' : 'Adjust plan'}
                                        </Link>
                                    ) : null}
                                    {canReviewSessions ? (
                                        <button
                                            type="button"
                                            onClick={() => void markSessionReviewed(session.id)}
                                            className="rounded-sm border border-primary px-3 py-2 text-xs font-mono uppercase text-primary hover:bg-primary hover:text-primary-foreground"
                                        >
                                            {locale === 'ar' ? 'تمت المراجعة' : 'Mark reviewed'}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {tab === 'WORKOUT' && (
                <>
                    <div className="max-w-sm">
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">{locale === 'ar' ? 'اختر خطة التدريب' : 'Select Workout Plan'}</label>
                        <select className="input-dark" value={selectedPlan} onChange={e => handlePlanChange(e.target.value)}>
                            <option value="">{locale === 'ar' ? 'اختر خطة...' : 'Choose a plan...'}</option>
                            {plans.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    {selectedPlan && (
                        <div className="space-y-4">
                            {workoutRows.length === 0 ? (
                                <div className="chart-card text-center py-12 border border-dashed border-border">
                                    <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                                    <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد ملاحظات تدريب لهذا المرشح' : 'No workout feedback for this filter'}</p>
                                </div>
                            ) : (
                                workoutRows.map(log => (
                                    <div key={log.id} className="kpi-card">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-3 w-3 rounded-full ${log.completed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                <span className="text-sm font-medium text-foreground">
                                                    {log.completed ? (locale === 'ar' ? 'مكتمل' : 'Completed') : (locale === 'ar' ? 'جزئي' : 'Partial')}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDate(log.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-muted-foreground">{locale === 'ar' ? 'الصعوبة:' : 'Difficulty:'}</span>
                                            {renderStars(log.difficulty_rating)}
                                        </div>
                                        {log.comment && (
                                            <div className="rounded-sm p-3 text-sm text-muted-foreground mt-2 bg-muted/40 border border-border">
                                                {log.comment}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </>
            )}

            {tab === 'DIET' && (
                <div className="space-y-4">
                    {dietFeedback.length === 0 ? (
                        <div className="chart-card text-center py-12 border border-dashed border-border">
                            <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد ملاحظات تغذية لهذا المرشح' : 'No diet feedback yet for this filter'}</p>
                        </div>
                    ) : (
                        dietFeedback.map((row) => (
                            <div key={row.id} className="kpi-card">
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-xs text-muted-foreground font-mono">
                                        {locale === 'ar' ? 'الخطة:' : 'Plan:'} {row.diet_plan_name || dietPlanNameById.get(row.diet_plan_id) || row.diet_plan_id}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDate(row.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-muted-foreground">{locale === 'ar' ? 'التقييم:' : 'Rating:'}</span>
                                    {renderStars(row.rating)}
                                </div>
                                {row.comment && (
                                    <div className="rounded-sm p-3 text-sm text-muted-foreground mt-2 bg-muted/40 border border-border">
                                        {row.comment}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {tab === 'GYM' && (
                <div className="space-y-4">
                    {gymFeedback.length === 0 ? (
                        <div className="chart-card text-center py-12 border border-dashed border-border">
                            <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد ملاحظات للنادي لهذا المرشح' : 'No gym feedback yet for this filter'}</p>
                        </div>
                    ) : (
                        gymFeedback.map((row) => (
                            <div key={row.id} className="kpi-card">
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-xs text-muted-foreground font-mono">{locale === 'ar' ? 'الفئة:' : 'Category:'} {gymCategoryLabel(row.category)}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDate(row.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-muted-foreground">{locale === 'ar' ? 'التقييم:' : 'Rating:'}</span>
                                    {renderStars(row.rating)}
                                </div>
                                {row.comment && (
                                    <div className="rounded-sm p-3 text-sm text-muted-foreground mt-2 bg-muted/40 border border-border">
                                        {row.comment}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
