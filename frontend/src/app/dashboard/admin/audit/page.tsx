'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ShieldAlert, RefreshCw, User, Activity, Clock, Target } from 'lucide-react';
import TablePagination from '@/components/TablePagination';
import { useLocale } from '@/context/LocaleContext';

interface AuditLog {
    id: string;
    user_id: string | null;
    action: string;
    target_id: string | null;
    timestamp: string;
    details: string | null;
}
const AUDIT_PAGE_SIZE = 10;

export default function AuditLogsPage() {
    const { t, formatDate } = useLocale();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/audit/logs?limit=100');
            setLogs(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [logs.length]);

    const formatTime = (isoString: string) => {
        try {
            return formatDate(new Date(isoString), {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return isoString;
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes('CREATE')) return 'text-green-500 bg-green-500/10 border-green-500/20';
        if (action.includes('DELETE') || action.includes('DEACTIVATE')) return 'text-red-500 bg-red-500/10 border-red-500/20';
        if (action.includes('UPDATE')) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        if (action.includes('SALE') || action.includes('TRANSACTION')) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    };
    const totalPages = Math.max(1, Math.ceil(logs.length / AUDIT_PAGE_SIZE));
    const visibleLogs = logs.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight flex items-center gap-2">
                        <ShieldAlert className="text-primary" />
                        {t('audit.title')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('audit.subtitle')}</p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="btn-primary group"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                    {t('audit.refresh')}
                </button>
            </div>

            <div className="kpi-card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse table-dark">
                        <thead>
                            <tr>
                                <th><div className="flex items-center gap-2"><Clock size={14} /> {t('audit.timestamp')}</div></th>
                                <th><div className="flex items-center gap-2"><Activity size={14} /> {t('audit.action')}</div></th>
                                <th><div className="flex items-center gap-2"><User size={14} /> {t('audit.userId')}</div></th>
                                <th><div className="flex items-center gap-2"><Target size={14} /> {t('audit.targetId')}</div></th>
                                <th>{t('audit.details')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12">
                                        <RefreshCw size={24} className="animate-spin text-primary mx-auto" />
                                        <p className="text-muted-foreground mt-2 text-sm">{t('audit.loading')}</p>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm font-mono">
                                        {t('audit.empty')}
                                    </td>
                                </tr>
                            ) : (
                                visibleLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                            {formatTime(log.timestamp)}
                                        </td>
                                        <td className="whitespace-nowrap">
                                            <span className={`px-2 py-1 border rounded-sm text-[10px] font-bold uppercase tracking-wider font-mono ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="font-mono text-xs text-muted-foreground" title={log.user_id || t('audit.system')}>
                                            {log.user_id ? log.user_id.split('-')[0] + '...' : t('audit.system')}
                                        </td>
                                        <td className="font-mono text-xs text-muted-foreground" title={log.target_id || '-'}>
                                            {log.target_id ? log.target_id.split('-')[0] + '...' : '-'}
                                        </td>
                                        <td className="text-sm max-w-md truncate" title={log.details || ''}>
                                            {log.details || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <TablePagination
                    page={page}
                    totalPages={totalPages}
                    onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                />
            </div>
        </div>
    );
}

