'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
import { Users, DollarSign, Clock, TrendingUp, QrCode, Dumbbell, Utensils, CalendarCheck, Shield, ChevronRight, MessageSquare, ClipboardList, Plus } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import Link from 'next/link';

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

function AdminDashboard({ userName }: { userName: string }) {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [attendanceData, setAttendanceData] = useState<any[]>([]);
    const [revenueData, setRevenueData] = useState<any[]>([]);
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

    useEffect(() => {
        api.get('/analytics/dashboard')
            .then(res => setStats(res.data.data))
            .catch(err => console.error("Failed to fetch dashboard stats", err));
        api.get('/analytics/attendance?days=7')
            .then(res => setAttendanceData(res.data.data || []))
            .catch(() => { });
        api.get('/analytics/revenue-chart?days=30')
            .then(res => setRevenueData(res.data.data || []))
            .catch(() => { });
        api.get('/analytics/recent-activity')
            .then(res => setRecentActivity(res.data.data || []))
            .catch(() => setRecentActivity([]));
    }, []);

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
        { title: 'Live Headcount', value: stats?.live_headcount ?? '--', subtitle: 'Currently in the gym', icon: Users, iconClass: 'icon-blue', live: true },
        { title: "Today's Revenue", value: stats ? `${stats.todays_revenue.toFixed(2)} JOD` : '--', subtitle: 'Collected today', icon: DollarSign, iconClass: 'icon-green' },
        { title: 'Pending Salaries', value: stats ? `${stats.pending_salaries.toFixed(2)} JOD` : '--', subtitle: 'Owed this month', icon: Clock, iconClass: 'icon-amber' },
        { title: 'Active Members', value: stats?.active_members ?? '--', subtitle: 'Active subscriptions', icon: TrendingUp, iconClass: 'icon-red' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">Welcome back, {userName}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {kpiCards.map((card, i) => (
                    <div key={i} className="kpi-card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">{card.title}</p>
                                <p className="text-3xl font-bold text-white mt-2">{card.value}</p>
                                <p className="text-xs text-[#6B6B6B] mt-1">{card.subtitle}</p>
                            </div>
                            <div className={`${card.iconClass} h-11 w-11 rounded-xl flex items-center justify-center`}>
                                <card.icon size={20} className="text-white" />
                            </div>
                        </div>
                        {card.live && (
                            <div className="flex items-center gap-1.5 mt-3">
                                <span className="h-2 w-2 rounded-full bg-[#FF6B00] pulse-dot" />
                                <span className="text-xs text-[#FF6B00] font-medium">Live</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="chart-card">
                    <h3 className="text-sm font-semibold text-[#A3A3A3] mb-4">Visits by Hour (Last 7 Days)</h3>
                    <div className="h-64">
                        {attendanceData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={attendanceData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                                    <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#f5f5f5' }} />
                                    <Bar dataKey="visits" fill="url(#orangeGrad)" radius={[6, 6, 0, 0]} />
                                    <defs>
                                        <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#FF6B00" />
                                            <stop offset="100%" stopColor="#FF8533" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-[#333] text-sm">No attendance data yet</div>
                        )}
                    </div>
                </div>

                <div className="chart-card">
                    <h3 className="text-sm font-semibold text-[#A3A3A3] mb-4">Revenue vs. Expenses (30 Days)</h3>
                    <div className="h-64">
                        {revenueData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={revenueData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                                    <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#f5f5f5' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#6B6B6B' }} />
                                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-[#333] text-sm">No financial data yet</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="chart-card">
                <h3 className="text-sm font-semibold text-[#A3A3A3] mb-4">Recent Activity</h3>
                <div className="space-y-0">
                    {recentActivity.length > 0 ? (
                        recentActivity.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 py-3 border-b border-[#2a2a2a] last:border-0">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${item.color}`} />
                                <span className="text-sm text-[#A3A3A3] flex-1">{item.text}</span>
                                <span className="text-xs text-[#6B6B6B]">{formatTime(item.time)}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-6 text-[#333] text-sm">No recent activity yet</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ======================== COACH DASHBOARD ========================

function CoachDashboard({ userName }: { userName: string }) {
    const [plansCount, setPlansCount] = useState(0);
    const [dietsCount, setDietsCount] = useState(0);
    const [plans, setPlans] = useState<any[]>([]);
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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Coach Dashboard</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">Welcome back, {userName}</p>
            </div>

            {/* KPI Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="kpi-card">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Workout Plans</p>
                            <p className="text-3xl font-bold text-white mt-2">{plansCount}</p>
                            <p className="text-xs text-[#6B6B6B] mt-1">Plans you&apos;ve created</p>
                        </div>
                        <div className="icon-blue h-11 w-11 rounded-xl flex items-center justify-center">
                            <Dumbbell size={20} className="text-white" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Diet Plans</p>
                            <p className="text-3xl font-bold text-white mt-2">{dietsCount}</p>
                            <p className="text-xs text-[#6B6B6B] mt-1">Nutrition programs</p>
                        </div>
                        <div className="icon-green h-11 w-11 rounded-xl flex items-center justify-center">
                            <Utensils size={20} className="text-white" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">My QR Code</p>
                            <p className="text-lg font-bold text-white mt-2">Access Pass</p>
                            <p className="text-xs text-[#6B6B6B] mt-1">For gym entry</p>
                        </div>
                        <div className="icon-amber h-11 w-11 rounded-xl flex items-center justify-center">
                            <QrCode size={20} className="text-white" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Link href="/dashboard/coach/plans" className="chart-card group cursor-pointer hover:border-[#FF6B00]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="icon-blue h-12 w-12 rounded-xl flex items-center justify-center">
                                <Dumbbell size={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold">Workout Plans</h3>
                                <p className="text-[#6B6B6B] text-sm">Create & manage training programs</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-[#333] group-hover:text-[#FF6B00] transition-colors" />
                    </div>
                </Link>
                <Link href="/dashboard/coach/diets" className="chart-card group cursor-pointer hover:border-[#FF6B00]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="icon-green h-12 w-12 rounded-xl flex items-center justify-center">
                                <Utensils size={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold">Diet Plans</h3>
                                <p className="text-[#6B6B6B] text-sm">Create nutrition programs</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-[#333] group-hover:text-[#FF6B00] transition-colors" />
                    </div>
                </Link>
                <Link href="/dashboard/coach/feedback" className="chart-card group cursor-pointer hover:border-[#FF6B00]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="icon-red h-12 w-12 rounded-xl flex items-center justify-center">
                                <MessageSquare size={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold">Trainee Feedback</h3>
                                <p className="text-[#6B6B6B] text-sm">View workout logs & ratings</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-[#333] group-hover:text-[#FF6B00] transition-colors" />
                    </div>
                </Link>
                <Link href="/dashboard/qr" className="chart-card group cursor-pointer hover:border-[#FF6B00]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="icon-amber h-12 w-12 rounded-xl flex items-center justify-center">
                                <QrCode size={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold">My QR Code</h3>
                                <p className="text-[#6B6B6B] text-sm">Show at entrance for access</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-[#333] group-hover:text-[#FF6B00] transition-colors" />
                    </div>
                </Link>
            </div>

            {/* Recent Plans */}
            {plans.length > 0 && (
                <div className="chart-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-[#A3A3A3]">Recently Created Plans</h3>
                        <Link href="/dashboard/coach/plans" className="text-xs text-[#FF6B00] hover:text-[#FF8533] transition-colors">View All →</Link>
                    </div>
                    <div className="space-y-0">
                        {plans.slice(0, 5).map((plan: any, i: number) => (
                            <div key={plan.id || i} className="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0">
                                <div className="flex items-center gap-3">
                                    <Dumbbell size={16} className="text-[#FF6B00]" />
                                    <span className="text-sm text-white font-medium">{plan.name}</span>
                                </div>
                                <span className="text-xs text-[#6B6B6B]">{plan.exercises?.length || 0} exercises</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ======================== CUSTOMER DASHBOARD ========================

function CustomerDashboard({ userName }: { userName: string }) {
    const [plans, setPlans] = useState<any[]>([]);
    const [diets, setDiets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get('/fitness/plans').catch(() => ({ data: { data: [] } })),
            api.get('/fitness/diets').catch(() => ({ data: { data: [] } })),
        ]).then(([plansRes, dietsRes]) => {
            setPlans(plansRes.data.data || []);
            setDiets(dietsRes.data.data || []);
            setLoading(false);
        });
    }, []);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Welcome, {userName}</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">Your fitness hub — everything in one place</p>
            </div>

            {/* Quick Access Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Link href="/dashboard/qr" className="kpi-card group cursor-pointer hover:border-[#FF6B00]/30 transition-all">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Access Pass</p>
                            <p className="text-lg font-bold text-white mt-2">My QR Code</p>
                            <p className="text-xs text-[#6B6B6B] mt-1">Tap to view your code</p>
                        </div>
                        <div className="icon-blue h-11 w-11 rounded-xl flex items-center justify-center">
                            <QrCode size={20} className="text-white" />
                        </div>
                    </div>
                </Link>
                <div className="kpi-card">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Workout Plans</p>
                            <p className="text-3xl font-bold text-white mt-2">{plans.length}</p>
                            <p className="text-xs text-[#6B6B6B] mt-1">Assigned to you</p>
                        </div>
                        <div className="icon-amber h-11 w-11 rounded-xl flex items-center justify-center">
                            <Dumbbell size={20} className="text-white" />
                        </div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Diet Plans</p>
                            <p className="text-3xl font-bold text-white mt-2">{diets.length}</p>
                            <p className="text-xs text-[#6B6B6B] mt-1">Nutrition programs</p>
                        </div>
                        <div className="icon-green h-11 w-11 rounded-xl flex items-center justify-center">
                            <Utensils size={20} className="text-white" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Workout Plans */}
            <div className="chart-card">
                <h3 className="text-sm font-semibold text-[#A3A3A3] mb-4">My Workout Plans</h3>
                {plans.length > 0 ? (
                    <div className="space-y-3">
                        {plans.map((plan: any) => (
                            <div key={plan.id} className="rounded-xl p-4 border border-[#2a2a2a] hover:border-[#FF6B00]/20 transition-all" style={{ background: '#1a1a1a' }}>
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="icon-blue h-9 w-9 rounded-lg flex items-center justify-center">
                                            <Dumbbell size={16} className="text-white" />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold text-sm">{plan.name}</h4>
                                            <p className="text-[#6B6B6B] text-xs">{plan.description || 'No description'}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-[#6B6B6B] px-2 py-1 rounded-full" style={{ background: '#2a2a2a' }}>
                                        {plan.exercises?.length || 0} exercises
                                    </span>
                                </div>
                                {plan.exercises?.length > 0 && (
                                    <div className="ml-12 space-y-1 mt-2">
                                        {plan.exercises.slice(0, 4).map((ex: any, i: number) => (
                                            <div key={i} className="flex justify-between text-xs py-1">
                                                <span className="text-[#A3A3A3]">{ex.exercise?.name || ex.name || `Exercise ${i + 1}`}</span>
                                                <span className="text-[#6B6B6B]">{ex.sets}×{ex.reps}</span>
                                            </div>
                                        ))}
                                        {plan.exercises.length > 4 && (
                                            <p className="text-xs text-[#FF6B00]">+{plan.exercises.length - 4} more</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <Dumbbell size={36} className="mx-auto text-[#333] mb-3" />
                        <p className="text-[#6B6B6B] text-sm">No workout plans assigned yet.</p>
                        <p className="text-[#555] text-xs mt-1">Your coach will assign plans to you</p>
                    </div>
                )}
            </div>

            {/* Diet Plans */}
            <div className="chart-card">
                <h3 className="text-sm font-semibold text-[#A3A3A3] mb-4">My Diet Plans</h3>
                {diets.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {diets.map((diet: any) => (
                            <div key={diet.id} className="rounded-xl p-4 border border-[#2a2a2a] hover:border-[#FF6B00]/20 transition-all" style={{ background: '#1a1a1a' }}>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="icon-green h-9 w-9 rounded-lg flex items-center justify-center">
                                        <Utensils size={16} className="text-white" />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-semibold text-sm">{diet.name}</h4>
                                        <p className="text-[#6B6B6B] text-xs">{diet.description || 'No description'}</p>
                                    </div>
                                </div>
                                <div className="rounded-lg p-3 text-xs text-[#A3A3A3] max-h-20 overflow-y-auto whitespace-pre-wrap mt-2" style={{ background: '#2a2a2a' }}>
                                    {diet.content}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <Utensils size={36} className="mx-auto text-[#333] mb-3" />
                        <p className="text-[#6B6B6B] text-sm">No diet plans assigned yet.</p>
                        <p className="text-[#555] text-xs mt-1">Your coach will create a nutrition program for you</p>
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
