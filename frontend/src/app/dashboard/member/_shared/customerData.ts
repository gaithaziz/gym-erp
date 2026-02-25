import { api } from '@/lib/api';
import type {
    BiometricLogResponse,
    GamificationStats,
    MemberDiet,
    MemberPlan,
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
