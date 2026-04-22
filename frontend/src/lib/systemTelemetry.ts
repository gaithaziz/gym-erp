import { AxiosError } from 'axios';
import { api } from '@/lib/api';

function normalizeErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';
    const axiosError = error as AxiosError<{ detail?: unknown }>;
    const detail = axiosError.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { message?: unknown; msg?: unknown };
        if (typeof first?.message === 'string') return first.message;
        if (typeof first?.msg === 'string') return first.msg;
    }
    if (detail && typeof detail === 'object' && 'message' in (detail as Record<string, unknown>)) {
        const msg = (detail as { message?: unknown }).message;
        if (typeof msg === 'string') return msg;
    }
    if (axiosError.message) return axiosError.message;
    return 'Unknown error';
}

export async function reportSystemTabError(
    tab: 'system_users' | 'system_audit' | 'system_gyms' | 'system_stats' | 'system_dashboard',
    operation: string,
    error: unknown,
    context?: Record<string, unknown>
): Promise<void> {
    const message = normalizeErrorMessage(error);
    // client-side breadcrumb
    console.error(`[${tab}] ${operation} failed: ${message}`, { error, context });

    try {
        await api.post('/system/client-telemetry', {
            tab,
            operation,
            error: message,
            context,
        });
    } catch {
        // best-effort telemetry; never block UI
    }
}

export function normalizeApiError(error: unknown): string {
    return normalizeErrorMessage(error);
}
