'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState, useCallback } from 'react';
import { Users, DollarSign, Clock, TrendingUp, QrCode, Dumbbell, Utensils, ChevronRight, MessageSquare, UserCheck, ClipboardList, Trophy } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import Link from 'next/link';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DashboardGrid } from '@/components/DashboardGrid';
import { DateRange } from 'react-day-picker';
import { subDays } from 'date-fns';
import { Move } from 'lucide-react';

// ======================== ADMIN DASHBOARD ========================

interface DashboardStats {
    live_headcount: number;
    todays_revenue: number;
    active_members: number;
    monthly_revenue: number;
    monthly_expenses: number;
    pending_salaries: number;
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
    exercises?: {
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


interface AttendanceData {
    hour: string;
    visits: number;
}

interface RevenueData {
    date: string;
    revenue: number;
    expenses: number;
}

function AdminDashboard({ userName }: { userName: string }) {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });

    const fetchData = useCallback(() => {
        const from = dateRange?.from ? dateRange.from.toISOString().split('T')[0] : '';
        const to = dateRange?.to ? dateRange.to.toISOString().split('T')[0] : '';
        const dateQuery = from && to ? `?from=${from}&to=${to}` : '';

        // API calls (mocking query implementation on backend for now if not ready)
        // Ideally backend should accept date range params
        api.get('/analytics/dashboard' + dateQuery)
            .then(res => setStats(res.data.data))
            .catch(err => console.error("Failed to fetch dashboard stats", err));

        api.get('/analytics/attendance?days=7') // Keeping this fixed for now as it's hourly
            .then(res => setAttendanceData(res.data.data || []))
            .catch(() => { });

        // Use date range for revenue chart query if applicable on backend
        // For now requesting 30 days as default or based on selection logic if implemented
        api.get('/analytics/revenue-chart?days=30')
            .then(res => setRevenueData(res.data.data || []))
            .catch(() => { });

        api.get('/analytics/recent-activity')
            .then(res => setRecentActivity(res.data.data || []))
            .catch(() => setRecentActivity([]));
    }, [dateRange]);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange]);

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

    const kpiCards = [
        { title: 'Live Headcount', value: stats?.live_headcount ?? '--', subtitle: 'Currently in the gym', icon: Users, badge: 'badge-blue', live: true },
        { title: "Today's Revenue", value: stats ? `${stats.todays_revenue.toFixed(2)} JOD` : '--', subtitle: 'Collected today', icon: DollarSign, badge: 'badge-green' },
        { title: 'Pending Salaries', value: stats ? `${stats.pending_salaries.toFixed(2)} JOD` : '--', subtitle: 'Owed this month', icon: Clock, badge: 'badge-amber' },
        { title: 'Active Members', value: stats?.active_members ?? '--', subtitle: 'Active subscriptions', icon: TrendingUp, badge: 'badge-orange' },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-1">Gym Operations Center • {userName}</p>
                </div>
                <div className="flex items-center gap-2">
                    <DateRangePicker date={dateRange} setDate={setDateRange} className="z-10" />
                </div>
            </div>

            <DashboardGrid layoutId="admin_dashboard_v1">
                {/* KPI Cards */}
                {kpiCards.map((card, i) => (
                    <div key={`stats-${i}`} className="kpi-card group h-full relative" data-grid={{ w: 3, h: 4, x: i * 3, y: 0 }}>
                        <div className="absolute top-2 right-2 text-muted-foreground/30 cursor-move drag-handle opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <Move size={14} />
                        </div>
                        <div className="flex items-start justify-between h-full flex-col">
                            <div className="w-full flex justify-between items-start">
                                <div>
                                    <p className="text-[0.65rem] font-bold text-muted-foreground uppercase tracking-wider font-mono">{card.title}</p>
                                    <p className="text-3xl font-bold text-foreground mt-2 font-mono tracking-tighter">{card.value}</p>
                                </div>
                                <div className="p-2 border border-border bg-muted/50 mt-1">
                                    <card.icon size={18} className="text-foreground" />
                                </div>
                            </div>
                            <div className="mt-auto w-full pt-2">
                                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                                {card.live && (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border w-full">
                                        <span className="h-2 w-2 bg-primary animate-pulse" />
                                        <span className="text-xs text-primary font-bold uppercase tracking-wider">Live</span>
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
                    <h3 className="text-sm font-bold text-muted-foreground mb-6 uppercase tracking-wider font-mono">Visits by Hour (Last 7 Days)</h3>
                    <div className="h-[calc(100%-2rem)]">
                        {attendanceData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
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

                <div key="chart-revenue" className="kpi-card p-6 h-full relative group">
                    <div className="absolute top-2 right-2 text-muted-foreground/30 cursor-move drag-handle opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Move size={14} />
                    </div>
                    <h3 className="text-sm font-bold text-muted-foreground mb-6 uppercase tracking-wider font-mono">Revenue vs. Expenses (30 Days)</h3>
                    <div className="h-[calc(100%-2rem)]">
                        {revenueData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={revenueData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0px', fontSize: '0.8rem', color: 'var(--foreground)' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }} />
                                    <Line type="step" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--primary)' }} />
                                    <Line type="step" dataKey="expenses" stroke="var(--destructive)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--destructive)' }} />
                                </LineChart>
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
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono">Recent System Activity</h3>
                    </div>
                    <div className="divide-y divide-border overflow-y-auto flex-1">
                        {recentActivity.length > 0 ? (
                            recentActivity.map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'CHECK_IN' ? 'bg-emerald-500' :
                                        item.type === 'SALE' ? 'bg-blue-500' :
                                            item.type === 'ALERT' ? 'bg-amber-500' : 'bg-gray-500'
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
        </div>
    );
}

// ======================== COACH DASHBOARD ========================

function CoachDashboard({ userName }: { userName: string }) {
    const [plansCount, setPlansCount] = useState(0);
    const [dietsCount, setDietsCount] = useState(0);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get('/fitness/plans').catch(() => ({ data: { data: [] } })),
            api.get('/fitness/diets').catch(() => ({ data: { data: [] } })),
        ]).then(([plansRes, dietsRes]) => {
            const plansData = plansRes.data.data || [];
            const dietsData = dietsRes.data.data || [];
            setPlans(plansData);
            setPlansCount(plansData.length);
            setDietsCount(dietsData.length);
            setLoading(false);
        });
    }, []);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
    );

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
                            <p className="text-[0.65rem] font-bold text-muted-foreground uppercase tracking-wider font-mono">Workout Plans</p>
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
                            <p className="text-[0.65rem] font-bold text-muted-foreground uppercase tracking-wider font-mono">Diet Plans</p>
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
                            <p className="text-[0.65rem] font-bold text-muted-foreground uppercase tracking-wider font-mono">My QR Code</p>
                            <p className="text-lg font-bold text-foreground mt-2 font-mono">Access Pass</p>
                            <p className="text-xs text-muted-foreground mt-1">Gym Entry</p>
                        </div>
                        <div className="p-2 border border-border bg-muted/50">
                            <QrCode size={18} className="text-foreground" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            {plans.length > 0 && (
                <div className="kpi-card p-0">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono">Recently Created Plans</h3>
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
            )}
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

function CustomerDashboard({ userName }: { userName: string }) {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [diets, setDiets] = useState<Diet[]>([]);
    const [stats, setStats] = useState<GamificationStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [plansRes, dietsRes, statsRes] = await Promise.all([
                    api.get('/fitness/plans').catch(() => ({ data: { data: [] } })),
                    api.get('/fitness/diets').catch(() => ({ data: { data: [] } })),
                    api.get('/gamification/stats').catch(() => ({ data: { data: null } }))
                ]);
                setPlans(plansRes.data.data || []);
                setDiets(dietsRes.data.data || []);
                setStats(statsRes.data.data);
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        loadData();
    }, []);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
    );

    const weeklyProgress = stats?.weekly_progress?.current || 0;
    const weeklyGoal = stats?.weekly_progress?.goal || 3;
    const progressPercent = Math.min(100, (weeklyProgress / weeklyGoal) * 100);

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Welcome, {userName}</h1>
                    <p className="text-sm text-muted-foreground mt-1">Your Fitness Journey</p>
                </div>
                {stats?.streak && stats.streak.current_streak > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                        <span className="text-orange-500">🔥</span>
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
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Weekly Goal</h3>
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
                                {progressPercent >= 100 ? "🎉 Goal reached! Amazing work!" : "Keep it up, you're doing great!"}
                            </p>
                        </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="kpi-card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[0.65rem] font-bold text-muted-foreground uppercase tracking-wider font-mono">Total Visits</p>
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
                                <p className="text-[0.65rem] font-bold text-muted-foreground uppercase tracking-wider font-mono">Badges Earned</p>
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
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Recent Badges</h3>
                        {stats?.badges && stats.badges.length > 0 ? (
                            <div className="space-y-3">
                                {stats.badges.slice(0, 3).map(badge => (
                                    <div key={badge.id} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center text-lg">
                                            🏆
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

            {/* Quick Access Cards */}
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono">Quick Access</h3>
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
                <Link href="/dashboard/member/profile" className="kpi-card group cursor-pointer hover:border-primary transition-colors">
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
                <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wider font-mono">My Workout Plans</h3>
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
                                {plan.exercises && plan.exercises.length > 0 && (
                                    <div className="ml-11 space-y-1 mt-2 border-l border-border pl-3">
                                        {plan.exercises.slice(0, 4).map((ex, i: number) => (
                                            <div key={i} className="flex justify-between text-xs py-0.5">
                                                <span className="text-muted-foreground">{ex.exercise?.name || ex.name || `Exercise ${i + 1}`}</span>
                                                <span className="text-muted-foreground font-mono">{ex.sets}×{ex.reps}</span>
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
                <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wider font-mono">My Diet Plans</h3>
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
        </div>
    );
}

// ======================== MAIN DASHBOARD PAGE ========================

export default function DashboardPage() {
    const { user } = useAuth();

    if (!user) return null;

    switch (user.role) {
        case 'ADMIN':
            return <AdminDashboard userName={user.full_name} />;
        case 'COACH':
            return <CoachDashboard userName={user.full_name} />;
        case 'CUSTOMER':
        default:
            return <CustomerDashboard userName={user.full_name} />;
    }
}
