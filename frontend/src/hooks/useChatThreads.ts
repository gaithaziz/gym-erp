'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import { getBranchParams } from '@/lib/branch';

export interface ChatThreadSummary {
    id: string;
    customer?: { id: string; full_name?: string | null; email: string; role: string };
    coach?: { id: string; full_name?: string | null; email: string; role: string };
    last_message?: { id: string; message_type: string; text_content?: string | null; created_at: string } | null;
    unread_count?: number | null;
}

interface UseChatThreadsOptions {
    enabled: boolean;
    limit?: number;
    branchId?: string;
}

export function useChatThreads({ enabled, limit = 50, branchId = 'all' }: UseChatThreadsOptions) {
    const key = enabled ? ['chat-threads', limit, branchId] : null;
    const swr = useSWR(
        key,
        async () => {
            const response = await api.get('/chat/threads', {
                params: { limit, sort_by: 'last_message_at', sort_order: 'desc', ...getBranchParams(branchId) },
            });
            return (response.data?.data || []) as ChatThreadSummary[];
        },
        {
            refreshInterval: enabled ? 12000 : 0,
            revalidateOnFocus: true,
            dedupingInterval: 5000,
        },
    );

    return {
        threads: swr.data || [],
        isLoading: swr.isLoading,
        error: swr.error,
        mutate: swr.mutate,
    };
}
