'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image'; // Added this import
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
import { resolveProfileImageUrl } from '@/lib/profileImage';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [failedProfileImageUrl, setFailedProfileImageUrl] = useState<string | null>(null);
    const profileImageUrl = resolveProfileImageUrl(user?.profile_picture_url);

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
            <div className="flex min-h-dvh items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COACH', 'CUSTOMER'], section: 'operations' },
        { href: '/dashboard/admin/inventory', label: 'Inventory', icon: Package, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/pos', label: 'POS', icon: ShoppingCart, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/audit', label: 'Audit Logs', icon: ShieldAlert, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/members', label: 'Clients', icon: UserCheck, roles: ['ADMIN', 'COACH'], section: 'people' },
        { href: '/dashboard/admin/staff', label: 'Staff', icon: Users, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/staff/attendance', label: 'Attendance', icon: ClipboardList, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/leaves', label: 'HR Leaves', icon: ClipboardList, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/finance', label: 'Financials', icon: Wallet, roles: ['ADMIN'], section: 'finance' },
        { href: '/dashboard/coach/plans', label: 'Workout Plans', icon: Dumbbell, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/diets', label: 'Diet Plans', icon: Utensils, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/feedback', label: 'Feedback', icon: MessageSquare, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/qr', label: 'My QR Code', icon: QrCode, roles: ['CUSTOMER', 'COACH', 'ADMIN'], section: 'account' },
        { href: '/dashboard/leaves', label: 'My Leaves', icon: ClipboardList, roles: ['ADMIN', 'COACH'], section: 'account' },
        { href: '/dashboard/profile', label: 'My Profile', icon: UserCheck, roles: ['ADMIN', 'COACH', 'CUSTOMER', 'EMPLOYEE'], section: 'account' },
        { href: '/dashboard/member/history', label: 'History', icon: ClipboardList, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/achievements', label: 'Achievements', icon: Trophy, roles: ['CUSTOMER'], section: 'account' },
    ];

    const navSections = [
        { key: 'operations', label: 'Operations' },
        { key: 'people', label: 'People' },
        { key: 'finance', label: 'Finance' },
        { key: 'coaching', label: 'Coaching' },
        { key: 'account', label: 'Account' },
    ];

    const filteredNav = navItems.filter(item => item.roles.includes(user.role));

    return (
        <div className="flex min-h-dvh bg-background">
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
                    fixed md:static z-50 top-0 left-0 h-dvh md:h-auto w-64 flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    bg-card border-r border-border
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0
                `}
            >
                <div className="p-5 pb-4 border-b border-border relative">
                    <div className="absolute top-3 right-3">
                        <ThemeToggle />
                    </div>
                    <div className="flex flex-col items-center justify-center mt-1 group">
                        <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center text-primary text-xl font-bold shadow-sm ring-2 ring-background overflow-hidden relative mb-2 transition-transform group-hover:scale-105">
                            {profileImageUrl && failedProfileImageUrl !== profileImageUrl ? (
                                <Image
                                    src={profileImageUrl}
                                    alt={user.full_name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                    priority
                                    onError={() => setFailedProfileImageUrl(profileImageUrl)}
                                />
                            ) : (
                                user?.full_name?.[0] || 'U'
                            )}
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-foreground text-sm mb-0.5">{user?.full_name}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase bg-muted/40 inline-block px-2 py-0.5 rounded-full">{user?.role}</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-3 overflow-y-auto">
                    {navSections.map((section) => {
                        const sectionItems = filteredNav.filter((item) => item.section === section.key);
                        if (sectionItems.length === 0) return null;

                        return (
                            <div key={section.key} className="mb-4 last:mb-0">
                                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                    {section.label}
                                </p>
                                <div className="space-y-0.5">
                                    {sectionItems.map((item) => {
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
                                </div>
                            </div>
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
            <main className="flex-1 min-h-0 overflow-auto p-4 pt-16 md:p-8 md:pt-8 bg-background">
                {children}
            </main>
        </div>
    );
}
