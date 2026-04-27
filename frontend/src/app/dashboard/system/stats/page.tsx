'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { normalizeApiError, reportSystemTabError } from '@/lib/systemTelemetry';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Activity, LayoutDashboard, Users, Clock, ShieldAlert, TrendingUp } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import { DashboardGrid } from '@/components/DashboardGrid';
import SafeResponsiveChart from '@/components/SafeResponsiveChart';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

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
    active_members: number;
    recent_activity_score: number;
    status: string;
}

export default function SystemStatsPage() {
    const { user } = useAuth();
    const { t, formatCurrency, formatDate, locale } = useLocale();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [healthData, setHealthData] = useState<GymHealthRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingMaint, setUpdatingMaint] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [statsResp, revResp, healthResp] = await Promise.all([
                api.get('/system/stats'),
                api.get('/system/analytics/revenue?days=30'),
                api.get('/system/gyms/health')
            ]);
            setStats(statsResp.data);
            setRevenueData(revResp.data);
            setHealthData(healthResp.data);
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
            await reportSystemTabError('system_stats', 'fetch_stats', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            fetchData();
        }
    }, [user, fetchData]);

    const toggleGlobalMaintenance = async () => {
        if (!stats) return;
        setUpdatingMaint(true);
        const newStatus = !stats.global_maintenance;
        try {
            await api.post('/system/config/maintenance', { is_maintenance_mode: newStatus });
            setStats({ ...stats, global_maintenance: newStatus });
        } catch (err) {
            const message = normalizeApiError(err);
            setError(message);
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

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
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
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">
                        {t('dashboard.sections.systemAdmin')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {locale === 'ar' ? 'نظرة عامة على النظام العالمي' : 'Global platform overview and health'}
                    </p>
                </div>

                <div className="flex items-center gap-3 bg-card border border-border p-2 rounded-lg">
                    <div className="flex items-center gap-2 px-2">
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

                {/* Revenue Chart */}
                <div key="system-revenue" className="kpi-card p-6 h-full relative group flex flex-col" data-grid={{ w: 12, h: 8, x: 0, y: 4 }}>
                    <div className="flex flex-col gap-3 mb-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">
                                {locale === 'ar' ? 'ملخص السيولة العالمية' : 'Global Cash Flow Summary'} (30d)
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
                            </tr>
                        </thead>
                        <tbody>
                            {healthData.map((gym) => (
                                <tr key={gym.gym_id} className="hover:bg-muted/30">
                                    <td className="font-bold text-foreground">{gym.gym_name}</td>
                                    <td className="font-mono">{gym.active_members}</td>
                                    <td className="font-mono">{gym.recent_activity_score}</td>
                                    <td>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            gym.status === 'Healthy' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        }`}>
                                            {gym.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
