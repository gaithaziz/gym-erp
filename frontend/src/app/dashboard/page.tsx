'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DashboardStats {
    active_members: number;
    estimated_monthly_revenue: number;
    total_expenses_to_date: number;
}

export default function DashboardPage() {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<DashboardStats | null>(null);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        } else if (user) {
            api.get('/analytics/dashboard')
                .then(res => setStats(res.data.data))
                .catch(err => console.error("Failed to fetch dashboard stats", err));
        }
    }, [user, isLoading, router]);

    if (isLoading || !user) {
        return <div className="flex h-screen items-center justify-center">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <div className="flex items-center gap-4">
                    <span>Welcome, {user.full_name} ({user.role})</span>
                    <button
                        onClick={logout}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
                    >
                        Logout
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-gray-500 text-sm font-medium">Active Members</h3>
                    <p className="text-4xl font-bold mt-2">{stats ? stats.active_members : '--'}</p>
                </div>
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-gray-500 text-sm font-medium">Monthly Revenue (Est.)</h3>
                    <p className="text-4xl font-bold mt-2 text-green-600">
                        {stats ? `$${stats.estimated_monthly_revenue.toFixed(2)}` : '--'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-gray-500 text-sm font-medium">Total Expenses</h3>
                    <p className="text-4xl font-bold mt-2 text-red-600">
                        {stats ? `$${stats.total_expenses_to_date.toFixed(2)}` : '--'}
                    </p>
                </div>
            </div>
        </div>
    );
}
