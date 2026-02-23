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
    ShieldAlert,
    LifeBuoy
} from "lucide-react";
import { MessageCircle } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEffect, useState } from 'react';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import ChatDrawer from '@/components/chat/ChatDrawer';
import { api } from '@/lib/api';

const BLOCKED_ALLOWED_ROUTES = ['/dashboard/blocked', '/dashboard/support', '/dashboard/lost-found'];
const BLOCKED_SUBSCRIPTION_STATUSES = new Set(['EXPIRED', 'FROZEN', 'NONE']);

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatNewConversations, setChatNewConversations] = useState(0);
    const [supportHasNew, setSupportHasNew] = useState(false);
    const [lostFoundHasNew, setLostFoundHasNew] = useState(false);
    const [failedProfileImageUrl, setFailedProfileImageUrl] = useState<string | null>(null);
    const profileImageUrl = resolveProfileImageUrl(user?.profile_picture_url);
    const isBlockedCustomer =
        user?.role === 'CUSTOMER' &&
        (Boolean(user?.is_subscription_blocked) ||
            BLOCKED_SUBSCRIPTION_STATUSES.has(user?.subscription_status || 'NONE'));
    const canUseChat = ['COACH', 'CUSTOMER'].includes(user?.role || '') && !isBlockedCustomer;
    const isBlockedRouteAllowed = BLOCKED_ALLOWED_ROUTES.some((route) => pathname.startsWith(route));
    const isSupportPage = pathname.startsWith('/dashboard/admin/support') || pathname.startsWith('/dashboard/support');
    const isLostFoundPage = pathname.startsWith('/dashboard/lost-found');
    const isChatPage = pathname.startsWith('/dashboard/chat');

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    useEffect(() => {
        if (isLoading || !user) return;

        if (isBlockedCustomer) {
            if (!isBlockedRouteAllowed) {
                router.replace('/dashboard/blocked');
            }
            return;
        }

    }, [isLoading, user, pathname, router, isBlockedCustomer, isBlockedRouteAllowed]);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        const timer = setTimeout(() => setSidebarOpen(false), 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    useEffect(() => {
        if (!user) return;

        const seenKeySupport = `last_seen_support_${user.id}`;
        const seenKeyLostFound = `last_seen_lost_found_${user.id}`;
        const seenKeyChat = `last_seen_chat_${user.id}`;

        const getSeenTs = (key: string) => {
            const raw = localStorage.getItem(key);
            if (!raw) return 0;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const refreshIndicators = async () => {
            try {
                const tasks: Array<Promise<unknown>> = [];
                let supportLatest: string | null = null;
                let lostFoundLatest: string | null = null;
                let chatThreads: Array<{ last_message_at?: string | null }> = [];

                tasks.push(
                    api.get('/support/tickets', { params: { is_active: true, limit: 1 } }).then((resp) => {
                        const rows = resp.data?.data || [];
                        supportLatest = rows[0]?.updated_at || null;
                    }).catch(() => {
                        supportLatest = null;
                    })
                );

                tasks.push(
                    api.get('/lost-found/items', { params: { limit: 1 } }).then((resp) => {
                        const rows = resp.data?.data || [];
                        lostFoundLatest = rows[0]?.updated_at || null;
                    }).catch(() => {
                        lostFoundLatest = null;
                    })
                );

                if (canUseChat) {
                    tasks.push(
                        api.get('/chat/threads', { params: { limit: 100, sort_by: 'last_message_at', sort_order: 'desc' } }).then((resp) => {
                            chatThreads = (resp.data?.data || []) as Array<{ last_message_at?: string | null }>;
                        }).catch(() => {
                            chatThreads = [];
                        })
                    );
                }

                await Promise.all(tasks);

                const seenSupport = getSeenTs(seenKeySupport);
                const seenLostFound = getSeenTs(seenKeyLostFound);
                const supportTs = supportLatest ? new Date(supportLatest).getTime() : 0;
                const lostFoundTs = lostFoundLatest ? new Date(lostFoundLatest).getTime() : 0;

                setSupportHasNew(supportTs > seenSupport && supportTs > 0);
                setLostFoundHasNew(lostFoundTs > seenLostFound && lostFoundTs > 0);

                if (canUseChat) {
                    const seenChat = getSeenTs(seenKeyChat);
                    const newConvoCount = chatThreads.filter((t) => {
                        const ts = t.last_message_at ? new Date(t.last_message_at).getTime() : 0;
                        return ts > seenChat;
                    }).length;
                    setChatNewConversations(newConvoCount);
                } else {
                    setChatNewConversations(0);
                }
            } catch {
                setSupportHasNew(false);
                setLostFoundHasNew(false);
                setChatNewConversations(0);
            }
        };

        refreshIndicators();
        const intervalId = window.setInterval(refreshIndicators, 12000);
        return () => window.clearInterval(intervalId);
    }, [user, canUseChat]);

    useEffect(() => {
        if (!user) return;
        if (isSupportPage) {
            localStorage.setItem(`last_seen_support_${user.id}`, String(Date.now()));
            setSupportHasNew(false);
        }
        if (isLostFoundPage) {
            localStorage.setItem(`last_seen_lost_found_${user.id}`, String(Date.now()));
            setLostFoundHasNew(false);
        }
    }, [pathname, isSupportPage, isLostFoundPage, user]);

    useEffect(() => {
        if (!user) return;
        if (chatOpen || isChatPage) {
            localStorage.setItem(`last_seen_chat_${user.id}`, String(Date.now()));
            setChatNewConversations(0);
        }
    }, [chatOpen, isChatPage, user]);

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

    if (isBlockedCustomer && !isBlockedRouteAllowed) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Redirecting...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COACH', 'CUSTOMER', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'operations' },
        { href: '/dashboard/admin/inventory', label: 'Inventory', icon: Package, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/pos', label: 'Cashier POS', icon: ShoppingCart, roles: ['ADMIN', 'CASHIER', 'EMPLOYEE'], section: 'operations' },
        { href: '/dashboard/admin/notifications', label: 'WhatsApp Automation', icon: MessageSquare, roles: ['ADMIN', 'RECEPTION', 'FRONT_DESK'], section: 'operations' },
        { href: '/dashboard/admin/support', label: 'Support Desk', icon: LifeBuoy, roles: ['ADMIN', 'RECEPTION'], section: 'operations' },
        { href: '/dashboard/lost-found', label: 'Lost & Found', icon: MessageSquare, roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER', 'CUSTOMER'], section: 'operations' },
        { href: '/dashboard/admin/audit', label: 'Audit Logs', icon: ShieldAlert, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/members', label: 'Reception/Registration', icon: UserCheck, roles: ['ADMIN', 'COACH', 'RECEPTION', 'FRONT_DESK'], section: 'people' },
        { href: '/dashboard/admin/staff', label: 'Staff', icon: Users, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/staff/attendance', label: 'Attendance', icon: ClipboardList, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/leaves', label: 'HR Leaves', icon: ClipboardList, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/finance', label: 'Financials', icon: Wallet, roles: ['ADMIN'], section: 'finance' },
        { href: '/dashboard/coach/plans', label: 'Workout Plans', icon: Dumbbell, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/diets', label: 'Diet Plans', icon: Utensils, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/feedback', label: 'Feedback', icon: MessageSquare, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/qr', label: 'My QR Code', icon: QrCode, roles: ['CUSTOMER', 'COACH', 'ADMIN', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'account' },
        { href: '/dashboard/leaves', label: 'My Leaves', icon: ClipboardList, roles: ['ADMIN', 'COACH', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'account' },
        { href: '/dashboard/profile', label: 'My Profile', icon: UserCheck, roles: ['ADMIN', 'COACH', 'CUSTOMER', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'account' },
        { href: '/dashboard/member/feedback', label: 'My Feedback', icon: MessageSquare, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/history', label: 'History', icon: ClipboardList, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/achievements', label: 'Achievements', icon: Trophy, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/blocked', label: 'Subscription', icon: ShieldAlert, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/support', label: 'Support', icon: MessageSquare, roles: ['CUSTOMER'], section: 'account' },
    ];

    const navSections = [
        { key: 'operations', label: 'Operations' },
        { key: 'people', label: 'People' },
        { key: 'finance', label: 'Finance' },
        { key: 'coaching', label: 'Coaching' },
        { key: 'account', label: 'Account' },
    ];

    const filteredNav = navItems.filter(item => item.roles.includes(user.role)).filter((item) => {
        if (!isBlockedCustomer) return true;
        return BLOCKED_ALLOWED_ROUTES.some((route) => item.href.startsWith(route));
    });

    return (
        <div className="flex min-h-dvh bg-background">
            {/* Mobile top bar */}
            <div
                className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 md:hidden bg-card"
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
                    >
                        {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Dumbbell size={16} className="text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground">GymERP</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Mobile top-bar actions if any */}
                </div>
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
                                        const showDot =
                                            (item.href === '/dashboard/lost-found' && lostFoundHasNew) ||
                                            ((item.href === '/dashboard/admin/support' || item.href === '/dashboard/support') && supportHasNew);
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className={`nav-link ${isActive ? 'active' : ''}`}
                                            >
                                                <item.icon size={18} />
                                                <span className="inline-flex items-center gap-2">
                                                    {item.label}
                                                    {showDot && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="new activity" />}
                                                </span>
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
            <main className="flex-1 min-h-0 overflow-auto p-4 pt-20 md:p-8 md:pt-8 bg-background">
                {canUseChat && !pathname.startsWith('/dashboard/chat') && (
                    <button
                        type="button"
                        onClick={() => setChatOpen(true)}
                        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200"
                        aria-label="Open chat"
                    >
                        <MessageCircle size={24} />
                        {chatNewConversations > 0 && (
                            <span className="absolute -top-1 -right-1 flex min-w-[20px] h-[20px] px-1.5 items-center justify-center rounded-full bg-black text-white text-xs font-bold border-2 border-background shadow-sm">
                                {chatNewConversations > 99 ? '99+' : chatNewConversations}
                            </span>
                        )}
                    </button>
                )}
                {children}
            </main>
            {canUseChat && !pathname.startsWith('/dashboard/chat') && <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />}
        </div>
    );
}
