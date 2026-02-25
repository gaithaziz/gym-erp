'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';

import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { api } from '@/lib/api';

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

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

export default function MemberPlansPage() {
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

    const loadPlans = async () => {
        try {
            const data = await fetchMemberPlans();
            setPlans(data);
            setLoadError(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load workout plans';
            setPlans([]);
            setLoadError(message);
            showToast(message, 'error');
        }
    };

    const loadSessionSummary = async () => {
        const logs = await fetchMemberSessionLogs();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setHours(0, 0, 0, 0);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        setSessionsThisWeek(logs.filter((session) => new Date(session.performed_at) >= sevenDaysAgo).length);
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await Promise.all([loadPlans(), loadSessionSummary()]);
            setLoading(false);
        };
        load();
    }, []);

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
            exercise_name: exercise.exercise_name || exercise.exercise?.name || exercise.name || `Exercise ${index + 1}`,
            target_sets: exercise.sets || 0,
            target_reps: exercise.reps || 0,
            sets_completed: exercise.sets || 0,
            reps_completed: exercise.reps || 0,
            weight_kg: '',
        }));
        setSessionModalPlan(plan);
        setSelectedSessionGroup(defaultGroup);
        setSessionEntries(baseEntries.length > 0 ? baseEntries : [{
            exercise_name: 'Exercise 1',
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
            (exercise) => (exercise.section_name?.trim() || 'General') === groupName
        );
        const nextEntries = groupExercises.map((exercise, index) => ({
            exercise_id: exercise.exercise_id,
            exercise_name: exercise.exercise_name || exercise.exercise?.name || exercise.name || `Exercise ${index + 1}`,
            target_sets: exercise.sets || 0,
            target_reps: exercise.reps || 0,
            sets_completed: exercise.sets || 0,
            reps_completed: exercise.reps || 0,
            weight_kg: '',
        }));
        setSelectedSessionGroup(groupName);
        setSessionEntries(nextEntries.length > 0 ? nextEntries : [{
            exercise_name: 'Exercise 1',
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

            showToast('Workout session logged successfully.', 'success');
        } catch (error) {
            showToast(getApiErrorMessage(error, 'Failed to log workout session.'), 'error');
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
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">My Workout Plans</h1>
                <p className="text-sm text-muted-foreground">Assigned workout plans and session logging.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="kpi-card p-5">
                    <p className="section-chip">Plans Assigned</p>
                    <p className="mt-2 text-3xl font-bold text-foreground font-mono">{plans.length}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="section-chip">Total Exercises</p>
                    <p className="mt-2 text-3xl font-bold text-foreground font-mono">{totalExercises}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="section-chip">Sessions (7d)</p>
                    <p className="mt-2 text-3xl font-bold text-foreground font-mono">{sessionsThisWeek}</p>
                </div>
            </div>

            <div className="kpi-card p-6">
                <p className="section-chip mb-4">Plan Library</p>
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
                                            <p className="text-muted-foreground text-xs">{plan.description || 'No description'}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 font-mono whitespace-nowrap">
                                        {plan.exercises?.length || 0} exercises
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    className="btn-primary !py-1 !px-3 text-xs"
                                    onClick={() => openSessionLogger(plan)}
                                >
                                    Log Session
                                </button>

                                {plan.exercises && plan.exercises.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {Array.from(
                                            (plan.exercises || []).reduce((acc, exercise) => {
                                                const group = exercise.section_name?.trim() || 'General';
                                                if (!acc.has(group)) acc.set(group, []);
                                                acc.get(group)?.push(exercise);
                                                return acc;
                                            }, new Map<string, typeof plan.exercises>())
                                        ).map(([groupName, exercises]) => (
                                            <div key={`${plan.id}-${groupName}`} className="border border-border bg-muted/20 p-2">
                                                <p className="text-[10px] uppercase tracking-wider text-primary font-mono mb-1">{groupName}</p>
                                                <div className="space-y-1">
                                                    {exercises.slice(0, 4).map((exercise, index) => (
                                                        <div key={`${plan.id}-${groupName}-${index}`} className="flex justify-between text-xs py-0.5">
                                                            <span className="text-muted-foreground">{exercise.exercise?.name || exercise.name || `Exercise ${index + 1}`}</span>
                                                            <span className="text-muted-foreground font-mono">{exercise.sets}x{exercise.reps}</span>
                                                        </div>
                                                    ))}
                                                    {exercises.length > 4 && (
                                                        <p className="text-xs text-primary font-mono pt-1">+{exercises.length - 4} more</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                        <Dumbbell size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">No workout plans assigned yet.</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">Your coach will assign plans to you.</p>
                    </div>
                )}
            </div>

            <Modal
                isOpen={!!sessionModalPlan}
                onClose={() => setSessionModalPlan(null)}
                title={sessionModalPlan ? `Log Session: ${sessionModalPlan.name}` : 'Log Session'}
            >
                {sessionModalPlan && (
                    <form onSubmit={handleLogSession} className="space-y-4">
                        {(() => {
                            const groups = Array.from(
                                new Set((sessionModalPlan.exercises || []).map((exercise) => exercise.section_name?.trim() || 'General'))
                            );
                            return (
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Workout Group Done Today</label>
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
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Duration (minutes)</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="input-dark"
                                    value={sessionDuration}
                                    onChange={(e) => setSessionDuration(e.target.value)}
                                    placeholder="e.g. 60"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Session Notes</label>
                                <input
                                    type="text"
                                    className="input-dark"
                                    value={sessionNotes}
                                    onChange={(e) => setSessionNotes(e.target.value)}
                                    placeholder="How did it go?"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                            {sessionEntries.map((entry, idx) => (
                                <div key={`${entry.exercise_name}-${idx}`} className="rounded-sm border border-border bg-muted/10 p-3 space-y-2">
                                    <p className="text-sm font-semibold text-foreground">{entry.exercise_name}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Sets</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.sets_completed}
                                                onChange={(e) => updateSessionEntry(idx, 'sets_completed', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Reps</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.reps_completed}
                                                onChange={(e) => updateSessionEntry(idx, 'reps_completed', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Weight (kg)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.5"
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.weight_kg}
                                                onChange={(e) => updateSessionEntry(idx, 'weight_kg', e.target.value)}
                                                placeholder="Optional"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end gap-3 pt-2 border-t border-border">
                            <button type="button" className="btn-ghost" onClick={() => setSessionModalPlan(null)} disabled={loggingSession}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={loggingSession}>
                                {loggingSession ? 'Saving...' : 'Save Session'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}
