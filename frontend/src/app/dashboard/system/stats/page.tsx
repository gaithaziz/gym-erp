'use client';

import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/components/FeedbackProvider';
import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Activity, LayoutDashboard, Users, Clock, ShieldAlert, TrendingUp } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import { DashboardGrid } from '@/components/DashboardGrid';
import SafeResponsiveChart from '@/components/SafeResponsiveChart';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { SystemAdminAccessDenied, SystemAdminShell } from '@/components/system-admin/SystemAdminShell';
import { useRouter } from 'next/navigation';

interface SystemStats {
    total_gyms: number;
    total_branches: number;
    total_users: number;
    active_users?: number;
    active_subscriptions: number;
    global_maintenance: boolean;
}

interface RevenueData {
    date: string;
    income: number;
    expense: number;
}

interface GymHealthRow {
    gym_id: string;
    gym_name: string;
    is_active: boolean;
    is_maintenance_mode: boolean;
    active_members: number;
    recent_activity_score: number;
    status: 'healthy' | 'low_activity' | 'maintenance' | 'inactive';
    attention_score: number;
}

interface GymOption {
    id: string;
    name: string;
}

function formatDateInput(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export default function SystemStatsPage() {
    const { user } = useAuth();
    const { showToast, confirm } = useFeedback();
    const { t, formatCurrency, formatDate, locale } = useLocale();
    const router = useRouter();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [healthData, setHealthData] = useState<GymHealthRow[]>([]);
    const [gyms, setGyms] = useState<GymOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatingMaint, setUpdatingMaint] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [fromDate, setFromDate] = useState(() => formatDateInput(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
    const [toDate, setToDate] = useState(() => formatDateInput(new Date()));
    const [gymFilter, setGymFilter] = useState('');
    const [healthFilter, setHealthFilter] = useState('');

    useEffect(() => {
        if (user?.role !== 'SUPER_ADMIN') return;
        api.get('/system/gyms')
            .then((resp) => {
                const items = Array.isArray(resp.data) ? resp.data : [];
                setGyms(items.map((gym: { id: string; name: string }) => ({ id: gym.id, name: gym.name })));
            })
            .catch(() => setGyms([]));
    }, [user]);

    const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = opts?.silent ?? false;
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            setError(null);
            const [statsResp, revResp, healthResp] = await Promise.all([
                api.get('/system/stats', { params: gymFilter ? { gym_id: gymFilter } : undefined }),
                api.get('/system/analytics/revenue', {
                    params: {
                        from: fromDate,
                        to: toDate,
                        gym_id: gymFilter || undefined,
                    },
                }),
                api.get('/system/gyms/health', {
                    params: {
                        gym_id: gymFilter || undefined,
                        status: healthFilter || undefined,
                    },
                })
            ]);
            setStats(statsResp.data);
            setRevenueData(revResp.data);
            setHealthData(healthResp.data);
            setLastUpdated(new Date());
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            showToast(message, 'error');
            await reportSystemTabError('system_stats', 'fetch_stats', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fromDate, gymFilter, healthFilter, showToast, toDate]);

    useEffect(() => {
        if (user && user.role !== 'SUPER_ADMIN') {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        }
    }, [fetchData, fromDate, gymFilter, healthFilter, toDate, user]);

    const toggleGlobalMaintenance = async () => {
        if (!stats) return;
        setUpdatingMaint(true);
        const newStatus = !stats.global_maintenance;
        try {
            const accepted = await confirm({
                title: locale === 'ar' ? 'تأكيد وضع الصيانة' : 'Confirm maintenance change',
                description: newStatus
                    ? (locale === 'ar'
                        ? 'هذا سيضع المنصة بالكامل في وضع الصيانة. تأكد من أن فريق العمليات مستعد قبل المتابعة.'
                        : 'This will place the entire platform into maintenance mode. Make sure operations is ready before continuing.')
                    : (locale === 'ar'
                        ? 'هذا سيُخرج المنصة من وضع الصيانة ويعيد فتح الوصول العام.'
                        : 'This will turn maintenance mode off and reopen platform access.'),
                confirmText: newStatus ? (locale === 'ar' ? 'تشغيل الصيانة' : 'Enable maintenance') : (locale === 'ar' ? 'إيقاف الصيانة' : 'Disable maintenance'),
                destructive: newStatus,
            });
            if (!accepted) return;
            await api.post('/system/config/maintenance', { is_maintenance_mode: newStatus });
            setStats({ ...stats, global_maintenance: newStatus });
            setLastUpdated(new Date());
            showToast(newStatus
                ? (locale === 'ar' ? 'تم تشغيل وضع الصيانة العالمي.' : 'Global maintenance mode enabled.')
                : (locale === 'ar' ? 'تم إيقاف وضع الصيانة العالمي.' : 'Global maintenance mode disabled.'),
            'success');
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            showToast(message, 'error');
            await reportSystemTabError('system_stats', 'toggle_maintenance', err, { targetStatus: newStatus });
        } finally {
            setUpdatingMaint(false);
        }
    };

    const chartData = useMemo(() => {
        return revenueData.map(d => ({
            ...d,
            label: formatDate(new Date(d.date), { month: 'short', day: 'numeric' })
        }));
    }, [revenueData, formatDate]);

    const financeSummary = useMemo(() => {
        const income = revenueData.reduce((sum, row) => sum + row.income, 0);
        const expense = revenueData.reduce((sum, row) => sum + row.expense, 0);
        return {
            income,
            expense,
            net: income - expense,
        };
    }, [revenueData]);

    const orderedHealthData = useMemo(() => {
        return [...healthData].sort((a, b) => {
            if (a.attention_score !== b.attention_score) return b.attention_score - a.attention_score;
            if (a.status !== b.status) return a.status === 'healthy' ? 1 : b.status === 'healthy' ? -1 : 0;
            return a.gym_name.localeCompare(b.gym_name);
        });
    }, [healthData]);

    const priorityInsights = useMemo(() => {
        const lowActivity = orderedHealthData.filter((row) => row.status !== 'healthy').length;
        const inactiveGyms = orderedHealthData.filter((row) => row.active_members === 0).length;
        const expiringSoon = orderedHealthData.filter((row) => row.recent_activity_score <= 3).length;
        return [
            { label: locale === 'ar' ? 'صالات تحتاج انتباهاً' : 'Gyms needing attention', value: lowActivity },
            { label: locale === 'ar' ? 'صالات بدون أعضاء نشطين' : 'Gyms with no active members', value: inactiveGyms },
            { label: locale === 'ar' ? 'نشاط منخفض خلال 7 أيام' : 'Low activity in last 7 days', value: expiringSoon },
        ];
    }, [locale, orderedHealthData]);

    const chartWindowLabel = useMemo(() => {
        return `${fromDate} → ${toDate}`;
    }, [fromDate, toDate]);

    const selectedGymName = gyms.find((gym) => gym.id === gymFilter)?.name || '';

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    if (user && user.role !== 'SUPER_ADMIN') {
        return <SystemAdminAccessDenied />;
    }

    const kpiCards = [
        { 
            title: locale === 'ar' ? 'إجمالي الصالات' : 'Total Gyms', 
            value: stats?.total_gyms ?? '--', 
            subtitle: locale === 'ar' ? 'الصالات المسجلة' : 'Registered gym tenants', 
            icon: LayoutDashboard, 
            color: 'orange' 
        },
        { 
            title: locale === 'ar' ? 'إجمالي الفروع' : 'Total Branches', 
            value: stats?.total_branches ?? '--', 
            subtitle: locale === 'ar' ? 'الفروع عبر كل الصالات' : 'Branches across all gyms', 
            icon: Activity, 
            color: 'blue' 
        },
        { 
            title: locale === 'ar' ? 'المستخدمون النشطون' : 'Active Users', 
            value: stats?.active_users ?? stats?.total_users ?? '--', 
            subtitle: locale === 'ar' ? 'الحسابات المفعلة عبر كل الصالات' : 'Enabled accounts across all gyms', 
            icon: Users, 
            color: 'green' 
        },
        { 
            title: locale === 'ar' ? 'الاشتراكات النشطة' : 'Active Subscriptions', 
            value: stats?.active_subscriptions ?? '--', 
            subtitle: locale === 'ar' ? 'الاشتراكات المدفوعة' : 'Currently paid subscriptions', 
            icon: Clock, 
            color: 'amber' 
        },
    ];

    return (
        <SystemAdminShell
            activeTab="stats"
            title={t('dashboard.sections.systemAdmin')}
            description={locale === 'ar' ? 'نظرة عامة على النظام العالمي' : 'Global platform overview and health'}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={() => fetchData({ silent: true })}
            actionSlot={
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={16} className={stats?.global_maintenance ? 'text-destructive' : 'text-muted-foreground'} />
                        <span className="text-xs font-bold uppercase tracking-tight">
                            {locale === 'ar' ? 'وضع الصيانة العالمي' : 'Global Maintenance'}
                        </span>
                    </div>
                    <button
                        onClick={toggleGlobalMaintenance}
                        disabled={updatingMaint}
                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                            stats?.global_maintenance 
                            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                    >
                        {updatingMaint ? '...' : (stats?.global_maintenance ? (locale === 'ar' ? 'إيقاف' : 'OFF') : (locale === 'ar' ? 'تشغيل' : 'ON'))}
                    </button>
                </div>
            }
        >

            <div className="kpi-card p-4 grid grid-cols-1 lg:grid-cols-4 gap-3">
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'من' : 'From'}</label>
                    <input type="date" className="input-dark w-full mt-1" aria-label={locale === 'ar' ? 'من' : 'From'} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'إلى' : 'To'}</label>
                    <input type="date" className="input-dark w-full mt-1" aria-label={locale === 'ar' ? 'إلى' : 'To'} value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'النادي' : 'Gym'}</label>
                    <select className="input-dark w-full mt-1" aria-label={locale === 'ar' ? 'النادي' : 'Gym'} value={gymFilter} onChange={(e) => setGymFilter(e.target.value)}>
                        <option value="">{locale === 'ar' ? 'الكل' : 'All gyms'}</option>
                        {gyms.map((gym) => (
                            <option key={gym.id} value={gym.id}>{gym.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground">{locale === 'ar' ? 'حالة الصحة' : 'Health status'}</label>
                    <select className="input-dark w-full mt-1" aria-label={locale === 'ar' ? 'حالة الصحة' : 'Health status'} value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}>
                        <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>
                        <option value="healthy">{locale === 'ar' ? 'سليم' : 'Healthy'}</option>
                        <option value="low_activity">{locale === 'ar' ? 'نشاط منخفض' : 'Low activity'}</option>
                        <option value="maintenance">{locale === 'ar' ? 'صيانة' : 'Maintenance'}</option>
                        <option value="inactive">{locale === 'ar' ? 'غير نشط' : 'Inactive'}</option>
                    </select>
                </div>
                <div className="lg:col-span-4 flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>{locale === 'ar' ? 'نافذة التقرير' : 'Report window'}: <span className="text-foreground font-mono">{chartWindowLabel}</span></span>
                    {selectedGymName ? <span>{locale === 'ar' ? 'النادي المحدد' : 'Selected gym'}: <span className="text-foreground font-mono">{selectedGymName}</span></span> : null}
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

            <DashboardGrid layoutId="system_admin_stats">
                {kpiCards.map((card, i) => (
                    <div 
                        key={`stats-${i}`} 
                        className="kpi-card group h-full relative" 
                        data-grid={{ w: 3, h: 4, x: (i % 4) * 3, y: 0 }}
                    >
                        <div className="flex items-start justify-between h-full flex-col">
                            <div className="w-full flex justify-between items-start">
                                <div>
                                    <p className={`inline-flex rounded-md border border-${card.color}-500/30 bg-${card.color}-500/10 px-2 py-1 text-xs font-extrabold text-${card.color}-500 uppercase tracking-wider font-mono`}>
                                        {card.title}
                                    </p>
                                    <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">
                                        {card.value}
                                    </p>
                                </div>
                                <div className="mt-1 h-10 w-10 shrink-0 border border-border bg-muted/50 flex items-center justify-center overflow-hidden">
                                    <card.icon size={16} className="text-foreground" />
                                </div>
                            </div>
                            <div className="mt-auto w-full pt-2 pb-2">
                                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                            </div>
                        </div>
                    </div>
                ))}

                <div key="system-insights" className="kpi-card p-5 h-full relative group flex flex-col" data-grid={{ w: 12, h: 4, x: 0, y: 4 }}>
                    <div className="flex flex-col gap-3">
                        <h3 className="inline-flex rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-base font-extrabold text-primary uppercase tracking-wider font-mono">
                            {locale === 'ar' ? 'رؤى أولوية' : 'Priority Insights'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {priorityInsights.map((insight) => (
                                <div key={insight.label} className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{insight.label}</div>
                                    <div className="mt-2 font-mono text-2xl font-bold text-foreground">{insight.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Revenue Chart */}
                <div key="system-revenue" className="kpi-card p-6 h-full relative group flex flex-col" data-grid={{ w: 12, h: 8, x: 0, y: 8 }}>
                    <div className="flex flex-col gap-3 mb-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">
                                {locale === 'ar' ? 'ملخص السيولة العالمية' : 'Global Cash Flow Summary'}
                            </h3>
                            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                                <span className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                    {locale === 'ar' ? 'إيراد' : 'Income'}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-500">
                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                    {locale === 'ar' ? 'مصروف' : 'Expense'}
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'إجمالي الإيرادات' : 'Total Income'}</div>
                                <div className="mt-1 font-mono text-lg font-bold text-foreground">{formatCurrency(financeSummary.income, 'JOD')}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</div>
                                <div className="mt-1 font-mono text-lg font-bold text-foreground">{formatCurrency(financeSummary.expense, 'JOD')}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'صافي السيولة' : 'Net Cash Flow'}</div>
                                <div className={`mt-1 font-mono text-lg font-bold ${financeSummary.net >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                                    {formatCurrency(financeSummary.net, 'JOD')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-1 min-h-0 flex-1">
                        {chartData.length > 0 ? (
                            <SafeResponsiveChart>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis 
                                        dataKey="label" 
                                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} 
                                        axisLine={false} 
                                        tickLine={false} 
                                    />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                        formatter={(value) => formatCurrency(Number(value), 'JOD')}
                                    />
                                    <Bar dataKey="income" name={locale === 'ar' ? 'الإيراد' : 'Income'} fill="var(--primary)" barSize={24} radius={[2, 2, 0, 0]} />
                                    <Bar dataKey="expense" name={locale === 'ar' ? 'المصروف' : 'Expense'} fill="var(--muted-foreground)" barSize={24} radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </SafeResponsiveChart>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono uppercase tracking-widest">
                                {locale === 'ar' ? 'لا توجد بيانات مالية' : 'No Financial Data'}
                            </div>
                        )}
                    </div>
                </div>
            </DashboardGrid>

            {/* Tenant Health Table */}
            <div className="kpi-card p-6">
                <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="text-primary" size={20} />
                    <h3 className="text-lg font-bold text-foreground">
                        {locale === 'ar' ? 'صحة المستأجرين' : 'Tenant Health & Activity'}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-start table-dark border border-border/60 rounded-xl overflow-hidden">
                        <thead>
                            <tr>
                                <th>{locale === 'ar' ? 'الصالة الرياضية' : 'Gym Name'}</th>
                <th>{locale === 'ar' ? 'الأعضاء النشطون' : 'Active Members'}</th>
                <th>{locale === 'ar' ? 'نقاط النشاط (7أيام)' : 'Activity Score (7d)'}</th>
                <th>{locale === 'ar' ? 'الحالة' : 'Health Status'}</th>
                <th className="text-end">{locale === 'ar' ? 'الإجراء' : 'Action'}</th>
            </tr>
        </thead>
                        <tbody>
                            {orderedHealthData.map((gym) => (
                                <tr key={gym.gym_id} className="hover:bg-muted/30">
                                    <td className="font-bold text-foreground">{gym.gym_name}</td>
                                    <td className="font-mono">{gym.active_members}</td>
                                    <td className="font-mono">{gym.recent_activity_score}</td>
                                    <td>
                                        {(() => {
                                            const labels = {
                                                healthy: locale === 'ar' ? 'سليم' : 'Healthy',
                                                low_activity: locale === 'ar' ? 'نشاط منخفض' : 'Low activity',
                                                maintenance: locale === 'ar' ? 'صيانة' : 'Maintenance',
                                                inactive: locale === 'ar' ? 'غير نشط' : 'Inactive',
                                            } as const;
                                            return (
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            gym.status === 'healthy'
                                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                : gym.status === 'maintenance'
                                                    ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                                                    : gym.status === 'inactive'
                                                        ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        }`}>
                                                {labels[gym.status]}
                                            </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="text-end">
                                        <button
                                            type="button"
                                            onClick={() => router.push(`/dashboard/system/gyms?gym=${gym.gym_id}`)}
                                            className="btn-ghost !py-1 !px-2 text-[10px] uppercase font-bold tracking-tighter"
                                        >
                                            {locale === 'ar' ? 'فتح' : 'Open'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </SystemAdminShell>
    );
}
