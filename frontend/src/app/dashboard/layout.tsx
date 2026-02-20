'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Users,
    Dumbbell,
    Utensils,
    QrCode,
    LogOut,
    Menu,
    X,
    Wallet,
    ClipboardList,
    MessageSquare,
    UserCheck,
    Trophy,
    Package,
    ShoppingCart,
    ShieldAlert
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
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
        const timer = setTimeout(() => setSidebarOpen(false), 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    if (isLoading || !user) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COACH', 'CUSTOMER'] },
        { href: '/dashboard/admin/members', label: 'Members', icon: UserCheck, roles: ['ADMIN'] },
        { href: '/dashboard/admin/staff', label: 'Staff', icon: Users, roles: ['ADMIN'] },
        { href: '/dashboard/admin/staff/attendance', label: 'Attendance', icon: ClipboardList, roles: ['ADMIN'] },
        { href: '/dashboard/admin/leaves', label: 'HR Leaves', icon: ClipboardList, roles: ['ADMIN'] },
        { href: '/dashboard/admin/finance', label: 'Financials', icon: Wallet, roles: ['ADMIN'] },
        { href: '/dashboard/admin/scanner', label: 'Scanner', icon: QrCode, roles: ['ADMIN'] },
        { href: '/dashboard/admin/inventory', label: 'Inventory', icon: Package, roles: ['ADMIN'] },
        { href: '/dashboard/admin/pos', label: 'POS', icon: ShoppingCart, roles: ['ADMIN'] },
        { href: '/dashboard/admin/audit', label: 'Audit Logs', icon: ShieldAlert, roles: ['ADMIN'] },
        { href: '/dashboard/coach/plans', label: 'Workout Plans', icon: Dumbbell, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/coach/diets', label: 'Diet Plans', icon: Utensils, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/coach/feedback', label: 'Feedback', icon: MessageSquare, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/qr', label: 'My QR Code', icon: QrCode, roles: ['CUSTOMER', 'COACH', 'ADMIN'] },
        { href: '/dashboard/leaves', label: 'My Leaves', icon: ClipboardList, roles: ['ADMIN', 'COACH'] },
        { href: '/dashboard/member/profile', label: 'My Profile', icon: UserCheck, roles: ['CUSTOMER'] },
        { href: '/dashboard/member/history', label: 'History', icon: ClipboardList, roles: ['CUSTOMER'] },
        { href: '/dashboard/member/achievements', label: 'Achievements', icon: Trophy, roles: ['CUSTOMER'] },
    ];

    const filteredNav = navItems.filter(item => item.roles.includes(user.role));

    return (
        <div className="flex h-screen bg-background">
            {/* Mobile top bar */}
            <div
                className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 md:hidden bg-card border-b border-border"
            >
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Dumbbell size={16} className="text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground">GymERP</span>
                </div>
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed md:static z-50 top-0 left-0 h-full w-64 flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    bg-card border-r border-border
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0
                `}
            >
                <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                            {user?.full_name?.[0] || 'U'}
                        </div>
                        <div className="hidden md:block">
                            <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase()}</p>
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">{user.full_name}</p>
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

                <div className="p-4 border-t border-border">
                    <button
                        onClick={logout}
                        className="nav-link w-full text-destructive hover:!text-destructive hover:!bg-destructive/10"
                    >
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto p-4 pt-16 md:p-8 md:pt-8 bg-background">
                {children}
            </main>
        </div>
    );
}
