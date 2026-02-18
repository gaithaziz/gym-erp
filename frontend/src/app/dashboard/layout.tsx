'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Users, LayoutDashboard, LogOut, Wallet, Dumbbell, ClipboardList, QrCode, Utensils, MessageSquare, UserCheck } from 'lucide-react';
import { useEffect } from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    if (isLoading || !user) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                    <p className="text-sm text-slate-400">Loading...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/admin/members', label: 'Members', icon: UserCheck, roles: ['ADMIN'] },
        { href: '/dashboard/admin/staff', label: 'Staff Management', icon: Users, roles: ['ADMIN'] },
        { href: '/dashboard/admin/staff/attendance', label: 'Attendance', icon: ClipboardList, roles: ['ADMIN'] },
        { href: '/dashboard/admin/finance', label: 'Financials', icon: Wallet, roles: ['ADMIN'] },
        { href: '/dashboard/coach/plans', label: 'Workout Plans', icon: Dumbbell, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/coach/diets', label: 'Diet Plans', icon: Utensils, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/coach/feedback', label: 'Feedback', icon: MessageSquare, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/qr', label: 'My QR Code', icon: QrCode, roles: ['MEMBER', 'COACH', 'ADMIN'] },
    ];

    return (
        <div className="flex h-screen bg-slate-50">
            {/* Sidebar */}
            <aside className="w-64 flex flex-col" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}>
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg icon-blue flex items-center justify-center">
                            <Dumbbell size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Gym ERP</h2>
                            <p className="text-xs text-slate-400">{user.role}</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-300 mt-3">Welcome, {user.full_name}</p>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems
                        .filter(item => item.roles.includes(user.role))
                        .map(item => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`nav-link ${isActive ? 'active' : ''}`}
                                >
                                    <item.icon size={20} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })
                    }
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button
                        onClick={logout}
                        className="nav-link w-full text-red-400 hover:!text-red-300 hover:!bg-red-500/10"
                    >
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto p-8">
                {children}
            </main>
        </div>
    );
}
