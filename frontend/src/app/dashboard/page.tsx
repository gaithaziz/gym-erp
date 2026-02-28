'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Users, DollarSign, Clock, TrendingUp, QrCode, Dumbbell, Utensils, ChevronRight, MessageSquare, UserCheck, ClipboardList, Trophy, Activity, Download } from 'lucide-react';
import {
    BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import Link from 'next/link';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DashboardGrid } from '@/components/DashboardGrid';
import MemberSearchSelect from '@/components/MemberSearchSelect';
import TablePagination from '@/components/TablePagination';
import { fetchMemberOverviewData } from '@/app/dashboard/member/_shared/customerData';
import type { GamificationStats as MemberGamificationStats } from '@/app/dashboard/member/_shared/types';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { useLocale } from '@/context/LocaleContext';

// ======================== ADMIN DASHBOARD ========================

interface DashboardStats {
    today_visitors: number;
    todays_revenue: number;
    active_members: number;
    monthly_revenue: number;
    monthly_expenses: number;
    pending_salaries: number;
}

interface DailyVisitorRow {
    date?: string;
    week_start?: string;
    unique_visitors: number;
}

interface LowStockItem {
    id: string;
    name: string;
    stock_quantity: number;
    low_stock_threshold: number;
}

interface ActivityItem {
    text: string;
    time: string;
    color: string;
    type: string;
}

interface Plan {
    id: string;
    name: string;
    description?: string;
    member_id?: string | null;
    exercises?: {
        id?: string;
        exercise_id?: string;
        exercise_name?: string;
        name: string;
        sets: number;
        reps: number;
        exercise?: { name: string };
    }[];
}

interface Diet {
    id: string;
    name: string;
    description?: string;
    content: string;
    member_id?: string | null;
}

interface MemberSummary {
    id: string;
    full_name: string;
    email: string;
    date_of_birth?: string;
}
const VISITOR_ROWS_PAGE_SIZE = 10;

interface BiometricLogResponse {
    id: string;
    date: string;
    weight_kg?: number;
    height_cm?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
}

type CoachBiometricMetricKey = 'weight_kg' | 'body_fat_pct' | 'muscle_mass_kg';

interface AttendanceData {
    hour: string;
    visits: number;
}

interface RevenueData {
    date: string;
    revenue: number;
    expenses: number;
}

interface RevenueChartPoint extends RevenueData {
    label: string;
}

const calculateAge = (dob?: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 0 ? age : null;
};

