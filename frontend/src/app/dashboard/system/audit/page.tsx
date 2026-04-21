'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, Clock, User, Box } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import TablePagination from '@/components/TablePagination';

interface AuditLog {
    id: string;
    gym_id: string;
    user_id: string;
    action: string;
    timestamp: string;
    details: string;
}

export default function GlobalAuditLogsPage() {
    const { user } = useAuth();
    const { formatDate, locale } = useLocale();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await api.get('/system/audit-logs', { params: { page, limit: 20 } });
            setLogs(resp.data);
            // Assuming the backend returns total pages or we can estimate
            // For now, let's assume we have more if we got a full page
            if (resp.data.length === 20) setTotalPages(page + 1);
        } catch (err) {
            console.error("Failed to fetch audit logs", err);
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        }
    }, [user, fetchData]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">
                    {locale === 'ar' ? 'سجلات النظام العالمية' : 'Global System Audit'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {locale === 'ar' ? 'تتبع الإجراءات عبر جميع الصالات' : 'Unified security trail across all platform tenants'}
                </p>
            </div>

            <div className="kpi-card p-0 overflow-hidden">
                <div className="divide-y divide-border">
                    {loading && logs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                        </div>
                    ) : logs.length > 0 ? (
                        logs.map((log) => (
                            <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="p-2 bg-muted/50 border border-border">
                                        <ShieldAlert size={16} className="text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-foreground uppercase tracking-tight">
                                            {log.action.replace(/_/g, ' ')}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {log.details}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-muted-foreground sm:text-end">
                                    <div className="flex items-center gap-1.5">
                                        <Box size={12} />
                                        <span>Gym: {log.gym_id.split('-')[0]}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <User size={12} />
                                        <span>User: {log.user_id?.split('-')[0] || 'SYSTEM'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} />
                                        <span>{formatDate(new Date(log.timestamp))}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 text-center text-muted-foreground font-mono">
                            No logs found.
                        </div>
                    )}
                </div>
            </div>

            <TablePagination
                page={page}
                totalPages={totalPages}
                onPrevious={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => p + 1)}
            />
        </div>
    );
}
