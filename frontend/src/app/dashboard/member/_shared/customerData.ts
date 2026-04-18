import { api } from '@/lib/api';
import type {
    BiometricLogResponse,
    GamificationStats,
    MemberDietTracker,
    MemberDiet,
    MemberPlan,
    WorkoutEffortFeedback,
    WorkoutSetDetail,
    WorkoutSessionDraft,
    WorkoutSessionLog,
} from './types';

const safeData = <T>(value: unknown, fallback: T): T => (value as T) ?? fallback;

export async function fetchMemberOverviewData(): Promise<{
    stats: GamificationStats | null;
    biometrics: BiometricLogResponse[];
}> {
    const [statsRes, biometricsRes] = await Promise.all([
        api.get('/gamification/stats').catch(() => ({ data: { data: null } })),
        api.get('/fitness/biometrics').catch(() => ({ data: { data: [] } })),
    ]);

    return {
        stats: safeData<GamificationStats | null>(statsRes.data?.data, null),
        biometrics: safeData<BiometricLogResponse[]>(biometricsRes.data?.data, []),
    };
}

export async function fetchMemberPlans(): Promise<MemberPlan[]> {
    try {
        const response = await api.get('/fitness/plans');
        const plans = safeData<MemberPlan[]>(response.data?.data, []);
        if (plans.length > 0) return plans;

        const fallbackResponse = await api.get('/fitness/plans', { params: { include_archived: true } });
        return safeData<MemberPlan[]>(fallbackResponse.data?.data, []);
    } catch (error) {
        const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        throw new Error(typeof detail === 'string' && detail.trim() ? detail : 'Failed to load workout plans');
    }
}

export async function fetchMemberDiets(): Promise<MemberDiet[]> {
    const response = await api.get('/fitness/diets').catch(() => ({ data: { data: [] } }));
    return safeData<MemberDiet[]>(response.data?.data, []);
}

export async function fetchMemberProgressData(): Promise<{
    workoutStats: { date: string; workouts: number }[];
    biometrics: BiometricLogResponse[];
    sessionLogs: WorkoutSessionLog[];
}> {
    const [workoutStatsRes, biometricsRes, sessionRes] = await Promise.all([
        api.get('/fitness/stats').catch(() => ({ data: { data: [] } })),
        api.get('/fitness/biometrics').catch(() => ({ data: { data: [] } })),
        api.get('/fitness/session-logs/me').catch(() => ({ data: { data: [] } })),
    ]);

    return {
        workoutStats: safeData<{ date: string; workouts: number }[]>(workoutStatsRes.data?.data, []),
        biometrics: safeData<BiometricLogResponse[]>(biometricsRes.data?.data, []),
        sessionLogs: safeData<WorkoutSessionLog[]>(sessionRes.data?.data, []),
    };
}

export async function fetchMemberSessionLogs(): Promise<WorkoutSessionLog[]> {
    const response = await api.get('/fitness/session-logs/me').catch(() => ({ data: { data: [] } }));
    return safeData<WorkoutSessionLog[]>(response.data?.data, []);
}

export async function startWorkoutSession(planId: string, sectionName?: string | null): Promise<WorkoutSessionDraft> {
    const response = await api.post('/fitness/workout-sessions/start', { plan_id: planId, section_name: sectionName || null });
    return safeData<WorkoutSessionDraft>(response.data?.data, {} as WorkoutSessionDraft);
}

export async function fetchActiveWorkoutSession(planId: string): Promise<WorkoutSessionDraft | null> {
    const response = await api.get('/fitness/workout-sessions/active', { params: { plan_id: planId } });
    return safeData<WorkoutSessionDraft | null>(response.data?.data, null);
}

export async function completeWorkoutExercise(
    draftId: string,
    entryId: string,
    payload: {
        sets_completed: number;
        reps_completed: number;
        weight_kg?: number | null;
        notes?: string | null;
        is_pr?: boolean;
        pr_type?: string | null;
        pr_value?: string | null;
        pr_notes?: string | null;
        set_details?: WorkoutSetDetail[];
    },
): Promise<WorkoutSessionDraft> {
    const response = await api.put(`/fitness/workout-sessions/${draftId}/entries/${entryId}`, payload);
    return safeData<WorkoutSessionDraft>(response.data?.data, {} as WorkoutSessionDraft);
}

export async function skipWorkoutExercise(draftId: string, entryId: string, notes?: string | null): Promise<WorkoutSessionDraft> {
    const response = await api.post(`/fitness/workout-sessions/${draftId}/entries/${entryId}/skip`, { notes: notes || null });
    return safeData<WorkoutSessionDraft>(response.data?.data, {} as WorkoutSessionDraft);
}

export async function previousWorkoutExercise(draftId: string): Promise<WorkoutSessionDraft> {
    const response = await api.post(`/fitness/workout-sessions/${draftId}/previous`);
    return safeData<WorkoutSessionDraft>(response.data?.data, {} as WorkoutSessionDraft);
}

export async function finishWorkoutSession(
    draftId: string,
    payload: {
        duration_minutes?: number | null;
        notes?: string | null;
        rpe?: number | null;
        pain_level?: number | null;
        effort_feedback?: WorkoutEffortFeedback | null;
        attachment_url?: string | null;
        attachment_mime?: string | null;
        attachment_size_bytes?: number | null;
    },
): Promise<WorkoutSessionLog> {
    const response = await api.post(`/fitness/workout-sessions/${draftId}/finish`, payload);
    return safeData<WorkoutSessionLog>(response.data?.data, {} as WorkoutSessionLog);
}

export async function updateWorkoutSession(
    sessionId: string,
    payload: {
        duration_minutes?: number | null;
        notes?: string | null;
        rpe?: number | null;
        pain_level?: number | null;
        effort_feedback?: WorkoutEffortFeedback | null;
        attachment_url?: string | null;
        attachment_mime?: string | null;
        attachment_size_bytes?: number | null;
    },
): Promise<WorkoutSessionLog> {
    const response = await api.put(`/fitness/session-logs/${sessionId}`, payload);
    return safeData<WorkoutSessionLog>(response.data?.data, {} as WorkoutSessionLog);
}

export async function abandonWorkoutSession(draftId: string): Promise<void> {
    await api.delete(`/fitness/workout-sessions/${draftId}`);
}

export async function fetchMemberDietTracker(dietId: string, trackedFor?: string): Promise<MemberDietTracker> {
    const response = await api.get(`/fitness/diets/${dietId}/tracking`, { params: trackedFor ? { tracked_for: trackedFor } : undefined });
    return safeData<MemberDietTracker>(response.data?.data, {} as MemberDietTracker);
}

export async function updateMemberDietTracker(
    dietId: string,
    payload: {
        tracked_for: string;
        adherence_rating?: number | null;
        notes?: string | null;
        meals: Array<{ meal_id: string; completed: boolean; note?: string | null }>;
    },
): Promise<MemberDietTracker> {
    const response = await api.put(`/fitness/diets/${dietId}/tracking`, payload);
    return safeData<MemberDietTracker>(response.data?.data, {} as MemberDietTracker);
}
