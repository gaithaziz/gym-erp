'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
import { Users, DollarSign, Clock, TrendingUp } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface DashboardStats {
    live_headcount: number;
    todays_revenue: number;
    active_members: number;
    monthly_revenue: number;
    monthly_expenses: number;
    pending_salaries: number;
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [attendanceData, setAttendanceData] = useState<any[]>([]);
    const [revenueData, setRevenueData] = useState<any[]>([]);

    useEffect(() => {
        if (user) {
            api.get('/analytics/dashboard')
                .then(res => setStats(res.data.data))
                .catch(err => console.error("Failed to fetch dashboard stats", err));

            api.get('/analytics/attendance?days=7')
                .then(res => setAttendanceData(res.data.data || []))
                .catch(() => { });

            api.get('/analytics/revenue-chart?days=30')
                .then(res => setRevenueData(res.data.data || []))
                .catch(() => { });
        }
    }, [user]);

    const kpiCards = [
        {
            title: 'Live Headcount',
            value: stats?.live_headcount ?? '--',
            subtitle: 'Currently in the gym',
            icon: Users,
            iconClass: 'icon-blue',
            live: true,
        },
        {
            title: "Today's Revenue",
            value: stats ? `${stats.todays_revenue.toFixed(2)} JOD` : '--',
            subtitle: 'Collected today',
            icon: DollarSign,
            iconClass: 'icon-green',
        },
        {
            title: 'Pending Salaries',
            value: stats ? `${stats.pending_salaries.toFixed(2)} JOD` : '--',
            subtitle: 'Owed this month',
            icon: Clock,
            iconClass: 'icon-amber',
        },
        {
            title: 'Active Members',
            value: stats?.active_members ?? '--',
            subtitle: 'Active subscriptions',
            icon: TrendingUp,
            iconClass: 'icon-red',
        },
    ];

    // Placeholder activity log
    const recentActivity = [
        { text: 'System ready — no recent activity yet', time: 'Just now', color: 'bg-blue-500' },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                <p className="text-sm text-slate-400 mt-1">Welcome back, {user?.full_name}</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {kpiCards.map((card, i) => (
                    <div key={i} className="kpi-card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{card.title}</p>
                                <p className="text-3xl font-bold text-slate-800 mt-2">{card.value}</p>
                                <p className="text-xs text-slate-400 mt-1">{card.subtitle}</p>
                            </div>
                            <div className={`${card.iconClass} h-11 w-11 rounded-xl flex items-center justify-center shadow-lg`}>
                                <card.icon size={20} className="text-white" />
                            </div>
                        </div>
                        {card.live && (
                            <div className="flex items-center gap-1.5 mt-3">
                                <span className="h-2 w-2 rounded-full bg-green-500 pulse-dot" />
                                <span className="text-xs text-green-600 font-medium">Live</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Visits by Hour */}
                <div className="chart-card">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Visits by Hour (Last 7 Days)</h3>
                    <div className="h-64">
                        {attendanceData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={attendanceData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                                    />
                                    <Bar dataKey="visits" fill="url(#blueGrad)" radius={[6, 6, 0, 0]} />
                                    <defs>
                                        <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#8b5cf6" />
                                        </linearGradient>
                                    </defs>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-300 text-sm">
                                No attendance data yet
                            </div>
                        )}
                    </div>
                </div>

                {/* Revenue vs Expenses */}
                <div className="chart-card">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue vs. Expenses (30 Days)</h3>
                    <div className="h-64">
                        {revenueData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={revenueData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-300 text-sm">
                                No financial data yet
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Activity Log */}
            <div className="chart-card">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Recent Activity</h3>
                <div className="space-y-0">
                    {recentActivity.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                            <span className={`h-2.5 w-2.5 rounded-full ${item.color} shrink-0`} />
                            <span className="text-sm text-slate-600 flex-1">{item.text}</span>
                            <span className="text-xs text-slate-400">{item.time}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