function AdminDashboard({ userName }: { userName: string }) {
    const { t, direction, formatCurrency, formatDate, locale } = useLocale();
    const adminTxt = locale === 'ar'
        ? {
            justNow: 'الآن',
            minutesAgoSuffix: 'دقيقة مضت',
            hoursAgoSuffix: 'ساعة مضت',
            recentSystemActivity: 'آخر نشاطات النظام',
            noRecentActivity: 'لا يوجد نشاط حديث',
            dailyVisitorReport: 'تقرير الزوار اليومي (غير مباشر)',
            exportCsv: 'تصدير CSV',
            noVisitorData: 'لا توجد بيانات تقرير زوار للنطاق المحدد.',
            date: 'التاريخ',
            uniqueVisitors: 'الزوار الفريدون',
            noRows: 'لا توجد صفوف',
            csvFileName: 'daily_visitors_report_ar.csv',
        }
        : {
            justNow: 'Just now',
            minutesAgoSuffix: 'm ago',
            hoursAgoSuffix: 'h ago',
            recentSystemActivity: 'Recent System Activity',
            noRecentActivity: 'No recent activity',
            dailyVisitorReport: 'Daily Visitor Report (Non-Live)',
            exportCsv: 'Export CSV',
            noVisitorData: 'No visitor report data for selected range.',
            date: 'Date',
            uniqueVisitors: 'Unique Visitors',
            noRows: 'No rows',
            csvFileName: 'daily_visitors_report_en.csv',
        };
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [revenueViewMode, setRevenueViewMode] = useState<'daily' | 'weekly'>('daily');
    const [hoveredRevenueIndex, setHoveredRevenueIndex] = useState<number | null>(null);
    const revenueBarColor = '#22c55e';
    const expensesBarColor = '#ef4444';
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
    const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
    const [dailyVisitors, setDailyVisitors] = useState<DailyVisitorRow[]>([]);
    const [dailyVisitorsPage, setDailyVisitorsPage] = useState(1);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });

    const selectedDays = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to) return 30;

        const start = new Date(dateRange.from);
        const end = new Date(dateRange.to);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
        return Math.min(365, Math.max(1, diff));
    }, [dateRange]);

    const fetchData = useCallback(() => {
        const from = dateRange?.from ? dateRange.from.toISOString().split('T')[0] : '';
        const to = dateRange?.to ? dateRange.to.toISOString().split('T')[0] : '';
        const dateQuery = from && to ? `?from=${from}&to=${to}` : '';

        // API calls (mocking query implementation on backend for now if not ready)
        // Ideally backend should accept date range params
        api.get('/analytics/dashboard' + dateQuery)
            .then(res => setStats(res.data.data))
            .catch(err => console.error("Failed to fetch dashboard stats", err));

        api.get(`/analytics/attendance?days=${selectedDays}`)
            .then(res => setAttendanceData(res.data.data || []))
            .catch(() => { });

        api.get(`/analytics/revenue-chart?days=${selectedDays}`)
            .then(res => setRevenueData(res.data.data || []))
            .catch(() => { });

        api.get('/analytics/recent-activity')
            .then(res => setRecentActivity(res.data.data || []))
            .catch(() => setRecentActivity([]));

        api.get('/inventory/products/low-stock')
            .then(res => setLowStockItems(res.data.data || []))
            .catch(() => setLowStockItems([]));

        api.get('/analytics/daily-visitors' + dateQuery)
            .then(res => setDailyVisitors(res.data.data || []))
            .catch(() => setDailyVisitors([]));
    }, [dateRange, selectedDays]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalDailyVisitorPages = Math.max(1, Math.ceil(dailyVisitors.length / VISITOR_ROWS_PAGE_SIZE));
    const safeDailyVisitorsPage = Math.min(dailyVisitorsPage, totalDailyVisitorPages);
    const visibleDailyVisitors = dailyVisitors.slice((safeDailyVisitorsPage - 1) * VISITOR_ROWS_PAGE_SIZE, safeDailyVisitorsPage * VISITOR_ROWS_PAGE_SIZE);

    const formatTime = (iso: string) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return adminTxt.justNow;
            if (diffMin < 60) return `${diffMin}${adminTxt.minutesAgoSuffix}`;
            const diffHr = Math.floor(diffMin / 60);
            if (diffHr < 24) return `${diffHr}${adminTxt.hoursAgoSuffix}`;
            return formatDate(d, { month: 'short', day: '2-digit', year: 'numeric' });
        } catch { return ''; }
    };

    const revenueChartData = useMemo<RevenueChartPoint[]>(() => {
        if (revenueViewMode === 'daily') {
            return revenueData.map((point) => {
                const date = new Date(point.date);
                const label = Number.isNaN(date.getTime())
                    ? point.date
                    : formatDate(date, { month: 'short', day: 'numeric' });
                return { ...point, label };
            });
        }

        const weeklyBuckets = new Map<string, RevenueChartPoint>();

        revenueData.forEach((point) => {
            const date = new Date(point.date);
            if (Number.isNaN(date.getTime())) return;

            const weekStart = new Date(date);
            const dayOfWeek = (weekStart.getDay() + 6) % 7; // Monday-based
            weekStart.setDate(weekStart.getDate() - dayOfWeek);
            weekStart.setHours(0, 0, 0, 0);

            const key = weekStart.toISOString().split('T')[0];
            const existing = weeklyBuckets.get(key);
            if (existing) {
                existing.revenue += point.revenue;
                existing.expenses += point.expenses;
                return;
            }

            weeklyBuckets.set(key, {
                date: key,
                label: formatDate(weekStart, { month: 'short', day: 'numeric' }),
                revenue: point.revenue,
                expenses: point.expenses,
            });
        });

        return Array.from(weeklyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [formatDate, revenueData, revenueViewMode]);

    const kpiCards = [
        { title: t('dashboard.home.todayVisitors'), value: stats?.today_visitors ?? '--', subtitle: t('dashboard.home.todayVisitorsSubtitle'), icon: Activity, badge: 'badge-blue' },
        { title: t('dashboard.home.todaysRevenue'), value: stats ? formatCurrency(stats.todays_revenue, 'JOD', { currencyDisplay: 'code' }) : '--', subtitle: t('dashboard.home.todaysRevenueSubtitle'), icon: DollarSign, badge: 'badge-green' },
        { title: t('dashboard.home.pendingSalaries'), value: stats ? formatCurrency(stats.pending_salaries, 'JOD', { currencyDisplay: 'code' }) : '--', subtitle: t('dashboard.home.pendingSalariesSubtitle'), icon: Clock, badge: 'badge-amber' },
        { title: t('dashboard.home.lowStockAlerts'), value: lowStockItems.length, subtitle: t('dashboard.home.lowStockAlertsSubtitle'), icon: TrendingUp, badge: 'badge-destructive', isAlert: lowStockItems.length > 0 },
    ];

    const exportDailyVisitorsCsv = async () => {
        const from = dateRange?.from ? dateRange.from.toISOString().split('T')[0] : '';
        const to = dateRange?.to ? dateRange.to.toISOString().split('T')[0] : '';
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        params.set('format', 'csv');

        try {
            const response = await api.get(`/analytics/daily-visitors?${params.toString()}`, {
                responseType: 'blob',
            });
            const blob = response.data as Blob;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = adminTxt.csvFileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            console.error('Failed to export visitor report');
        }
    };

    return (
        <div className="space-y-4">
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 ${direction === 'rtl' ? 'md:pl-28' : 'md:pr-28'}`}>
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{t('dashboard.home.title')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('dashboard.home.operationsCenter')} | {userName}</p>
                </div>
                <div className="flex items-center gap-2 mt-1 md:mt-2">
                    <DateRangePicker date={dateRange} setDate={setDateRange} className="z-10" />
                </div>
            </div>

            <DashboardGrid layoutId="admin_dashboard_v1">
                {/* KPI Cards */}
                {kpiCards.map((card, i) => (
                    <div key={`stats-${i}`} className="kpi-card group h-full relative" data-grid={{ w: 3, h: 4, x: (i % 4) * 3, y: Math.floor(i / 4) * 4 }}>
                        <div className="flex items-start justify-between h-full flex-col">
                            <div className="w-full flex justify-between items-start">
                                <div>
                                    <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">{card.title}</p>
                                    <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{card.value}</p>
                                </div>
                                <div className="mt-1 h-10 w-10 shrink-0 border border-border bg-muted/50 flex items-center justify-center overflow-hidden">
                                    <card.icon size={16} className="text-foreground" />
                                </div>
                            </div>
                            <div className="mt-auto w-full pt-2 pb-2">
                                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                                {card.isAlert && (
                                    <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-destructive/20 w-full">
                                        <span className="h-2 w-2 bg-destructive animate-ping" />
                                        <span className="text-xs text-destructive font-bold uppercase tracking-wider">{t('dashboard.home.attention')}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Charts */}
                <div key="chart-visits" className="kpi-card p-6 h-full relative group">
                    <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mb-6">{t('dashboard.home.visitsByHour')} ({t('dashboard.home.lastDays').replace('{{days}}', String(selectedDays))})</h3>
                    <div className="h-[calc(100%-2rem)]">
                        {attendanceData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                                <BarChart data={attendanceData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'var(--muted)' }}
                                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                    />
                                    <Bar dataKey="visits" fill="var(--primary)" barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">{t('dashboard.home.noData')}</div>
                        )}
                    </div>
                </div>

                <div key="chart-revenue" className="kpi-card p-6 h-full relative group flex flex-col">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">{t('dashboard.home.revenueVsExpenses')} ({t('dashboard.home.lastDays').replace('{{days}}', String(selectedDays))})</h3>
                        <div className="flex items-center gap-1 border border-border bg-muted/20 p-1">
                            <button
                                type="button"
                                onClick={() => setRevenueViewMode('daily')}
                                className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors ${revenueViewMode === 'daily' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t('dashboard.home.daily')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setRevenueViewMode('weekly')}
                                className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors ${revenueViewMode === 'weekly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t('dashboard.home.weekly')}
                            </button>
                        </div>
                    </div>
                    <div className="mb-3 flex items-center gap-4 text-xs font-mono">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: revenueBarColor }} />
                            {t('dashboard.home.revenue')}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: expensesBarColor }} />
                            {t('dashboard.home.expenses')}
                        </div>
                    </div>
                    <div className="mt-1 min-h-0 flex-1">
                        {revenueChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                                <BarChart
                                    data={revenueChartData}
                                    barGap={1}
                                    barCategoryGap="28%"
                                    margin={{ top: 6, right: 14, left: 4, bottom: 8 }}
                                    onMouseMove={(state) => {
                                        const idx = state?.activeTooltipIndex;
                                        setHoveredRevenueIndex(typeof idx === 'number' ? idx : null);
                                    }}
                                    onMouseLeave={() => setHoveredRevenueIndex(null)}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        interval="preserveStartEnd"
                                        minTickGap={24}
                                        padding={{ left: 14, right: 14 }}
                                        tickMargin={8}
                                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value, _name, entry) => {
                                            const dataKey = String((entry as { dataKey?: string } | undefined)?.dataKey || '');
                                            const metricLabel = dataKey === 'revenue'
                                                ? t('dashboard.home.revenue')
                                                : t('dashboard.home.expenses');
                                            return [
                                                formatCurrency(Number(value ?? 0), 'JOD', { currencyDisplay: 'code' }),
                                                metricLabel,
                                            ];
                                        }}
                                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                    />
                                    <Bar dataKey="revenue" name={t('dashboard.home.revenue')} fill={revenueBarColor} maxBarSize={22} radius={[2, 2, 0, 0]}>
                                        {revenueChartData.map((_, i) => (
                                            <Cell
                                                key={`rev-${i}`}
                                                fill={revenueBarColor}
                                                fillOpacity={hoveredRevenueIndex === null || hoveredRevenueIndex === i ? 1 : 0.35}
                                            />
                                        ))}
                                    </Bar>
                                    <Bar dataKey="expenses" name={t('dashboard.home.expenses')} fill={expensesBarColor} maxBarSize={22} radius={[2, 2, 0, 0]}>
                                        {revenueChartData.map((_, i) => (
                                            <Cell
                                                key={`exp-${i}`}
                                                fill={expensesBarColor}
                                                fillOpacity={hoveredRevenueIndex === null || hoveredRevenueIndex === i ? 1 : 0.35}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">{t('dashboard.home.noFinancialData')}</div>
                        )}
                    </div>
                </div>

                {/* Recent Activity */}
                <div key="activity" className="kpi-card p-0 h-full relative group overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border flex-shrink-0">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">{adminTxt.recentSystemActivity}</h3>
                    </div>
                    <div className="divide-y divide-border overflow-y-auto flex-1">
                        {recentActivity.length > 0 ? (
                            recentActivity.map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'access' ? 'bg-emerald-500' :
                                        item.type === 'finance' ? 'bg-blue-500' :
                                            item.type === 'attendance' ? 'bg-amber-500' : 'bg-gray-500'
                                        }`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{item.text}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{formatTime(item.time)}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-muted-foreground text-sm font-mono">{adminTxt.noRecentActivity}</div>
                        )}
                    </div>
                </div>
            </DashboardGrid>

            <div className="kpi-card p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">{adminTxt.dailyVisitorReport}</h3>
                    <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1" onClick={exportDailyVisitorsCsv}>
                        <Download size={14} />
                        {adminTxt.exportCsv}
                    </button>
                </div>
                <div className="h-44 mb-4">
                    {dailyVisitors.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                            <LineChart data={dailyVisitors.map((row) => ({ label: row.date || row.week_start || '', unique_visitors: row.unique_visitors }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }} />
                                <Line type="monotone" dataKey="unique_visitors" stroke="var(--primary)" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border">{adminTxt.noVisitorData}</div>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[440px]">
                        <thead>
                            <tr>
                                <th>{adminTxt.date}</th>
                                <th>{adminTxt.uniqueVisitors}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyVisitors.length > 0 ? (
                                visibleDailyVisitors.map((row, i) => (
                                    <tr key={`${row.date || row.week_start}-${i}`}>
                                        <td className="font-mono text-xs text-muted-foreground">{row.date || row.week_start || '-'}</td>
                                        <td className="font-mono text-xs text-foreground">{row.unique_visitors}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={2} className="text-center py-4 text-muted-foreground text-sm">{adminTxt.noRows}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <TablePagination
                    page={safeDailyVisitorsPage}
                    totalPages={totalDailyVisitorPages}
                    onPrevious={() => setDailyVisitorsPage((prev) => Math.max(1, prev - 1))}
                    onNext={() => setDailyVisitorsPage((prev) => Math.min(totalDailyVisitorPages, prev + 1))}
                />
            </div>
        </div>
    );
}

// ======================== COACH DASHBOARD ========================

function CoachDashboard({ userName }: { userName: string }) {
    const { locale, t } = useLocale();
    const txt = locale === 'ar'
        ? {
            trainerPortal: 'بوابة المدرب',
            workoutPlans: 'خطط التمرين',
            plansCreated: 'الخطط المنشأة',
            assignedToMembers: 'مُعيّنة للأعضاء',
            noAssignedClients: 'لا يوجد أعضاء معيّنون بعد',
            assignedCompleted: 'عميلًا مُعيّنًا أكمل التمارين',
            createManagePrograms: 'إنشاء وإدارة البرامج',
            manageNutrition: 'إدارة التغذية',
            traineeFeedback: 'ملاحظات المتدربين',
            logsRatings: 'السجلات والتقييمات',
            entranceAccess: 'وصول الدخول',
            recentPlans: 'أحدث الخطط المنشأة',
            viewAll: 'عرض الكل ←',
            biometricsSubtitle: 'راقب قياسات العميل وتقدمه',
            client: 'العميل',
            searchClient: 'ابحث عن عميل...',
            age: 'العمر',
            height: 'الطول',
            weight: 'الوزن',
            bodyFat: 'دهون الجسم',
            noClientSelected: 'لم يتم اختيار عميل.',
        }
        : {
            trainerPortal: 'Trainer Portal',
            workoutPlans: 'Workout Plans',
            plansCreated: 'Plans created',
            assignedToMembers: 'Assigned to members',
            noAssignedClients: 'No assigned clients yet',
            assignedCompleted: 'assigned clients completed workouts',
            createManagePrograms: 'Create & manage programs',
            manageNutrition: 'Manage nutrition',
            traineeFeedback: 'Trainee Feedback',
            logsRatings: 'Logs & ratings',
            entranceAccess: 'Entrance access',
            recentPlans: 'Recently Created Plans',
            viewAll: 'VIEW ALL →',
            biometricsSubtitle: 'Monitor member biometrics and progress trends',
            client: 'Client',
            searchClient: 'Search client...',
            age: 'Age',
            height: 'Height',
            weight: 'Weight',
            bodyFat: 'Body Fat',
            noClientSelected: 'No client selected.',
        };
    const chartMetricConfig: Array<{ key: CoachBiometricMetricKey; label: string; color: string }> = [
        { key: 'weight_kg', label: 'Weight (kg)', color: 'var(--primary)' },
        { key: 'body_fat_pct', label: 'Body Fat (%)', color: '#f97316' },
        { key: 'muscle_mass_kg', label: 'Muscle Mass (kg)', color: '#22c55e' },
    ];

    const [plansCount, setPlansCount] = useState(0);
    const [dietsCount, setDietsCount] = useState(0);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [members, setMembers] = useState<MemberSummary[]>([]);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [memberBiometrics, setMemberBiometrics] = useState<BiometricLogResponse[]>([]);
    const [selectedMetric, setSelectedMetric] = useState<CoachBiometricMetricKey>('weight_kg');
    const [planAdherence, setPlanAdherence] = useState({ rate: 0, adherent: 0, assigned: 0 });
    const [loading, setLoading] = useState(true);

    const fetchPlanAdherence = useCallback(async (plansData: Plan[]) => {
        const assignedPlans = plansData.filter((plan) => !!plan.member_id);
        const assignedMemberIds = new Set(
            assignedPlans.map((plan) => plan.member_id).filter((memberId): memberId is string => !!memberId)
        );

        if (assignedMemberIds.size === 0) {
            setPlanAdherence({ rate: 0, adherent: 0, assigned: 0 });
            return;
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const logResponses = await Promise.all(
            assignedPlans.map((plan) =>
                api.get(`/fitness/logs/${plan.id}`, {
                    params: {
                        from_date: sevenDaysAgo.toISOString(),
                        limit: 500,
                    },
                }).catch(() => ({ data: { data: [] } }))
            )
        );

        const activeMemberIds = new Set<string>();
        logResponses.forEach((res) => {
            const logs = (res.data?.data || []) as Array<{ member_id: string; completed: boolean }>;
            logs.forEach((log) => {
                if (log.completed && assignedMemberIds.has(log.member_id)) {
                    activeMemberIds.add(log.member_id);
                }
            });
        });

        const assignedCount = assignedMemberIds.size;
        const adherentCount = activeMemberIds.size;
        const rate = assignedCount > 0 ? Math.round((adherentCount / assignedCount) * 100) : 0;
        setPlanAdherence({ rate, adherent: adherentCount, assigned: assignedCount });
    }, []);

    useEffect(() => {
        Promise.all([
            api.get('/fitness/plans').catch(() => ({ data: { data: [] } })),
            api.get('/fitness/diets').catch(() => ({ data: { data: [] } })),
            api.get('/hr/members').catch(() => ({ data: { data: [] } })),
        ]).then(([plansRes, dietsRes, membersRes]) => {
            const plansData = plansRes.data.data || [];
            const dietsData = dietsRes.data.data || [];
            const assignedDietsData = dietsData.filter((diet: Diet) => !!diet.member_id);
            const membersData = membersRes.data.data || [];
            setPlans(plansData);
            setPlansCount(plansData.length);
            setDietsCount(assignedDietsData.length);
            setMembers(membersData);
            if (membersData.length > 0) setSelectedMemberId(membersData[0].id);
            fetchPlanAdherence(plansData).catch(() => setPlanAdherence({ rate: 0, adherent: 0, assigned: 0 }));
            setLoading(false);
        });
    }, [fetchPlanAdherence]);

    useEffect(() => {
        if (!selectedMemberId) return;
        api.get(`/fitness/biometrics/member/${selectedMemberId}`)
            .then(res => setMemberBiometrics(res.data.data || []))
            .catch(() => setMemberBiometrics([]));
    }, [selectedMemberId]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
    );

    const selectedMember = members.find(member => member.id === selectedMemberId);
    const selectedMemberAge = calculateAge(selectedMember?.date_of_birth);
    const latestMemberMetrics = memberBiometrics.length > 0 ? memberBiometrics[memberBiometrics.length - 1] : null;

    const selectedMetricConfig = chartMetricConfig.find((metric) => metric.key === selectedMetric) ?? chartMetricConfig[0];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{locale === 'ar' ? 'لوحة المدرب' : 'Coach Dashboard'}</h1>
                <p className="text-sm text-muted-foreground mt-1">{txt.trainerPortal} • {userName}</p>
            </div>

            {/* KPI Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="kpi-card group">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">{txt.workoutPlans}</p>
                            <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{plansCount}</p>
                            <p className="text-xs text-muted-foreground mt-1">{txt.plansCreated}</p>
                        </div>
                        <div className="p-2 border border-border bg-muted/50">
                            <Dumbbell size={18} className="text-foreground" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card group">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">{locale === 'ar' ? 'خطط التغذية المعينة' : 'Assigned Diet Plans'}</p>
                            <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{dietsCount}</p>
                            <p className="text-xs text-muted-foreground mt-1">{txt.assignedToMembers}</p>
                        </div>
                        <div className="p-2 border border-border bg-muted/50">
                            <Utensils size={18} className="text-foreground" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card group">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">{locale === 'ar' ? 'الالتزام بالخطة (7 أيام)' : 'Plan Adherence (7d)'}</p>
                            <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{planAdherence.rate}%</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {planAdherence.assigned > 0
                                    ? `${planAdherence.adherent}/${planAdherence.assigned} ${txt.assignedCompleted}`
                                    : txt.noAssignedClients}
                            </p>
                        </div>
                        <div className="p-2 border border-border bg-muted/50">
                            <Activity size={18} className="text-foreground" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-fr">
                <Link href="/dashboard/coach/plans" className="kpi-card flex items-center justify-between group hover:border-primary transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted/30 border border-border text-primary">
                            <Dumbbell size={20} />
                        </div>
                        <div>
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">{txt.workoutPlans}</h3>
                            <p className="text-muted-foreground text-xs">{txt.createManagePrograms}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
                <Link href="/dashboard/coach/diets" className="kpi-card flex items-center justify-between group hover:border-primary transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted/30 border border-border text-primary">
                            <Utensils size={20} />
                        </div>
                        <div>
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">{locale === 'ar' ? 'خطط التغذية' : 'Diet Plans'}</h3>
                            <p className="text-muted-foreground text-xs">{txt.manageNutrition}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
                <Link href="/dashboard/coach/feedback" className="kpi-card flex items-center justify-between group hover:border-primary transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted/30 border border-border text-primary">
                            <MessageSquare size={20} />
                        </div>
                        <div>
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">{txt.traineeFeedback}</h3>
                            <p className="text-muted-foreground text-xs">{txt.logsRatings}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
                <Link href="/dashboard/qr" className="kpi-card flex items-center justify-between group hover:border-primary transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted/30 border border-border text-primary">
                            <QrCode size={20} />
                        </div>
                        <div>
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">{t('dashboard.nav.myQrCode')}</h3>
                            <p className="text-muted-foreground text-xs">{txt.entranceAccess}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
            </div>

            {/* Recent Plans */}
            {plans.length > 0 ? (
                <div className="kpi-card p-0">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">{txt.recentPlans}</h3>
                        <Link href="/dashboard/coach/plans" className="text-xs text-primary hover:text-primary/80 font-mono">{txt.viewAll}</Link>
                    </div>
                    <div className="divide-y divide-border">
                        {plans.slice(0, 5).map((plan: Plan, i: number) => (
                            <div key={plan.id || i} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Dumbbell size={16} className="text-primary" />
                                    <span className="text-sm text-foreground font-medium">{plan.name}</span>
                                </div>
                                <span className="text-xs text-muted-foreground font-mono">{plan.exercises?.length || 0} EXERCISES</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="kpi-card border-dashed border-border min-h-[140px] flex items-center justify-center text-sm text-muted-foreground">
                    {locale === 'ar' ? 'لا توجد خطط حديثة بعد.' : 'No recent plans yet.'}
                </div>
            )}

            <div className="kpi-card p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">{locale === 'ar' ? 'تتبع تقدم العميل' : 'Client Progress Tracking'}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{txt.biometricsSubtitle}</p>
                    </div>
                    <div className="w-full sm:w-72">
                        <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">{txt.client}</label>
                        <MemberSearchSelect
                            members={members}
                            value={selectedMemberId}
                            onChange={setSelectedMemberId}
                            allowClear={false}
                            placeholder={txt.searchClient}
                        />
                    </div>
                </div>

                {selectedMember ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">{txt.age}</p>
                            <p className="text-lg font-bold text-foreground mt-1">{selectedMemberAge !== null ? selectedMemberAge : 'N/A'}</p>
                        </div>
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">{txt.height}</p>
                            <p className="text-lg font-bold text-foreground mt-1">{latestMemberMetrics?.height_cm ? `${latestMemberMetrics.height_cm} cm` : 'N/A'}</p>
                        </div>
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">{txt.weight}</p>
                            <p className="text-lg font-bold text-foreground mt-1">{latestMemberMetrics?.weight_kg ? `${latestMemberMetrics.weight_kg} kg` : 'N/A'}</p>
                        </div>
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">{txt.bodyFat}</p>
                            <p className="text-lg font-bold text-foreground mt-1">{latestMemberMetrics?.body_fat_pct ? `${latestMemberMetrics.body_fat_pct}%` : 'N/A'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">{txt.noClientSelected}</div>
                )}

                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {chartMetricConfig.map((metric) => {
                            const enabled = selectedMetric === metric.key;
                            return (
                                <label
                                    key={metric.key}
                                    className={`min-h-9 rounded-sm border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        enabled
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
                                    }`}
                                    title={`Show ${metric.label}`}
                                >
                                    <input
                                        type="radio"
                                        name="coach-biometric-metric"
                                        className="sr-only"
                                        checked={enabled}
                                        onChange={() => setSelectedMetric(metric.key)}
                                    />
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: metric.color }} />
                                        {metric.label}
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    <div className="h-56 lg:h-64">
                    {memberBiometrics.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                            <LineChart data={memberBiometrics}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(val) => new Date(val).toLocaleDateString()}
                                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }} labelFormatter={(label) => new Date(label as string).toLocaleDateString()} />
                                <Line
                                    type="monotone"
                                    dataKey={selectedMetricConfig.key}
                                    stroke={selectedMetricConfig.color}
                                    strokeWidth={2}
                                    name={selectedMetricConfig.label}
                                    dot={{ r: 3, fill: selectedMetricConfig.color }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono border border-dashed border-border flex-col">
                            <Activity size={24} className="mb-2 opacity-50" />
                            <span>{locale === 'ar' ? 'لا توجد بيانات قياسات حيوية لهذا العميل' : 'NO BIOMETRIC DATA FOR THIS CLIENT'}</span>
                        </div>
                    )}
                </div>
                </div>
            </div>
        </div>
    );
}

// ======================== CUSTOMER DASHBOARD ========================

function CustomerDashboard({
    userName,
    subscriptionEndDate,
    subscriptionStatus,
    subscriptionPlanName,
}: {
    userName: string;
    dateOfBirth?: string;
    subscriptionEndDate?: string | null;
    subscriptionStatus?: 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'NONE';
    subscriptionPlanName?: string | null;
}) {
    const { t, formatDate, locale } = useLocale();
    const customerTxt = locale === 'ar'
        ? {
            streak: 'سلسلة',
            dayStreakSuffix: 'يوم متتالٍ',
            subscription: 'الاشتراك',
            expires: 'ينتهي:',
            statusLabel: 'الحالة:',
            visits: 'زيارة',
            myProgress: 'تقدمي',
            bodyMetricsTrends: 'قياسات الجسم والاتجاهات',
            workoutPlans: 'خطط التمرين',
            viewPlansAndLog: 'عرض الخطط وتسجيل الجلسات',
            dietPlans: 'خطط التغذية',
            assignedNutrition: 'خطط التغذية المعينة',
            history: 'السجل',
            attendancePayments: 'الحضور والمدفوعات',
            achievements: 'الإنجازات',
            badgesMilestones: 'الشارات والإنجازات المرحلية',
            myFeedback: 'ملاحظاتي',
            shareFeedback: 'شارك ملاحظاتك عن الخطط والنادي',
            myQrCode: 'رمز QR الخاص بي',
            checkInAccess: 'وصول تسجيل الدخول',
            myProfile: 'ملفي الشخصي',
            manageAccount: 'إدارة تفاصيل الحساب',
        }
        : {
            streak: 'Streak',
            dayStreakSuffix: 'day streak',
            subscription: 'Subscription',
            expires: 'Expires:',
            statusLabel: 'Status:',
            visits: 'visits',
            myProgress: 'My Progress',
            bodyMetricsTrends: 'Body metrics and trends',
            workoutPlans: 'Workout Plans',
            viewPlansAndLog: 'View plans and log sessions',
            dietPlans: 'Diet Plans',
            assignedNutrition: 'Assigned nutrition plans',
            history: 'History',
            attendancePayments: 'Attendance and payments',
            achievements: 'Achievements',
            badgesMilestones: 'Badges and milestones',
            myFeedback: 'My Feedback',
            shareFeedback: 'Share plan and gym feedback',
            myQrCode: 'My QR Code',
            checkInAccess: 'Check-in access',
            myProfile: 'My Profile',
            manageAccount: 'Manage account details',
        };
    const [stats, setStats] = useState<MemberGamificationStats | null>(null);
    const [biometrics, setBiometrics] = useState<BiometricLogResponse[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const overview = await fetchMemberOverviewData();
            setStats(overview.stats);
            setBiometrics(overview.biometrics);
            setLoading(false);
        };
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    const weeklyProgress = stats?.weekly_progress?.current || 0;
    const weeklyGoal = stats?.weekly_progress?.goal || 3;
    const progressPercent = Math.min(100, (weeklyProgress / weeklyGoal) * 100);
    const latestBio = biometrics.length > 0 ? biometrics[biometrics.length - 1] : null;
    const parsedExpiryDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;
    const hasValidExpiry = Boolean(parsedExpiryDate && !Number.isNaN(parsedExpiryDate.getTime()));
    const formattedExpiryDate = hasValidExpiry
        ? formatDate(parsedExpiryDate!, {
            weekday: 'short',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
        : (locale === 'ar' ? 'لا يوجد تاريخ انتهاء' : 'No expiry date set');
    const planLabel = localizeSubscriptionPlanName(subscriptionPlanName, locale) || (locale === 'ar' ? 'خطة اشتراك' : 'Membership Plan');
    const statusLabel = subscriptionStatus || 'NONE';
    const subscriptionCardTheme = {
        ACTIVE: {
            cardClass: 'border-emerald-500/30 bg-emerald-500/5',
            statusClass: 'text-emerald-400',
        },
        FROZEN: {
            cardClass: 'border-blue-500/30 bg-blue-500/5',
            statusClass: 'text-blue-400',
        },
        EXPIRED: {
            cardClass: 'border-red-500/30 bg-red-500/5',
            statusClass: 'text-red-400',
        },
        NONE: {
            cardClass: 'border-border bg-muted/20',
            statusClass: 'text-muted-foreground',
        },
    }[statusLabel];

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{locale === 'ar' ? 'مرحباً،' : 'Welcome,'} {userName}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{locale === 'ar' ? 'نظرة عامة على لياقتك.' : 'Your fitness overview.'}</p>
                </div>
                {stats?.streak && stats.streak.current_streak > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                        <span className="text-orange-500">{customerTxt.streak}</span>
                        <span className="text-sm font-bold text-orange-500">{stats.streak.current_streak} {customerTxt.dayStreakSuffix}</span>
                    </div>
                )}
            </div>

            <div className={`kpi-card p-5 ${subscriptionCardTheme.cardClass}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <p className="section-chip mb-2">{customerTxt.subscription}</p>
                        <p className="text-lg font-bold text-foreground font-mono">
                            {customerTxt.expires} {formattedExpiryDate}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {planLabel} | {customerTxt.statusLabel} <span className={subscriptionCardTheme.statusClass}>{statusLabel}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="kpi-card p-5">
                    <p className="section-chip mb-2">{locale === 'ar' ? 'الهدف الأسبوعي' : 'Weekly Goal'}</p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold text-foreground">{weeklyProgress}</span>
                        <span className="text-sm text-muted-foreground mb-1">/ {weeklyGoal} {customerTxt.visits}</span>
                    </div>
                    <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden mt-3">
                        <div
                            className="bg-primary h-full transition-all duration-700 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
                <div className="kpi-card p-5">
                    <p className="section-chip mb-2">{locale === 'ar' ? 'إجمالي الزيارات' : 'Total Visits'}</p>
                    <p className="text-3xl font-bold text-foreground font-mono">{stats?.total_visits || 0}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="section-chip mb-2">{locale === 'ar' ? 'الشارات المكتسبة' : 'Badges Earned'}</p>
                    <p className="text-3xl font-bold text-foreground font-mono">{stats?.badges?.length || 0}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="kpi-card p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'آخر طول' : 'Latest Height'}</p>
                    <p className="text-xl font-bold text-foreground mt-1">{latestBio?.height_cm ? `${latestBio.height_cm} cm` : '--'}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'آخر وزن' : 'Latest Weight'}</p>
                    <p className="text-xl font-bold text-foreground mt-1">{latestBio?.weight_kg ? `${latestBio.weight_kg} kg` : '--'}</p>
                </div>
                <div className="kpi-card p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'دهون الجسم' : 'Body Fat'}</p>
                    <p className="text-xl font-bold text-foreground mt-1">{latestBio?.body_fat_pct ? `${latestBio.body_fat_pct}%` : '--'}</p>
                </div>
            </div>

            <div>
                <p className="section-chip mb-4">{locale === 'ar' ? 'وصول سريع' : 'Quick Access'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Link href="/dashboard/member/progress" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.myProgress}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.bodyMetricsTrends}</p>
                            </div>
                            <Activity size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/member/plans" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.workoutPlans}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.viewPlansAndLog}</p>
                            </div>
                            <Dumbbell size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/member/diets" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.dietPlans}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.assignedNutrition}</p>
                            </div>
                            <Utensils size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/member/history" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.history}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.attendancePayments}</p>
                            </div>
                            <ClipboardList size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/member/achievements" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.achievements}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.badgesMilestones}</p>
                            </div>
                            <Trophy size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/member/feedback" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.myFeedback}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.shareFeedback}</p>
                            </div>
                            <MessageSquare size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.myQrCode}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.checkInAccess}</p>
                            </div>
                            <QrCode size={20} className="text-foreground" />
                        </div>
                    </Link>
                    <Link href="/dashboard/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-lg font-bold text-foreground font-mono">{customerTxt.myProfile}</p>
                                <p className="text-xs text-muted-foreground mt-1">{customerTxt.manageAccount}</p>
                            </div>
                            <UserCheck size={20} className="text-foreground" />
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ======================== MAIN DASHBOARD PAGE ========================

function localizeSubscriptionPlanName(planName: string | null | undefined, locale: string) {
    if (!planName) return '';
    const normalized = planName.trim().toLowerCase();
    const labels: Record<string, { en: string; ar: string }> = {
        daily: { en: 'Daily', ar: 'يومي' },
        weekly: { en: 'Weekly', ar: 'أسبوعي' },
        monthly: { en: 'Monthly', ar: 'شهري' },
        yearly: { en: 'Yearly', ar: 'سنوي' },
        annual: { en: 'Annual', ar: 'سنوي' },
    };
    const direct = labels[normalized];
    if (direct) return locale === 'ar' ? direct.ar : direct.en;
    return planName;
}

function CashierDashboard({ userName }: { userName: string }) {
    const { locale } = useLocale();
    const txt = locale === 'ar'
        ? {
            cashierPos: 'نقطة بيع الكاشير',
            myProfile: 'ملفي الشخصي',
            myLeaves: 'إجازاتي',
            workCheckIn: 'تسجيل حضور العمل',
        }
        : {
            cashierPos: 'Cashier POS',
            myProfile: 'My Profile',
            myLeaves: 'My Leaves',
            workCheckIn: 'Work Check-In',
        };
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{locale === 'ar' ? 'لوحة الكاشير' : 'Cashier Dashboard'}</h1>
                <p className="text-sm text-muted-foreground mt-1">{locale === 'ar' ? 'عمليات نقطة البيع لـ' : 'Point of sale operations for'} {userName}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dashboard/admin/pos" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.cashierPos}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'ابدأ وأكمل المبيعات' : 'Start and complete sales'}</p>
                        </div>
                        <DollarSign size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.myProfile}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'تفاصيل الحساب' : 'Account details'}</p>
                        </div>
                        <UserCheck size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/leaves" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.myLeaves}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'طلب وتتبع أيام الإجازة' : 'Request and track leave days'}</p>
                        </div>
                        <ClipboardList size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.workCheckIn}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'استخدم نفس مسار QR الخاص بالمدرب' : 'Use the same QR workflow as coach'}</p>
                        </div>
                        <QrCode size={20} className="text-foreground" />
                    </div>
                </Link>
            </div>
        </div>
    );
}

function ReceptionDashboard({ userName }: { userName: string }) {
    const { locale } = useLocale();
    const txt = locale === 'ar'
        ? {
            receptionRegistration: 'الاستقبال/التسجيل',
            myProfile: 'ملفي الشخصي',
            myLeaves: 'إجازاتي',
            workCheckIn: 'تسجيل حضور العمل',
        }
        : {
            receptionRegistration: 'Reception/Registration',
            myProfile: 'My Profile',
            myLeaves: 'My Leaves',
            workCheckIn: 'Work Check-In',
        };
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{locale === 'ar' ? 'لوحة الاستقبال' : 'Reception Dashboard'}</h1>
                <p className="text-sm text-muted-foreground mt-1">{locale === 'ar' ? 'عمليات التسجيل والأعضاء لـ' : 'Registration and member operations for'} {userName}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dashboard/admin/members" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.receptionRegistration}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'إنشاء وإدارة اشتراكات الأعضاء' : 'Create and manage member subscriptions'}</p>
                        </div>
                        <Users size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.myProfile}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'تفاصيل الحساب' : 'Account details'}</p>
                        </div>
                        <UserCheck size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/leaves" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.myLeaves}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'طلب وتتبع أيام الإجازة' : 'Request and track leave days'}</p>
                        </div>
                        <ClipboardList size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">{txt.workCheckIn}</p>
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'استخدم نفس مسار QR الخاص بالمدرب' : 'Use the same QR workflow as coach'}</p>
                        </div>
                        <QrCode size={20} className="text-foreground" />
                    </div>
                </Link>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();

    if (!user) return null;

    switch (user.role) {
        case 'ADMIN':
            return <AdminDashboard userName={user.full_name} />;
        case 'COACH':
            return <CoachDashboard userName={user.full_name} />;
        case 'CASHIER':
        case 'EMPLOYEE':
            return <CashierDashboard userName={user.full_name} />;
        case 'RECEPTION':
        case 'FRONT_DESK':
            return <ReceptionDashboard userName={user.full_name} />;
        case 'CUSTOMER':
        default:
            return (
                <CustomerDashboard
                    userName={user.full_name}
                    dateOfBirth={user.date_of_birth}
                    subscriptionEndDate={user.subscription_end_date}
                    subscriptionStatus={user.subscription_status}
                    subscriptionPlanName={user.subscription_plan_name}
                />
            );
    }
}




