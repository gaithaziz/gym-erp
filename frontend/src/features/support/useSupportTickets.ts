'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { SupportTicket, SupportTicketWithCustomer, TicketCategory, TicketStatus } from './types';

interface UseSupportTicketsArgs {
    isActive?: boolean;
    category?: TicketCategory | '';
    statusFilter?: TicketStatus;
    branchId?: string | null;
    page: number;
    pageSize: number;
}

type TicketRow = SupportTicket | SupportTicketWithCustomer;

function toErrorMessage(detail: unknown): string {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const first = detail[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object' && 'msg' in first) {
            const msg = (first as { msg?: unknown }).msg;
            if (typeof msg === 'string') return msg;
        }
    }
    if (detail && typeof detail === 'object' && 'msg' in detail) {
        const msg = (detail as { msg?: unknown }).msg;
        if (typeof msg === 'string') return msg;
    }
    return 'Failed to load tickets';
}

export function useSupportTickets<T extends TicketRow>() {
    const [tickets, setTickets] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTickets = useCallback(async (args: UseSupportTicketsArgs) => {
        try {
            setLoading(true);
            const params: Record<string, string | number | boolean> = {
                limit: args.pageSize,
                offset: (args.page - 1) * args.pageSize,
            };
            if (typeof args.isActive === 'boolean') params.is_active = args.isActive;
            if (args.category) params.category = args.category;
            if (args.statusFilter) params.status_filter = args.statusFilter;
            if (args.branchId && args.branchId !== 'all') params.branch_id = args.branchId;

            const response = await api.get('/support/tickets', { params });
            setTickets((response.data?.data || []) as T[]);
            setTotal(Number(response.headers['x-total-count'] || 0));
            setError(null);
        } catch (err) {
            const apiError = err as { response?: { data?: { detail?: unknown } } };
            setError(toErrorMessage(apiError.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        tickets,
        total,
        loading,
        error,
        fetchTickets,
    };
}
