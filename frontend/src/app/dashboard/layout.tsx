'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Users, LayoutDashboard, LogOut, Wallet, Dumbbell, ClipboardList, QrCode, Utensils, MessageSquare, UserCheck, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    if (isLoading || !user) {
        return (
            <div className="flex h-screen items-center justify-center" style={{ background: '#111111' }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
                    <p className="text-sm text-[#6B6B6B]">Loading...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COACH', 'CUSTOMER'] },
        { href: '/dashboard/admin/members', label: 'Members', icon: UserCheck, roles: ['ADMIN'] },
        { href: '/dashboard/admin/staff', label: 'Staff', icon: Users, roles: ['ADMIN'] },
        { href: '/dashboard/admin/staff/attendance', label: 'Attendance', icon: ClipboardList, roles: ['ADMIN'] },
        { href: '/dashboard/admin/finance', label: 'Financials', icon: Wallet, roles: ['ADMIN'] },
        { href: '/dashboard/admin/scanner', label: 'Scanner', icon: QrCode, roles: ['ADMIN'] },
        { href: '/dashboard/coach/plans', label: 'Workout Plans', icon: Dumbbell, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/coach/diets', label: 'Diet Plans', icon: Utensils, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/coach/feedback', label: 'Feedback', icon: MessageSquare, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/qr', label: 'My QR Code', icon: QrCode, roles: ['CUSTOMER', 'COACH', 'ADMIN'] },
    ];

    const filteredNav = navItems.filter(item => item.roles.includes(user.role));

    return (
        <div className="flex h-screen" style={{ background: '#111111' }}>
            {/* Mobile top bar */}
            <div
                className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 md:hidden"
                style={{ background: '#0a0a0a', borderBottom: '1px solid #1e1e1e' }}
            >
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg icon-blue flex items-center justify-center">
                        <Dumbbell size={16} className="text-white" />
                    </div>
                    <span className="text-sm font-bold text-white">GymERP</span>
                </div>
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 rounded-lg text-[#6B6B6B] hover:text-white hover:bg-white/5 transition-colors"
                >
                    {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed md:static z-50 top-0 left-0 h-full w-64 flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0
                `}
                style={{ background: '#0a0a0a', borderRight: '1px solid #1e1e1e' }}
            >
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg icon-blue flex items-center justify-center">
                            <Dumbbell size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight">GymERP</h2>
                            <p className="text-[0.65rem] text-[#FF6B00] font-semibold uppercase tracking-wider">{user.role}</p>
                        </div>
                    </div>
                    <p className="text-sm text-[#6B6B6B] mt-3">{user.full_name}</p>
                </div>

                <nav className="flex-1 p-4 space-y-0.5 overflow-y-auto">
                    {filteredNav.map(item => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`nav-link ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={18} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/5">
                    <button
                        onClick={logout}
                        className="nav-link w-full text-red-400/70 hover:!text-red-400 hover:!bg-red-500/10"
                    >
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto p-4 pt-16 md:p-8 md:pt-8">
                {children}
            </main>
        </div>
    );
}
