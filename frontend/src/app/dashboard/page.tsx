'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Users, DollarSign, Clock, TrendingUp, QrCode, Dumbbell, Utensils, ChevronRight, MessageSquare, UserCheck, ClipboardList, Trophy, Activity, Flame, Medal, Sunrise, MoonStar, Star, Download } from 'lucide-react';
import {
    BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import Link from 'next/link';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DashboardGrid } from '@/components/DashboardGrid';
import { useFeedback } from '@/components/FeedbackProvider';
import MemberSearchSelect from '@/components/MemberSearchSelect';
import Modal from '@/components/Modal';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { Move } from 'lucide-react';

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
}

interface MemberSummary {
    id: string;
    full_name: string;
    email: string;
    date_of_birth?: string;
}

interface BiometricLogResponse {
    id: string;
    date: string;
    weight_kg?: number;
    height_cm?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
}

interface WorkoutSessionEntry {
    id: string;
    exercise_id?: string | null;
    exercise_name?: string | null;
    target_sets?: number | null;
    target_reps?: number | null;
    sets_completed: number;
    reps_completed: number;
    weight_kg?: number | null;
    notes?: string | null;
    order: number;
}

interface WorkoutSessionLog {
    id: string;
    member_id: string;
    plan_id: string;
    performed_at: string;
    duration_minutes?: number | null;
    notes?: string | null;
    entries: WorkoutSessionEntry[];
}

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

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

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

    const formatTime = (iso: string) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return 'Just now';
            if (diffMin < 60) return `${diffMin}m ago`;
            const diffHr = Math.floor(diffMin / 60);
            if (diffHr < 24) return `${diffHr}h ago`;
            return d.toLocaleDateString();
        } catch { return ''; }
    };

    const revenueChartData = useMemo<RevenueChartPoint[]>(() => {
        if (revenueViewMode === 'daily') {
            return revenueData.map((point) => {
                const date = new Date(point.date);
                const label = Number.isNaN(date.getTime())
                    ? point.date
                    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
                label: weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                revenue: point.revenue,
                expenses: point.expenses,
            });
        });

        return Array.from(weeklyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [revenueData, revenueViewMode]);

    const kpiCards = [
        { title: "Today's Visitors (Non-Live)", value: stats?.today_visitors ?? '--', subtitle: 'Unique granted entries today', icon: Activity, badge: 'badge-blue' },
        { title: "Today's Revenue", value: stats ? `${stats.todays_revenue.toFixed(2)} JOD` : '--', subtitle: 'Collected today', icon: DollarSign, badge: 'badge-green' },
        { title: 'Pending Salaries', value: stats ? `${stats.pending_salaries.toFixed(2)} JOD` : '--', subtitle: 'Owed this month', icon: Clock, badge: 'badge-amber' },
        { title: 'Low Stock Alerts', value: lowStockItems.length, subtitle: 'Products need order', icon: TrendingUp, badge: 'badge-destructive', isAlert: lowStockItems.length > 0 },
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
            a.download = 'daily_visitors_report.csv';
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:pr-28">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-1">Gym Operations Center • {userName}</p>
                </div>
                <div className="flex items-center gap-2 mt-1 md:mt-2">
                    <DateRangePicker date={dateRange} setDate={setDateRange} className="z-10" />
                </div>
            </div>

            <DashboardGrid layoutId="admin_dashboard_v1">
                {/* KPI Cards */}
                {kpiCards.map((card, i) => (
                    <div key={`stats-${i}`} className="kpi-card group h-full relative" data-grid={{ w: 3, h: 4, x: (i % 4) * 3, y: Math.floor(i / 4) * 4 }}>
                        <div className="absolute top-2 right-2 text-muted-foreground/30 cursor-move drag-handle opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <Move size={14} />
                        </div>
                        <div className="flex items-start justify-between h-full flex-col">
                            <div className="w-full flex justify-between items-start">
                                <div>
                                    <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">{card.title}</p>
                                    <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{card.value}</p>
                                </div>
                                <div className="p-2 border border-border bg-muted/50 mt-1">
                                    <card.icon size={18} className="text-foreground" />
                                </div>
                            </div>
                            <div className="mt-auto w-full pt-2 pb-2">
                                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                                {card.isAlert && (
                                    <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-destructive/20 w-full">
                                        <span className="h-2 w-2 bg-destructive animate-ping" />
                                        <span className="text-xs text-destructive font-bold uppercase tracking-wider">Attention</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Charts */}
                <div key="chart-visits" className="kpi-card p-6 h-full relative group">
                    <div className="absolute top-2 right-2 text-muted-foreground/30 cursor-move drag-handle opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Move size={14} />
                    </div>
                    <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mb-6">Visits by Hour (Last {selectedDays} Days)</h3>
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
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">NO DATA AVAILABLE</div>
                        )}
                    </div>
                </div>

                <div key="chart-revenue" className="kpi-card p-6 h-full relative group flex flex-col">
                    <div className="absolute top-2 right-2 text-muted-foreground/30 cursor-move drag-handle opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Move size={14} />
                    </div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Revenue vs. Expenses (Last {selectedDays} Days)</h3>
                        <div className="flex items-center gap-1 border border-border bg-muted/20 p-1">
                            <button
                                type="button"
                                onClick={() => setRevenueViewMode('daily')}
                                className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors ${revenueViewMode === 'daily' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Daily
                            </button>
                            <button
                                type="button"
                                onClick={() => setRevenueViewMode('weekly')}
                                className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors ${revenueViewMode === 'weekly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Weekly
                            </button>
                        </div>
                    </div>
                    <div className="mb-3 flex items-center gap-4 text-xs font-mono">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: revenueBarColor }} />
                            Revenue
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: expensesBarColor }} />
                            Expenses
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
                                        formatter={(value, name) => [`${Number(value ?? 0).toFixed(2)} JOD`, String(name)]}
                                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                    />
                                    <Bar dataKey="revenue" name="Revenue" fill={revenueBarColor} maxBarSize={22} radius={[2, 2, 0, 0]}>
                                        {revenueChartData.map((_, i) => (
                                            <Cell
                                                key={`rev-${i}`}
                                                fill={revenueBarColor}
                                                fillOpacity={hoveredRevenueIndex === null || hoveredRevenueIndex === i ? 1 : 0.35}
                                            />
                                        ))}
                                    </Bar>
                                    <Bar dataKey="expenses" name="Expenses" fill={expensesBarColor} maxBarSize={22} radius={[2, 2, 0, 0]}>
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
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">NO FINANCIAL DATA</div>
                        )}
                    </div>
                </div>

                {/* Recent Activity */}
                <div key="activity" className="kpi-card p-0 h-full relative group overflow-hidden flex flex-col">
                    <div className="absolute top-2 right-2 text-muted-foreground/30 cursor-move drag-handle opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Move size={14} />
                    </div>
                    <div className="p-4 border-b border-border flex-shrink-0">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Recent System Activity</h3>
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
                            <div className="p-8 text-center text-muted-foreground text-sm font-mono">No recent activity</div>
                        )}
                    </div>
                </div>
            </DashboardGrid>

            <div className="kpi-card p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Daily Visitor Report (Non-Live)</h3>
                    <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1" onClick={exportDailyVisitorsCsv}>
                        <Download size={14} />
                        Export CSV
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
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border">No visitor report data for selected range.</div>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[440px]">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Unique Visitors</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyVisitors.length > 0 ? (
                                dailyVisitors.map((row, i) => (
                                    <tr key={`${row.date || row.week_start}-${i}`}>
                                        <td className="font-mono text-xs text-muted-foreground">{row.date || row.week_start || '-'}</td>
                                        <td className="font-mono text-xs text-foreground">{row.unique_visitors}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={2} className="text-center py-4 text-muted-foreground text-sm">No rows</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ======================== COACH DASHBOARD ========================

function CoachDashboard({ userName }: { userName: string }) {
    const [plansCount, setPlansCount] = useState(0);
    const [dietsCount, setDietsCount] = useState(0);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [members, setMembers] = useState<MemberSummary[]>([]);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [memberBiometrics, setMemberBiometrics] = useState<BiometricLogResponse[]>([]);
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
            const membersData = membersRes.data.data || [];
            setPlans(plansData);
            setPlansCount(plansData.length);
            setDietsCount(dietsData.length);
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

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Coach Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1">Trainer Portal • {userName}</p>
            </div>

            {/* KPI Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="kpi-card group">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">Workout Plans</p>
                            <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{plansCount}</p>
                            <p className="text-xs text-muted-foreground mt-1">Plans created</p>
                        </div>
                        <div className="p-2 border border-border bg-muted/50">
                            <Dumbbell size={18} className="text-foreground" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card group">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">Diet Plans</p>
                            <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{dietsCount}</p>
                            <p className="text-xs text-muted-foreground mt-1">Nutrition programs</p>
                        </div>
                        <div className="p-2 border border-border bg-muted/50">
                            <Utensils size={18} className="text-foreground" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card group">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">Plan Adherence (7d)</p>
                            <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{planAdherence.rate}%</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {planAdherence.assigned > 0
                                    ? `${planAdherence.adherent}/${planAdherence.assigned} assigned clients completed workouts`
                                    : 'No assigned clients yet'}
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
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">Workout Plans</h3>
                            <p className="text-muted-foreground text-xs">Create & manage programs</p>
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
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">Diet Plans</h3>
                            <p className="text-muted-foreground text-xs">Manage nutrition</p>
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
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">Trainee Feedback</h3>
                            <p className="text-muted-foreground text-xs">Logs & ratings</p>
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
                            <h3 className="text-foreground font-bold text-sm uppercase tracking-wide">My QR Code</h3>
                            <p className="text-muted-foreground text-xs">Entrance access</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
            </div>

            {/* Recent Plans */}
            {plans.length > 0 ? (
                <div className="kpi-card p-0">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Recently Created Plans</h3>
                        <Link href="/dashboard/coach/plans" className="text-xs text-primary hover:text-primary/80 font-mono">VIEW ALL →</Link>
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
                    No recent plans yet.
                </div>
            )}

            <div className="kpi-card p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Client Progress Tracking</h3>
                        <p className="text-xs text-muted-foreground mt-1">Monitor member biometrics and progress trends</p>
                    </div>
                    <div className="w-full sm:w-72">
                        <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Client</label>
                        <MemberSearchSelect
                            members={members}
                            value={selectedMemberId}
                            onChange={setSelectedMemberId}
                            allowClear={false}
                            placeholder="Search client..."
                        />
                    </div>
                </div>

                {selectedMember ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Age</p>
                            <p className="text-lg font-bold text-foreground mt-1">{selectedMemberAge !== null ? selectedMemberAge : 'N/A'}</p>
                        </div>
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Height</p>
                            <p className="text-lg font-bold text-foreground mt-1">{latestMemberMetrics?.height_cm ? `${latestMemberMetrics.height_cm} cm` : 'N/A'}</p>
                        </div>
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Weight</p>
                            <p className="text-lg font-bold text-foreground mt-1">{latestMemberMetrics?.weight_kg ? `${latestMemberMetrics.weight_kg} kg` : 'N/A'}</p>
                        </div>
                        <div className="rounded-sm border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Body Fat</p>
                            <p className="text-lg font-bold text-foreground mt-1">{latestMemberMetrics?.body_fat_pct ? `${latestMemberMetrics.body_fat_pct}%` : 'N/A'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">No client selected.</div>
                )}

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
                                <Line type="monotone" dataKey="weight_kg" stroke="var(--primary)" strokeWidth={2} name="Weight (kg)" dot={{ r: 3, fill: 'var(--primary)' }} />
                                <Line type="monotone" dataKey="body_fat_pct" stroke="#f97316" strokeWidth={2} name="Body Fat (%)" dot={{ r: 3, fill: '#f97316' }} />
                                <Line type="monotone" dataKey="muscle_mass_kg" stroke="#22c55e" strokeWidth={2} name="Muscle Mass (kg)" dot={{ r: 3, fill: '#22c55e' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono border border-dashed border-border flex-col">
                            <Activity size={24} className="mb-2 opacity-50" />
                            <span>NO BIOMETRIC DATA FOR THIS CLIENT</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ======================== CUSTOMER DASHBOARD ========================

interface GamificationStats {
    total_visits: number;
    streak: {
        current_streak: number;
        best_streak: number;
        last_visit_date: string | null;
    };
    badges: {
        id: string;
        badge_type: string;
        badge_name: string;
        badge_description: string;
        earned_at: string;
    }[];
    weekly_progress?: {
        current: number;
        goal: number;
    };
}

function CustomerDashboard({ userName, dateOfBirth }: { userName: string; dateOfBirth?: string }) {
    const { showToast } = useFeedback();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [diets, setDiets] = useState<Diet[]>([]);
    const [stats, setStats] = useState<GamificationStats | null>(null);
    const [workoutStats, setWorkoutStats] = useState<{ date: string, workouts: number }[]>([]);
    const [sessionLogs, setSessionLogs] = useState<WorkoutSessionLog[]>([]);
    const [biometrics, setBiometrics] = useState<BiometricLogResponse[]>([]);
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [muscleMass, setMuscleMass] = useState('');
    const [sessionModalPlan, setSessionModalPlan] = useState<Plan | null>(null);
    const [sessionDuration, setSessionDuration] = useState('');
    const [sessionNotes, setSessionNotes] = useState('');
    const [trendRangeDays, setTrendRangeDays] = useState<7 | 30 | 90>(30);
    const [sessionEntries, setSessionEntries] = useState<Array<{
        exercise_id?: string;
        exercise_name: string;
        target_sets?: number;
        target_reps?: number;
        sets_completed: number;
        reps_completed: number;
        weight_kg: string;
    }>>([]);
    const [loggingSession, setLoggingSession] = useState(false);
    const [loggingBiometrics, setLoggingBiometrics] = useState(false);
    const [loading, setLoading] = useState(true);

    const getBadgeSticker = (badgeType: string) => {
        if (badgeType.startsWith('STREAK')) return <Flame size={20} className="text-orange-400" />;
        if (badgeType.startsWith('VISITS')) return <Medal size={20} className="text-yellow-400" />;
        if (badgeType === 'EARLY_BIRD') return <Sunrise size={20} className="text-amber-300" />;
        if (badgeType === 'NIGHT_OWL') return <MoonStar size={20} className="text-sky-300" />;
        return <Star size={20} className="text-primary" />;
    };

    const rangeStart = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - trendRangeDays + 1);
        return start;
    }, [trendRangeDays]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [plansRes, dietsRes, statsRes, workoutStatsRes, bioRes, sessionRes] = await Promise.all([
                    api.get('/fitness/plans').catch(() => ({ data: { data: [] } })),
                    api.get('/fitness/diets').catch(() => ({ data: { data: [] } })),
                    api.get('/gamification/stats').catch(() => ({ data: { data: null } })),
                    api.get('/fitness/stats').catch(() => ({ data: { data: [] } })),
                    api.get('/fitness/biometrics').catch(() => ({ data: { data: [] } })),
                    api.get('/fitness/session-logs/me').catch(() => ({ data: { data: [] } })),
                ]);
                setPlans(plansRes.data.data || []);
                setDiets(dietsRes.data.data || []);
                setStats(statsRes.data.data);
                setWorkoutStats(workoutStatsRes.data.data || []);
                const bioData = bioRes.data.data || [];
                setSessionLogs(sessionRes.data.data || []);
                setBiometrics(bioData);
                if (bioData.length > 0) {
                    const latest = bioData[bioData.length - 1];
                    setHeight(latest.height_cm?.toString() ?? '');
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        loadData();
    }, []);

    const handleLogBiometrics = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoggingBiometrics(true);
        try {
            await api.post('/fitness/biometrics', {
                weight_kg: weight ? parseFloat(weight) : null,
                height_cm: height ? parseFloat(height) : null,
                body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
                muscle_mass_kg: muscleMass ? parseFloat(muscleMass) : null,
            });
            const res = await api.get('/fitness/biometrics');
            const bioData = res.data.data || [];
            setBiometrics(bioData);
            if (bioData.length > 0) {
                const latest = bioData[bioData.length - 1];
                setHeight(latest.height_cm?.toString() ?? '');
            }
            setWeight('');
            setBodyFat('');
            setMuscleMass('');
        } catch (err) {
            console.error('Failed to log biometrics', err);
            showToast('Failed to log biometrics.', 'error');
        } finally {
            setLoggingBiometrics(false);
        }
    };

    const openSessionLogger = (plan: Plan) => {
        const baseEntries = (plan.exercises || []).map((exercise, index) => ({
            exercise_id: exercise.exercise_id,
            exercise_name: exercise.exercise_name || exercise.exercise?.name || exercise.name || `Exercise ${index + 1}`,
            target_sets: exercise.sets || 0,
            target_reps: exercise.reps || 0,
            sets_completed: exercise.sets || 0,
            reps_completed: exercise.reps || 0,
            weight_kg: '',
        }));
        setSessionModalPlan(plan);
        setSessionEntries(baseEntries.length > 0 ? baseEntries : [{
            exercise_name: 'Exercise 1',
            sets_completed: 0,
            reps_completed: 0,
            weight_kg: '',
        }]);
        setSessionDuration('');
        setSessionNotes('');
    };

    const updateSessionEntry = (
        index: number,
        field: 'sets_completed' | 'reps_completed' | 'weight_kg',
        value: string
    ) => {
        setSessionEntries((prev) => prev.map((entry, idx) => {
            if (idx !== index) return entry;
            if (field === 'weight_kg') return { ...entry, weight_kg: value };
            return { ...entry, [field]: Number(value) || 0 };
        }));
    };

    const handleLogSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sessionModalPlan) return;
        setLoggingSession(true);
        try {
            await api.post('/fitness/session-logs', {
                plan_id: sessionModalPlan.id,
                duration_minutes: sessionDuration ? Number(sessionDuration) : undefined,
                notes: sessionNotes || undefined,
                entries: sessionEntries.map((entry, index) => ({
                    exercise_id: entry.exercise_id || undefined,
                    exercise_name: entry.exercise_name,
                    target_sets: entry.target_sets ?? undefined,
                    target_reps: entry.target_reps ?? undefined,
                    sets_completed: entry.sets_completed,
                    reps_completed: entry.reps_completed,
                    weight_kg: entry.weight_kg ? Number(entry.weight_kg) : undefined,
                    order: index,
                })),
            });

            const [sessionRes, workoutStatsRes] = await Promise.all([
                api.get('/fitness/session-logs/me').catch(() => ({ data: { data: [] } })),
                api.get('/fitness/stats').catch(() => ({ data: { data: [] } })),
            ]);
            setSessionLogs(sessionRes.data.data || []);
            setWorkoutStats(workoutStatsRes.data.data || []);
            setSessionModalPlan(null);
            showToast('Workout session logged successfully.', 'success');
        } catch (err) {
            console.error('Failed to log workout session', err);
            showToast(getApiErrorMessage(err, 'Failed to log workout session.'), 'error');
        } finally {
            setLoggingSession(false);
        }
    };

    const filteredBiometrics = useMemo(() => {
        return biometrics.filter((item) => new Date(item.date) >= rangeStart);
    }, [biometrics, rangeStart]);

    const filteredSessionLogs = useMemo(() => {
        return sessionLogs.filter((session) => new Date(session.performed_at) >= rangeStart);
    }, [sessionLogs, rangeStart]);

    const buildMetricSeries = useCallback(
        (metric: keyof Pick<BiometricLogResponse, 'weight_kg' | 'body_fat_pct' | 'muscle_mass_kg'>) => {
            const sorted = [...filteredBiometrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            return sorted
                .filter((point) => typeof point[metric] === 'number')
                .map((point, index, arr) => {
                    const value = Number(point[metric] || 0);
                    const prev = index > 0 ? Number(arr[index - 1][metric] || 0) : null;
                    return {
                        date: point.date,
                        value,
                        delta: prev === null ? null : value - prev,
                    };
                });
        },
        [filteredBiometrics]
    );

    const weightSeries = useMemo(() => buildMetricSeries('weight_kg'), [buildMetricSeries]);
    const bodyFatSeries = useMemo(() => buildMetricSeries('body_fat_pct'), [buildMetricSeries]);
    const muscleSeries = useMemo(() => buildMetricSeries('muscle_mass_kg'), [buildMetricSeries]);

    const sessionVolumeSeries = useMemo(() => {
        const map = new Map<string, { date: string; volume: number; sessions: number }>();
        filteredSessionLogs.forEach((session) => {
            const key = new Date(session.performed_at).toISOString().split('T')[0];
            const volume = (session.entries || []).reduce((sum, entry) => {
                const weight = entry.weight_kg || 0;
                return sum + (entry.sets_completed * entry.reps_completed * weight);
            }, 0);
            const existing = map.get(key);
            if (existing) {
                existing.volume += volume;
                existing.sessions += 1;
            } else {
                map.set(key, { date: key, volume, sessions: 1 });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
    }, [filteredSessionLogs]);

    const exercisePrTable = useMemo(() => {
        const byExercise = new Map<string, { bestWeight: number; bestWeightReps: number; bestReps: number; bestRepsWeight: number }>();
        filteredSessionLogs.forEach((session) => {
            session.entries.forEach((entry) => {
                const name = (entry.exercise_name || 'Exercise').trim();
                const weight = Number(entry.weight_kg || 0);
                const reps = Number(entry.reps_completed || 0);
                const existing = byExercise.get(name);
                if (!existing) {
                    byExercise.set(name, {
                        bestWeight: weight,
                        bestWeightReps: reps,
                        bestReps: reps,
                        bestRepsWeight: weight,
                    });
                    return;
                }
                if (weight > existing.bestWeight || (weight === existing.bestWeight && reps > existing.bestWeightReps)) {
                    existing.bestWeight = weight;
                    existing.bestWeightReps = reps;
                }
                if (reps > existing.bestReps || (reps === existing.bestReps && weight > existing.bestRepsWeight)) {
                    existing.bestReps = reps;
                    existing.bestRepsWeight = weight;
                }
            });
        });

        return Array.from(byExercise.entries())
            .map(([exercise, record]) => ({ exercise, ...record }))
            .sort((a, b) => b.bestWeight - a.bestWeight)
            .slice(0, 12);
    }, [filteredSessionLogs]);

    const recentFilteredSessionLogs = useMemo(() => filteredSessionLogs.slice(0, 3), [filteredSessionLogs]);

    function MetricTooltipContent({
        active,
        payload,
        label,
        unit,
        metricLabel,
    }: {
        active?: boolean;
        payload?: ReadonlyArray<{ payload: { value: number; delta: number | null } }>;
        label?: string | number;
        unit: string;
        metricLabel: string;
    }) {
        if (!active || !payload || payload.length === 0) return null;
        const point = payload[0].payload;
        const delta = point.delta;
        const deltaText = delta === null ? 'First log in range' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${unit} vs previous`;
        const deltaClass = delta === null ? 'text-muted-foreground' : delta >= 0 ? 'text-emerald-400' : 'text-orange-400';
        const parsedLabel = typeof label === 'string' ? label : String(label ?? '');

        return (
            <div className="border border-border bg-card px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">{new Date(parsedLabel).toLocaleDateString()}</p>
                <p className="text-foreground mt-1">{metricLabel}: {point.value.toFixed(1)} {unit}</p>
                <p className={`mt-1 ${deltaClass}`}>{deltaText}</p>
            </div>
        );
    }

    const sevenDaysAgo = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 6);
        return d;
    }, []);
    const sessionsThisWeek = useMemo(
        () => sessionLogs.filter((session) => new Date(session.performed_at) >= sevenDaysAgo).length,
        [sessionLogs, sevenDaysAgo]
    );
    const lastLoggedSession = useMemo(() => {
        if (sessionLogs.length === 0) return null;
        return [...sessionLogs].sort(
            (a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
        )[0];
    }, [sessionLogs]);
    const lastLoggedPlanName = useMemo(
        () => plans.find((plan) => plan.id === lastLoggedSession?.plan_id)?.name || 'Workout Plan',
        [plans, lastLoggedSession?.plan_id]
    );
    const focusPlan = useMemo(() => {
        if (lastLoggedSession) {
            const matched = plans.find((plan) => plan.id === lastLoggedSession.plan_id);
            if (matched) return matched;
        }
        return plans[0] || null;
    }, [plans, lastLoggedSession]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
    );

    const weeklyProgress = stats?.weekly_progress?.current || 0;
    const weeklyGoal = stats?.weekly_progress?.goal || 3;
    const progressPercent = Math.min(100, (weeklyProgress / weeklyGoal) * 100);
    const latestBio = biometrics.length > 0 ? biometrics[biometrics.length - 1] : null;
    const age = calculateAge(dateOfBirth);

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Welcome, {userName}</h1>
                    <p className="text-sm text-muted-foreground mt-1">Your Fitness Journey</p>
                </div>
                {stats?.streak && stats.streak.current_streak > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                        <span className="text-orange-500">Streak</span>
                        <span className="text-sm font-bold text-orange-500">{stats.streak.current_streak} Day Streak!</span>
                    </div>
                )}
            </div>

            {/* Weekly Goal Widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Weekly Progress Card */}
                    <div className="kpi-card relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex flex-col justify-between h-full relative z-10">
                            <div>
                                <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-sm font-extrabold text-orange-500 uppercase tracking-wider mb-2">Weekly Goal</h3>
                                <div className="flex items-end gap-2 mb-1">
                                    <span className="text-3xl font-bold text-foreground">{weeklyProgress}</span>
                                    <span className="text-sm text-muted-foreground mb-1.5">/ {weeklyGoal} visits</span>
                                </div>
                            </div>
                            <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden mt-3">
                                <div
                                    className="bg-primary h-full transition-all duration-1000 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                                {progressPercent >= 100 ? "Goal reached! Amazing work!" : "Keep it up, you're doing great!"}
                            </p>
                        </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="kpi-card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">Total Visits</p>
                                <p className="text-2xl font-bold text-foreground mt-2 font-mono">{stats?.total_visits || 0}</p>
                            </div>
                            <div className="p-2 border border-border bg-muted/50 rounded-sm">
                                <UserCheck size={18} className="text-foreground" />
                            </div>
                        </div>
                    </div>

                    <div className="kpi-card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-extrabold text-orange-500 uppercase tracking-wider font-mono">Badges Earned</p>
                                <p className="text-2xl font-bold text-foreground mt-2 font-mono">{stats?.badges.length || 0}</p>
                            </div>
                            <div className="p-2 border border-border bg-muted/50 rounded-sm">
                                <Trophy size={18} className="text-foreground" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Badges / Quick Links */}
                <div className="col-span-1 space-y-4">
                    <div className="kpi-card p-4">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-sm font-extrabold text-orange-500 uppercase tracking-wider mb-3">Recent Badges</h3>
                        {stats?.badges && stats.badges.length > 0 ? (
                            <div className="space-y-3">
                                {stats.badges.slice(0, 3).map(badge => (
                                    <div key={badge.id} className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                                            {getBadgeSticker(badge.badge_type)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{badge.badge_name}</p>
                                            <p className="text-[10px] text-muted-foreground">{new Date(badge.earned_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground italic">No badges yet. Keep training!</p>
                        )}
                        <Link href="/dashboard/member/achievements" className="block mt-3 text-xs text-primary hover:underline text-center">View All Achievements →</Link>
                    </div>
                </div>
            </div>

            {/* Progress & Biometrics */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                <div className="space-y-6 xl:col-span-2">
                    <div className="kpi-card p-5">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mb-3">Workout Consistency (Last 30 Days)</h3>
                        <div className="h-44">
                            {workoutStats.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                                    <BarChart data={workoutStats}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => {
                                                const d = new Date(val);
                                                return `${d.getMonth() + 1}/${d.getDate()}`;
                                            }}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'var(--muted)' }}
                                            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                            labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
                                        />
                                        <Bar dataKey="workouts" fill="var(--primary)" barSize={16} name="Workouts Logged" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono border border-dashed border-border flex-col">
                                    <Activity size={24} className="mb-2 opacity-50" />
                                    <span>NO WORKOUT DATA</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="kpi-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Body Progress Tracking</h3>
                            <div className="flex items-center gap-1">
                                {[7, 30, 90].map((days) => (
                                    <button
                                        key={days}
                                        type="button"
                                        onClick={() => setTrendRangeDays(days as 7 | 30 | 90)}
                                        className={`px-2 py-1 text-[10px] font-bold border rounded-sm ${trendRangeDays === days ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {days}d
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {[
                                { title: 'Weight', unit: 'kg', series: weightSeries, color: 'var(--primary)' },
                                { title: 'Body Fat', unit: '%', series: bodyFatSeries, color: '#f97316' },
                                { title: 'Muscle Mass', unit: 'kg', series: muscleSeries, color: '#22c55e' },
                            ].map((metric) => (
                                <div key={metric.title} className="rounded-sm border border-border bg-muted/10 p-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{metric.title}</p>
                                        <p className="text-xs font-mono text-foreground">
                                            {metric.series.length > 0 ? `${metric.series[metric.series.length - 1].value.toFixed(1)} ${metric.unit}` : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="h-24">
                                        {metric.series.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                                                <LineChart data={metric.series}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                    <XAxis
                                                        dataKey="date"
                                                        tickFormatter={(val) => {
                                                            const d = new Date(val);
                                                            return `${d.getMonth() + 1}/${d.getDate()}`;
                                                        }}
                                                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                                    <Tooltip content={<MetricTooltipContent unit={metric.unit} metricLabel={metric.title} />} />
                                                    <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2} dot={{ r: 2, fill: metric.color }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground font-mono">
                                                No data in selected range
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="kpi-card p-4">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Age</p>
                            <p className="text-xl font-bold text-foreground mt-1">{age !== null ? age : 'N/A'}</p>
                        </div>
                        <div className="kpi-card p-4">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Height</p>
                            <p className="text-xl font-bold text-foreground mt-1">{latestBio?.height_cm ? `${latestBio.height_cm} cm` : 'N/A'}</p>
                        </div>
                        <div className="kpi-card p-4">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Weight</p>
                            <p className="text-xl font-bold text-foreground mt-1">{latestBio?.weight_kg ? `${latestBio.weight_kg} kg` : 'N/A'}</p>
                        </div>
                    </div>
                    <div className="kpi-card p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Today&apos;s Focus</h3>
                            <Dumbbell size={16} className="text-primary" />
                        </div>
                        <div className="space-y-2 mb-3">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground uppercase tracking-wider">Sessions This Week</span>
                                <span className="font-mono font-bold text-foreground">{sessionsThisWeek}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground uppercase tracking-wider">Last Workout</span>
                                <span className="font-mono text-foreground">
                                    {lastLoggedSession
                                        ? `${new Date(lastLoggedSession.performed_at).toLocaleDateString()} • ${lastLoggedPlanName}`
                                        : 'No logs yet'}
                                </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                                Goal progress: {weeklyProgress}/{weeklyGoal} this week
                            </div>
                            <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn-primary w-full"
                            disabled={!focusPlan}
                            onClick={() => {
                                if (focusPlan) openSessionLogger(focusPlan);
                            }}
                        >
                            Log Session
                        </button>
                    </div>

                    <div className="kpi-card p-4">
                        <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mb-3">Quick Body Log</h3>
                        <form onSubmit={handleLogBiometrics} className="grid grid-cols-2 gap-2 items-end">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Height (cm)</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 175" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Weight (kg)</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 75" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Body Fat (%)</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={bodyFat} onChange={e => setBodyFat(e.target.value)} placeholder="e.g. 15" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Muscle (kg)</label>
                                <input type="number" step="0.1" className="input-dark py-1.5 text-sm" value={muscleMass} onChange={e => setMuscleMass(e.target.value)} placeholder="e.g. 32" />
                            </div>
                            <button type="submit" disabled={loggingBiometrics || (!height && !weight && !bodyFat && !muscleMass)} className="btn-primary py-1.5 px-4 text-sm whitespace-nowrap col-span-2">
                                {loggingBiometrics ? 'Saving...' : 'Log'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <div className="kpi-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Session Load Tracking ({trendRangeDays}d)</h3>
                    <p className="text-xs text-muted-foreground font-mono">{filteredSessionLogs.length} sessions logged</p>
                </div>
                <div className="h-40">
                    {sessionVolumeSeries.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                            <LineChart data={sessionVolumeSeries}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(val) => {
                                        const d = new Date(val);
                                        return `${d.getMonth() + 1}/${d.getDate()}`;
                                    }}
                                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                    labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
                                />
                                <Line type="monotone" dataKey="volume" stroke="var(--primary)" strokeWidth={2} name="Volume (kg)" dot={{ r: 2, fill: 'var(--primary)' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-mono border border-dashed border-border">
                            No session volume data yet.
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <h4 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-sm font-extrabold text-orange-500 uppercase tracking-wider">Recent Sessions</h4>
                    {recentFilteredSessionLogs.length > 0 ? (
                        recentFilteredSessionLogs.map((session) => {
                            const planName = plans.find((plan) => plan.id === session.plan_id)?.name || 'Workout Plan';
                            const totalVolume = (session.entries || []).reduce((sum, entry) => {
                                const weight = entry.weight_kg || 0;
                                return sum + (entry.sets_completed * entry.reps_completed * weight);
                            }, 0);
                            return (
                                <div key={session.id} className="rounded-sm border border-border bg-muted/10 p-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{planName}</p>
                                        <p className="text-xs text-muted-foreground">{new Date(session.performed_at).toLocaleDateString()} • {session.entries.length} exercises</p>
                                    </div>
                                    <p className="text-xs font-mono text-muted-foreground">{Math.round(totalVolume)} kg vol</p>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-sm text-muted-foreground">No session logs in selected range. Use &quot;Log Session&quot; on a workout plan.</p>
                    )}
                </div>
            </div>

                <div className="kpi-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono">Exercise PR Table ({trendRangeDays}d)</h3>
                    <p className="text-xs text-muted-foreground font-mono">{exercisePrTable.length} exercises</p>
                </div>
                {exercisePrTable.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left table-dark min-w-[520px]">
                            <thead>
                                <tr>
                                    <th>Exercise</th>
                                    <th>Best Weight</th>
                                    <th>Best Reps</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exercisePrTable.map((row) => (
                                    <tr key={row.exercise}>
                                        <td className="font-medium text-foreground">{row.exercise}</td>
                                        <td className="text-muted-foreground font-mono">
                                            {row.bestWeight > 0 ? `${row.bestWeight.toFixed(1)} kg x ${row.bestWeightReps}` : '-'}
                                        </td>
                                        <td className="text-muted-foreground font-mono">
                                            {row.bestReps} reps @ {row.bestRepsWeight.toFixed(1)} kg
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="h-24 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border">
                        No PR data in selected range yet.
                    </div>
                )}
            </div>

            {/* Quick Access Cards */}
            <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mt-8">Quick Access</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">My QR Code</p>
                            <p className="text-xs text-muted-foreground mt-1">Tap to view</p>
                        </div>
                        <QrCode size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">My Profile</p>
                            <p className="text-xs text-muted-foreground mt-1">Manage Account</p>
                        </div>
                        <UserCheck size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/member/history" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">History</p>
                            <p className="text-xs text-muted-foreground mt-1">Logs & Payments</p>
                        </div>
                        <ClipboardList size={20} className="text-foreground" />
                    </div>
                </Link>
            </div>

            {/* Workout Plans */}
            <div className="kpi-card p-6">
                <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mb-4">My Workout Plans</h3>
                {plans.length > 0 ? (
                    <div className="space-y-3">
                        {plans.map((plan: Plan) => (
                            <div key={plan.id} className="p-4 border border-border bg-muted/10 hover:border-primary transition-colors">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-muted/30 border border-border text-primary">
                                            <Dumbbell size={16} />
                                        </div>
                                        <div>
                                            <h4 className="text-foreground font-bold text-sm uppercase">{plan.name}</h4>
                                            <p className="text-muted-foreground text-xs">{plan.description || 'No description'}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 font-mono">
                                        {plan.exercises?.length || 0} exercises
                                    </span>
                                </div>
                                <div className="ml-11 mb-2">
                                    <button
                                        type="button"
                                        className="btn-primary !py-1 !px-3 text-xs"
                                        onClick={() => openSessionLogger(plan)}
                                    >
                                        Log Session
                                    </button>
                                </div>
                                {plan.exercises && plan.exercises.length > 0 && (
                                    <div className="ml-11 space-y-1 mt-2 border-l border-border pl-3">
                                        {plan.exercises.slice(0, 4).map((ex, i: number) => (
                                            <div key={i} className="flex justify-between text-xs py-0.5">
                                                <span className="text-muted-foreground">{ex.exercise?.name || ex.name || `Exercise ${i + 1}`}</span>
                                                <span className="text-muted-foreground font-mono">{ex.sets}x{ex.reps}</span>
                                            </div>
                                        ))}
                                        {plan.exercises.length > 4 && (
                                            <p className="text-xs text-primary font-mono pt-1">+{plan.exercises.length - 4} MORE</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                        <Dumbbell size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">No workout plans assigned yet.</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">Your coach will assign plans to you</p>
                    </div>
                )}
            </div>

            {/* Diet Plans */}
            <div className="kpi-card p-6">
                <h3 className="inline-flex rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-base font-extrabold text-orange-500 uppercase tracking-wider font-mono mb-4">My Diet Plans</h3>
                {diets.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {diets.map((diet: Diet) => (
                            <div key={diet.id} className="p-4 border border-border bg-muted/10 hover:border-primary transition-colors">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-muted/30 border border-border text-primary">
                                        <Utensils size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-foreground font-bold text-sm uppercase">{diet.name}</h4>
                                        <p className="text-muted-foreground text-xs">{diet.description || 'No description'}</p>
                                    </div>
                                </div>
                                <div className="bg-muted/20 p-3 text-xs text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">
                                    {diet.content}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                        <Utensils size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">No diet plans assigned yet.</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">Your coach will create a nutrition program for you</p>
                    </div>
                )}
            </div>

            <Modal
                isOpen={!!sessionModalPlan}
                onClose={() => setSessionModalPlan(null)}
                title={sessionModalPlan ? `Log Session: ${sessionModalPlan.name}` : 'Log Session'}
            >
                {sessionModalPlan && (
                    <form onSubmit={handleLogSession} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Duration (minutes)</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="input-dark"
                                    value={sessionDuration}
                                    onChange={(e) => setSessionDuration(e.target.value)}
                                    placeholder="e.g. 60"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Session Notes</label>
                                <input
                                    type="text"
                                    className="input-dark"
                                    value={sessionNotes}
                                    onChange={(e) => setSessionNotes(e.target.value)}
                                    placeholder="How did it go?"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                            {sessionEntries.map((entry, idx) => (
                                <div key={`${entry.exercise_name}-${idx}`} className="rounded-sm border border-border bg-muted/10 p-3 space-y-2">
                                    <p className="text-sm font-semibold text-foreground">{entry.exercise_name}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Sets</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.sets_completed}
                                                onChange={(e) => updateSessionEntry(idx, 'sets_completed', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Reps</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.reps_completed}
                                                onChange={(e) => updateSessionEntry(idx, 'reps_completed', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Weight (kg)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.5"
                                                className="input-dark py-1.5 text-sm"
                                                value={entry.weight_kg}
                                                onChange={(e) => updateSessionEntry(idx, 'weight_kg', e.target.value)}
                                                placeholder="Optional"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end gap-3 pt-2 border-t border-border">
                            <button type="button" className="btn-ghost" onClick={() => setSessionModalPlan(null)} disabled={loggingSession}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={loggingSession}>
                                {loggingSession ? 'Saving...' : 'Save Session'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}

// ======================== MAIN DASHBOARD PAGE ========================

function CashierDashboard({ userName }: { userName: string }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Cashier Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1">Point of sale operations for {userName}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dashboard/admin/pos" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">Cashier POS</p>
                            <p className="text-xs text-muted-foreground mt-1">Start and complete sales</p>
                        </div>
                        <DollarSign size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">My Profile</p>
                            <p className="text-xs text-muted-foreground mt-1">Account details</p>
                        </div>
                        <UserCheck size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/leaves" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">My Leaves</p>
                            <p className="text-xs text-muted-foreground mt-1">Request and track leave days</p>
                        </div>
                        <ClipboardList size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">Work Check-In</p>
                            <p className="text-xs text-muted-foreground mt-1">Use the same QR workflow as coach</p>
                        </div>
                        <QrCode size={20} className="text-foreground" />
                    </div>
                </Link>
            </div>
        </div>
    );
}

function ReceptionDashboard({ userName }: { userName: string }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Reception Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1">Registration and member operations for {userName}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dashboard/admin/members" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">Reception/Registration</p>
                            <p className="text-xs text-muted-foreground mt-1">Create and manage member subscriptions</p>
                        </div>
                        <Users size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">My Profile</p>
                            <p className="text-xs text-muted-foreground mt-1">Account details</p>
                        </div>
                        <UserCheck size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/leaves" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">My Leaves</p>
                            <p className="text-xs text-muted-foreground mt-1">Request and track leave days</p>
                        </div>
                        <ClipboardList size={20} className="text-foreground" />
                    </div>
                </Link>
                <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-lg font-bold text-foreground font-mono">Work Check-In</p>
                            <p className="text-xs text-muted-foreground mt-1">Use the same QR workflow as coach</p>
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
            return <CustomerDashboard userName={user.full_name} dateOfBirth={user.date_of_birth} />;
    }
}

