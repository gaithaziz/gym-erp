'use client';

import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/components/FeedbackProvider';
import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { ShieldAlert, Clock, User, Building2, Filter, RefreshCcw } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import { useBranch } from '@/context/BranchContext';
import Modal from '@/components/Modal';
import TablePagination from '@/components/TablePagination';
import { SecurityAuditPanel } from '@/components/SecurityAuditPanel';
import { SystemAdminAccessDenied, SystemAdminShell } from '@/components/system-admin/SystemAdminShell';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface AuditLogRow {
    id: string;
    gym_id: string;
    gym_name: string;
    branch_id: string | null;
    branch_name: string;
    user_id: string | null;
    user_name: string;
    action: string;
    severity: 'low' | 'medium' | 'high';
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

interface SecurityAuditSummary {
    overall_status: 'pass' | 'warn' | 'fail' | 'not_applicable';
    passed: number;
    warnings: number;
    failed: number;
    not_applicable: number;
}

interface SecurityCheck {
    id: string;
    category: string;
    title: string;
    status: 'pass' | 'warn' | 'fail' | 'not_applicable';
    summary: string;
    details: string[];
    evidence: string[];
    recommended_action: string | null;
}

interface SecurityAudit {
    summary: SecurityAuditSummary;
    checks: SecurityCheck[];
    generated_at: string;
}

const PAGE_SIZE = 20;

export default function GlobalAuditLogsPage() {
    const { user } = useAuth();
    const { branches: scopedBranches, selectedBranchId, setSelectedBranchId } = useBranch();
    const { showToast } = useFeedback();
    const { formatDate, locale } = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const initialAction = useMemo(() => searchParams.get('action') || '', [searchParams]);
    const initialGym = useMemo(() => searchParams.get('gym') || '', [searchParams]);
    const initialBranch = useMemo(() => searchParams.get('branch') || '', [searchParams]);
    const initialSeverity = useMemo(() => searchParams.get('severity') || '', [searchParams]);
    const initialFrom = useMemo(() => searchParams.get('from') || '', [searchParams]);
    const initialTo = useMemo(() => searchParams.get('to') || '', [searchParams]);
    const initialPage = useMemo(() => {
        const raw = Number(searchParams.get('page') || '1');
        return Number.isFinite(raw) && raw > 0 ? raw : 1;
    }, [searchParams]);

    const [logs, setLogs] = useState<AuditLogRow[]>([]);
    const [gyms, setGyms] = useState<GymsLookup[]>([]);
    const [securityAudit, setSecurityAudit] = useState<SecurityAudit | null>(null);
    const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const [page, setPage] = useState(initialPage);
    const [total, setTotal] = useState(0);

    const [actionFilter, setActionFilter] = useState(initialAction);
    const [gymFilter, setGymFilter] = useState(initialGym);
    const [severityFilter, setSeverityFilter] = useState(initialSeverity);
    const [fromDate, setFromDate] = useState(initialFrom);
    const [toDate, setToDate] = useState(initialTo);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const branchFilter = selectedBranchId === 'all' ? '' : selectedBranchId;
    const branches = useMemo(
        () => (gymFilter ? scopedBranches.filter((branch) => branch.gym_id === gymFilter) : scopedBranches),
        [gymFilter, scopedBranches]
    );

    useEffect(() => {
        if (user?.role !== 'SUPER_ADMIN') return;
        api.get('/system/gyms')
            .then((resp) => {
                const items = Array.isArray(resp.data) ? resp.data : [];
                setGyms(items.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
            })
            .catch(() => setGyms([]));
    }, [user]);

    useEffect(() => {
        if (user?.role !== 'SUPER_ADMIN') return;
        if (!initialBranch) return;
        if (!scopedBranches.some((branch) => branch.id === initialBranch)) return;
        if (selectedBranchId !== initialBranch) {
            setSelectedBranchId(initialBranch);
        }
    }, [initialBranch, scopedBranches, selectedBranchId, setSelectedBranchId, user]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (actionFilter.trim()) params.set('action', actionFilter.trim());
        if (gymFilter) params.set('gym', gymFilter);
        if (branchFilter) params.set('branch', branchFilter);
        if (severityFilter) params.set('severity', severityFilter);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        if (page > 1) params.set('page', String(page));
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [actionFilter, branchFilter, fromDate, gymFilter, page, pathname, router, severityFilter, toDate]);

    useEffect(() => {
        if (selectedBranchId === 'all') return;
        if (!branches.some((branch) => branch.id === selectedBranchId)) {
            setSelectedBranchId('all');
        }
    }, [branches, selectedBranchId, setSelectedBranchId]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setRefreshing(true);
        setError(null);
        try {
            const params: Record<string, string | number> = {
                page,
                limit: PAGE_SIZE,
            };
            if (actionFilter.trim()) params.action = actionFilter.trim();
            if (gymFilter) params.gym_id = gymFilter;
            if (branchFilter) params.branch_id = branchFilter;
            if (severityFilter) params.severity = severityFilter;
            if (fromDate) params.from = fromDate;
            if (toDate) params.to = toDate;

            const [logsResult, securityResult] = await Promise.allSettled([
                api.get('/system/audit-logs', { params }),
                api.get('/audit/security'),
            ]);

            if (logsResult.status === 'fulfilled') {
                const resp = logsResult.value;
                const payload = resp.data?.data as AuditPayload | undefined;

                if (payload && Array.isArray(payload.items)) {
                    setLogs(payload.items);
                    setTotal(Number(payload.total || 0));
                    setLastUpdated(new Date());
                } else {
                    const legacy = Array.isArray(resp.data) ? (resp.data as AuditLogRow[]) : [];
                    setLogs(legacy);
                    setTotal(legacy.length);
                    setLastUpdated(new Date());
                }
            } else {
                throw logsResult.reason;
            }

            if (securityResult.status === 'fulfilled') {
                setSecurityAudit(securityResult.value.data?.data || null);
            } else {
                setSecurityAudit(null);
            }
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            showToast(message, 'error');
            setLogs([]);
            setTotal(0);
            await reportSystemTabError('system_audit', 'fetch_audit_logs', err, {
                page,
                limit: PAGE_SIZE,
                action: actionFilter,
                gym_id: gymFilter,
                branch_id: branchFilter,
                severity: severityFilter,
                from: fromDate,
                to: toDate,
            });
            setSecurityAudit(null);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [actionFilter, branchFilter, fromDate, gymFilter, page, severityFilter, showToast, toDate]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        } else if (user) {
            setLoading(false);
        }
    }, [user, fetchData]);

    const hasFilters = useMemo(() => Boolean(actionFilter || gymFilter || branchFilter || severityFilter || fromDate || toDate), [actionFilter, branchFilter, fromDate, gymFilter, severityFilter, toDate]);

    const closeDetails = () => setSelectedLog(null);

    const exportAuditLogs = async () => {
        try {
            const exportLimit = 100;
            let exportPage = 1;
            let exportTotal = Number.POSITIVE_INFINITY;
            const allRows: AuditLogRow[] = [];

            while (allRows.length < exportTotal) {
                const params: Record<string, string | number> = {
                    page: exportPage,
                    limit: exportLimit,
                };
                if (actionFilter.trim()) params.action = actionFilter.trim();
                if (gymFilter) params.gym_id = gymFilter;
                if (branchFilter) params.branch_id = branchFilter;
                if (severityFilter) params.severity = severityFilter;
                if (fromDate) params.from = fromDate;
                if (toDate) params.to = toDate;

                const resp = await api.get('/system/audit-logs', { params });
                const payload = resp.data?.data as AuditPayload | undefined;
                const items = payload && Array.isArray(payload.items)
                    ? payload.items
                    : (Array.isArray(resp.data) ? (resp.data as AuditLogRow[]) : []);

                if (items.length === 0) break;
                allRows.push(...items);
                exportTotal = payload ? Number(payload.total || items.length) : allRows.length;

                if (items.length < exportLimit) break;
                exportPage += 1;
            }

            if (allRows.length === 0) {
                showToast(locale === 'ar' ? 'لا توجد سجلات لتصديرها.' : 'No audit logs to export.', 'error');
                return;
            }

            const rows = [
                ['timestamp', 'action', 'gym_name', 'branch_name', 'user_name', 'details'],
                ...allRows.map((log) => [
                    new Date(log.timestamp).toISOString(),
                    log.action,
                    log.gym_name,
                    log.branch_name || '',
                    log.user_name || '',
                    log.details || '',
                ]),
            ];

            const csv = rows
                .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(locale === 'ar' ? 'تم تصدير السجلات.' : 'Audit logs exported.', 'success');
        } catch (err) {
            const message = normalizeApiError(err);
            showToast(message, 'error');
            await reportSystemTabError('system_audit', 'export_audit_logs', err, {
                action: actionFilter,
                gym_id: gymFilter,
                branch_id: branchFilter,
                severity: severityFilter,
                from: fromDate,
                to: toDate,
            });
        }
    };

    if (user && user.role !== 'SUPER_ADMIN') {
        return <SystemAdminAccessDenied />;
    }

    return (
        <SystemAdminShell
            activeTab="audit"
            title={locale === 'ar' ? 'سجلات النظام العالمية' : 'Global System Audit'}
            description={locale === 'ar' ? 'تتبع الإجراءات عبر جميع الصالات' : 'Unified security trail across all platform tenants'}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={fetchData}
            actionSlot={
                <button className="btn-ghost flex items-center gap-2 border border-border" onClick={exportAuditLogs} disabled={logs.length === 0}>
                    <Filter size={16} />
                    {locale === 'ar' ? 'تصدير CSV' : 'Export CSV'}
                </button>
            }
        >

            <div className="kpi-card p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
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
                        aria-label={locale === 'ar' ? 'الإجراء' : 'Action'}
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
                            setSelectedBranchId('all');
                        }}
                        aria-label={locale === 'ar' ? 'المنشأة' : 'Gym'}
                    >
                        <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>
                        {gyms.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'الفرع' : 'Branch'}</label>
                    <select
                        className="input-dark w-full"
                        value={branchFilter}
                        onChange={(e) => {
                            setPage(1);
                            setSelectedBranchId(e.target.value || 'all');
                        }}
                    >
                        <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>
                        {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>{branch.display_name || branch.name} {branch.gym_name ? `(${branch.gym_name})` : ''}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'الشدة' : 'Severity'}</label>
                    <select
                        className="input-dark w-full"
                        value={severityFilter}
                        onChange={(e) => {
                            setPage(1);
                            setSeverityFilter(e.target.value);
                        }}
                    >
                        <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>
                        <option value="high">{locale === 'ar' ? 'عالي' : 'High'}</option>
                        <option value="medium">{locale === 'ar' ? 'متوسط' : 'Medium'}</option>
                        <option value="low">{locale === 'ar' ? 'منخفض' : 'Low'}</option>
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

            <SecurityAuditPanel securityAudit={securityAudit} />

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
                                    <div className="flex items-center gap-1.5">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${log.severity === 'high' ? 'bg-destructive/10 text-destructive' : log.severity === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted/50 text-muted-foreground'}`}>
                                            {log.severity}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5"><Clock size={12} /><span>{formatDate(new Date(log.timestamp))}</span></div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedLog(log)}
                                        className="btn-ghost !py-1 !px-2 text-[10px] uppercase font-bold tracking-tighter"
                                    >
                                        {locale === 'ar' ? 'تفاصيل' : 'Details'}
                                    </button>
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

            <Modal
                isOpen={Boolean(selectedLog)}
                onClose={closeDetails}
                title={locale === 'ar' ? 'تفاصيل سجل التدقيق' : 'Audit Log Details'}
                maxWidthClassName="max-w-3xl"
            >
                {selectedLog ? (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'الإجراء' : 'Action'}</div>
                                <div className="mt-1 font-bold text-foreground uppercase">{selectedLog.action.replace(/_/g, ' ')}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'الشدة' : 'Severity'}</div>
                                <div className="mt-1 font-bold text-foreground uppercase">{selectedLog.severity}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'النادي' : 'Gym'}</div>
                                <div className="mt-1 font-mono text-foreground">{selectedLog.gym_name}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'الفرع' : 'Branch'}</div>
                                <div className="mt-1 font-mono text-foreground">{selectedLog.branch_name || 'Global/System'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'المستخدم' : 'Actor'}</div>
                                <div className="mt-1 font-mono text-foreground">{selectedLog.user_name || 'SYSTEM'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'الوقت' : 'Timestamp'}</div>
                                <div className="mt-1 font-mono text-foreground">{formatDate(new Date(selectedLog.timestamp))}</div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background/60 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'التفاصيل' : 'Details'}</div>
                            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-foreground">{selectedLog.details || (locale === 'ar' ? 'لا توجد تفاصيل' : 'No details')}</pre>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </SystemAdminShell>
    );
}
