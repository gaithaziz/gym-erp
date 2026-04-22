'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { ShieldAlert, Clock, User, Building2, Filter, RefreshCcw } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import TablePagination from '@/components/TablePagination';

interface AuditLogRow {
    id: string;
    gym_id: string;
    gym_name: string;
    branch_id: string | null;
    branch_name: string;
    user_id: string | null;
    user_name: string;
    action: string;
    timestamp: string;
    details: string;
}

interface GymsLookup {
    id: string;
    name: string;
}

interface AuditPayload {
    items: AuditLogRow[];
    total: number;
    page: number;
    limit: number;
}

const PAGE_SIZE = 20;

export default function GlobalAuditLogsPage() {
    const { user } = useAuth();
    const { formatDate, locale } = useLocale();

    const [logs, setLogs] = useState<AuditLogRow[]>([]);
    const [gyms, setGyms] = useState<GymsLookup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const [actionFilter, setActionFilter] = useState('');
    const [gymFilter, setGymFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    useEffect(() => {
        if (user?.role !== 'SUPER_ADMIN') return;
        api.get('/system/gyms')
            .then((resp) => {
                const items = Array.isArray(resp.data) ? resp.data : [];
                setGyms(items.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
            })
            .catch(() => setGyms([]));
    }, [user]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = {
                page,
                limit: PAGE_SIZE,
            };
            if (actionFilter.trim()) params.action = actionFilter.trim();
            if (gymFilter) params.gym_id = gymFilter;
            if (fromDate) params.from = fromDate;
            if (toDate) params.to = toDate;

            const resp = await api.get('/system/audit-logs', { params });
            const payload = resp.data?.data as AuditPayload | undefined;

            if (payload && Array.isArray(payload.items)) {
                setLogs(payload.items);
                setTotal(Number(payload.total || 0));
            } else {
                const legacy = Array.isArray(resp.data) ? (resp.data as AuditLogRow[]) : [];
                setLogs(legacy);
                setTotal(legacy.length);
            }
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            setLogs([]);
            setTotal(0);
            await reportSystemTabError('system_audit', 'fetch_audit_logs', err, {
                page,
                limit: PAGE_SIZE,
                action: actionFilter,
                gym_id: gymFilter,
                from: fromDate,
                to: toDate,
            });
        } finally {
            setLoading(false);
        }
    }, [actionFilter, fromDate, gymFilter, page, toDate]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        }
    }, [user, fetchData]);

    const hasFilters = useMemo(() => Boolean(actionFilter || gymFilter || fromDate || toDate), [actionFilter, gymFilter, fromDate, toDate]);

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

            <div className="kpi-card p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'الإجراء' : 'Action'}</label>
                    <input
                        className="input-dark w-full"
                        value={actionFilter}
                        onChange={(e) => {
                            setPage(1);
                            setActionFilter(e.target.value);
                        }}
                        placeholder={locale === 'ar' ? 'مثال: USER_IMPERSONATED' : 'e.g. USER_IMPERSONATED'}
                    />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'المنشأة' : 'Gym'}</label>
                    <select
                        className="input-dark w-full"
                        value={gymFilter}
                        onChange={(e) => {
                            setPage(1);
                            setGymFilter(e.target.value);
                        }}
                    >
                        <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>
                        {gyms.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'من' : 'From'}</label>
                    <input type="date" className="input-dark w-full" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'إلى' : 'To'}</label>
                    <div className="flex gap-2">
                        <input type="date" className="input-dark w-full" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} />
                        <button className="btn-ghost !px-3" onClick={() => fetchData()} disabled={loading}>
                            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => fetchData()}>
                        {locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                </div>
            )}

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
                                        <p className="text-sm font-bold text-foreground uppercase tracking-tight">{log.action.replace(/_/g, ' ')}</p>
                                        <p className="text-xs text-muted-foreground truncate">{log.details || (locale === 'ar' ? 'لا توجد تفاصيل' : 'No details')}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-muted-foreground sm:text-end">
                                    <div className="flex items-center gap-1.5"><Building2 size={12} /><span>{log.gym_name}</span></div>
                                    <div className="flex items-center gap-1.5"><Filter size={12} /><span>{log.branch_name || 'Global/System'}</span></div>
                                    <div className="flex items-center gap-1.5"><User size={12} /><span>{log.user_name || 'SYSTEM'}</span></div>
                                    <div className="flex items-center gap-1.5"><Clock size={12} /><span>{formatDate(new Date(log.timestamp))}</span></div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 text-center text-muted-foreground font-mono space-y-2">
                            <p>{locale === 'ar' ? 'لا توجد سجلات تدقيق بعد.' : 'No audit logs yet.'}</p>
                            <p className="text-xs">
                                {locale === 'ar'
                                    ? 'جرّب تشغيل مزامنة الاشتراكات أو تبديل وضع الصيانة أو إضافة صالة جديدة لتوليد أول سجل.'
                                    : 'Try syncing subscriptions, toggling maintenance, or onboarding a gym to generate first events.'}
                            </p>
                            {hasFilters ? (
                                <p className="text-xs text-amber-500">{locale === 'ar' ? 'تحقق من الفلاتر الحالية.' : 'Your filters may be too restrictive.'}</p>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            <TablePagination
                page={page}
                totalPages={totalPages}
                onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
        </div>
    );
}
