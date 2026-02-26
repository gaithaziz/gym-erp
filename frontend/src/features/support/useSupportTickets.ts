'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { SupportTicket, SupportTicketWithCustomer, TicketCategory, TicketStatus } from './types';

interface UseSupportTicketsArgs {
    isActive?: boolean;
    category?: TicketCategory | '';
    statusFilter?: TicketStatus;
    page: number;
    pageSize: number;
}

type TicketRow = SupportTicket | SupportTicketWithCustomer;

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

            const response = await api.get('/support/tickets', { params });
            setTickets((response.data?.data || []) as T[]);
            setTotal(Number(response.headers['x-total-count'] || 0));
            setError(null);
        } catch (err) {
            const apiError = err as { response?: { data?: { detail?: string } } };
            setError(apiError.response?.data?.detail || 'Failed to load tickets');
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

