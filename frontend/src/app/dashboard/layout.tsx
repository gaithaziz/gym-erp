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
    LifeBuoy,
    Activity,
    type LucideIcon
} from "lucide-react";
import { MessageCircle } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useEffect, useState } from 'react';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import ChatDrawer from '@/components/chat/ChatDrawer';
import { api } from '@/lib/api';
import { useChatThreads } from '@/hooks/useChatThreads';
import { useLocale } from '@/context/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/types';

const BLOCKED_ALLOWED_ROUTES = ['/dashboard/subscription', '/dashboard/blocked', '/dashboard/support', '/dashboard/lost-found'];
const BLOCKED_SUBSCRIPTION_STATUSES = new Set(['EXPIRED', 'FROZEN', 'NONE']);

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { t, direction } = useLocale();
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [supportHasNew, setSupportHasNew] = useState(false);
    const [lostFoundHasNew, setLostFoundHasNew] = useState(false);
    const [failedProfileImageUrl, setFailedProfileImageUrl] = useState<string | null>(null);
    const profileImageUrl = resolveProfileImageUrl(user?.profile_picture_url);
    const isBlockedCustomer =
        user?.role === 'CUSTOMER' &&
        (Boolean(user?.is_subscription_blocked) ||
            BLOCKED_SUBSCRIPTION_STATUSES.has(user?.subscription_status || 'NONE'));
    const canUseChat = ['ADMIN', 'COACH', 'CUSTOMER'].includes(user?.role || '') && !isBlockedCustomer;
    const isBlockedRouteAllowed = BLOCKED_ALLOWED_ROUTES.some((route) => pathname.startsWith(route));
    const isSupportPage = pathname.startsWith('/dashboard/admin/support') || pathname.startsWith('/dashboard/support');
    const isLostFoundPage = pathname.startsWith('/dashboard/lost-found');
    const { threads: chatThreads, mutate: mutateChatThreads } = useChatThreads({ enabled: !!user && canUseChat, limit: 100 });
    const chatNewConversations = canUseChat
        ? chatThreads.filter((t) => (t.unread_count || 0) > 0).length
        : 0;

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    useEffect(() => {
        if (isLoading || !user) return;

        if (isBlockedCustomer) {
            if (!isBlockedRouteAllowed) {
                router.replace('/dashboard/subscription');
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

                await Promise.all(tasks);

                const seenSupport = getSeenTs(seenKeySupport);
                const seenLostFound = getSeenTs(seenKeyLostFound);
                const supportTs = supportLatest ? new Date(supportLatest).getTime() : 0;
                const lostFoundTs = lostFoundLatest ? new Date(lostFoundLatest).getTime() : 0;

                setSupportHasNew(supportTs > seenSupport && supportTs > 0);
                setLostFoundHasNew(lostFoundTs > seenLostFound && lostFoundTs > 0);

            } catch {
                setSupportHasNew(false);
                setLostFoundHasNew(false);
            }
        };

        refreshIndicators();
        const handleChatIndicatorSync = () => {
            void mutateChatThreads();
            void refreshIndicators();
        };
        window.addEventListener('chat:sync-indicators', handleChatIndicatorSync);
        const intervalId = window.setInterval(refreshIndicators, 12000);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('chat:sync-indicators', handleChatIndicatorSync);
        };
    }, [user, mutateChatThreads]);

    useEffect(() => {
        if (!user) return;
        if (isSupportPage) {
            localStorage.setItem(`last_seen_support_${user.id}`, String(Date.now()));
        }
        if (isLostFoundPage) {
            localStorage.setItem(`last_seen_lost_found_${user.id}`, String(Date.now()));
        }
    }, [pathname, isSupportPage, isLostFoundPage, user]);

    if (isLoading || !user) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                </div>
            </div>
        );
    }

    if (isBlockedCustomer && !isBlockedRouteAllowed) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">{t('common.redirecting')}</p>
                </div>
            </div>
        );
    }

    const navItems: Array<{
        href: string;
        labelKey: TranslationKey;
        icon: LucideIcon;
        roles: string[];
        section: string;
    }> = [
        { href: '/dashboard', labelKey: 'dashboard.nav.dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COACH', 'CUSTOMER', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'operations' },
        { href: '/dashboard/admin/inventory', labelKey: 'dashboard.nav.inventory', icon: Package, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/pos', labelKey: 'dashboard.nav.cashierPos', icon: ShoppingCart, roles: ['ADMIN', 'CASHIER', 'EMPLOYEE'], section: 'operations' },
        { href: '/dashboard/admin/notifications', labelKey: 'dashboard.nav.whatsappAutomation', icon: MessageSquare, roles: ['ADMIN', 'RECEPTION', 'FRONT_DESK'], section: 'operations' },
        { href: '/dashboard/admin/entrance-qr', labelKey: 'dashboard.nav.entranceQr', icon: QrCode, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/support', labelKey: 'dashboard.nav.supportDesk', icon: LifeBuoy, roles: ['ADMIN', 'RECEPTION'], section: 'operations' },
        { href: '/dashboard/lost-found', labelKey: 'dashboard.nav.lostFound', icon: MessageSquare, roles: ['ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER', 'CUSTOMER'], section: 'operations' },
        { href: '/dashboard/admin/audit', labelKey: 'dashboard.nav.auditLogs', icon: ShieldAlert, roles: ['ADMIN'], section: 'operations' },
        { href: '/dashboard/admin/members', labelKey: 'dashboard.nav.receptionRegistration', icon: UserCheck, roles: ['ADMIN', 'COACH', 'RECEPTION', 'FRONT_DESK'], section: 'people' },
        { href: '/dashboard/admin/staff', labelKey: 'dashboard.nav.staff', icon: Users, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/staff/attendance', labelKey: 'dashboard.nav.attendance', icon: ClipboardList, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/leaves', labelKey: 'dashboard.nav.hrLeaves', icon: ClipboardList, roles: ['ADMIN'], section: 'people' },
        { href: '/dashboard/admin/finance', labelKey: 'dashboard.nav.financials', icon: Wallet, roles: ['ADMIN'], section: 'finance' },
        { href: '/dashboard/coach/plans', labelKey: 'dashboard.nav.workoutPlans', icon: Dumbbell, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/diets', labelKey: 'dashboard.nav.dietPlans', icon: Utensils, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/library', labelKey: 'dashboard.nav.workoutDietLibrary', icon: Users, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/coach/feedback', labelKey: 'dashboard.nav.feedback', icon: MessageSquare, roles: ['ADMIN', 'COACH'], section: 'coaching' },
        { href: '/dashboard/qr', labelKey: 'dashboard.nav.myQrCode', icon: QrCode, roles: ['CUSTOMER', 'COACH', 'ADMIN', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'account' },
        { href: '/dashboard/leaves', labelKey: 'dashboard.nav.myLeaves', icon: ClipboardList, roles: ['ADMIN', 'COACH', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'account' },
        { href: '/dashboard/profile', labelKey: 'dashboard.nav.myProfile', icon: UserCheck, roles: ['ADMIN', 'COACH', 'CUSTOMER', 'EMPLOYEE', 'CASHIER', 'RECEPTION', 'FRONT_DESK'], section: 'account' },
        { href: '/dashboard/member/progress', labelKey: 'dashboard.nav.myProgress', icon: Activity, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/plans', labelKey: 'dashboard.nav.myWorkoutPlans', icon: Dumbbell, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/diets', labelKey: 'dashboard.nav.myDietPlans', icon: Utensils, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/feedback', labelKey: 'dashboard.nav.myFeedback', icon: MessageSquare, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/history', labelKey: 'dashboard.nav.history', icon: ClipboardList, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/member/achievements', labelKey: 'dashboard.nav.achievements', icon: Trophy, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/subscription', labelKey: 'dashboard.nav.subscription', icon: ShieldAlert, roles: ['CUSTOMER'], section: 'account' },
        { href: '/dashboard/support', labelKey: 'dashboard.nav.support', icon: MessageSquare, roles: ['CUSTOMER'], section: 'account' },
    ] as const;

    const navSections: Array<{ key: string; labelKey: TranslationKey }> = [
        { key: 'operations', labelKey: 'dashboard.sections.operations' },
        { key: 'people', labelKey: 'dashboard.sections.people' },
        { key: 'finance', labelKey: 'dashboard.sections.finance' },
        { key: 'coaching', labelKey: 'dashboard.sections.coaching' },
        { key: 'account', labelKey: 'dashboard.sections.account' },
    ] as const;

    const filteredNav = navItems.filter(item => item.roles.includes(user.role)).filter((item) => {
        if (!isBlockedCustomer) return true;
        return BLOCKED_ALLOWED_ROUTES.some((route) => item.href.startsWith(route));
    });

    return (
        <div className="flex min-h-dvh bg-background">
            {/* Mobile top bar */}
            <div
                className="fixed top-0 inset-x-0 z-[70] flex items-center justify-between px-4 py-3 md:hidden bg-card"
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={sidebarOpen ? t('common.closeMenu') : t('common.openMenu')}
                    >
                        {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Dumbbell size={16} className="text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground">{t('common.appName')}</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Mobile top-bar actions if any */}
                </div>
            </div>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed md:static z-[65] top-[60px] h-[calc(100dvh-60px)] md:top-0 md:h-auto w-64 overflow-y-auto
                    transform [transform:var(--sidebar-transform)] md:[transform:translateX(0)]
                    transition-transform duration-300 ease-in-out
                    bg-card
                    ${sidebarOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'}
                    md:pointer-events-auto md:visible
                `}
                style={{
                    insetInlineStart: 0,
                    borderInlineStart: direction === 'rtl' ? '1px solid hsl(var(--border))' : undefined,
                    borderInlineEnd: direction === 'rtl' ? undefined : '1px solid hsl(var(--border))',
                    ['--sidebar-transform' as string]: sidebarOpen ? 'translateX(0)' : direction === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)',
                }}
            >
                <div className="min-h-full">
                    <div className="p-5 pb-4 border-b border-border relative">
                        <div className={`mb-3 flex items-center gap-2 ${direction === 'rtl' ? 'justify-start' : 'justify-end'}`}>
                            <LanguageToggle />
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

                    <nav className="p-3">
                        {navSections.map((section) => {
                            const sectionItems = filteredNav.filter((item) => item.section === section.key);
                            if (sectionItems.length === 0) return null;

                            return (
                                <div key={section.key} className="mb-4 last:mb-0">
                                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                        {t(section.labelKey)}
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
                                                        {t(item.labelKey)}
                                                        {showDot && <span className="h-2 w-2 rounded-full bg-red-500" aria-label={t('common.newActivity')} />}
                                                    </span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </nav>

                    <div className="px-3 pb-4">
                        <button
                            onClick={logout}
                            className="nav-link w-full text-destructive hover:!text-destructive hover:!bg-destructive/10"
                        >
                            <LogOut size={18} />
                            <span>{t('common.logout')}</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-h-0 overflow-auto p-4 pt-20 md:p-8 md:pt-8 bg-background">
                {canUseChat && !pathname.startsWith('/dashboard/chat') && (
                    <button
                        type="button"
                        onClick={() => setChatOpen(true)}
                        className="fixed bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200"
                        style={{ insetInlineEnd: '1.5rem' }}
                        aria-label={t('dashboard.openChat')}
                    >
                        <MessageCircle size={24} />
                        {chatNewConversations > 0 && (
                            <span
                                className="absolute -top-1 flex min-w-[20px] h-[20px] px-1.5 items-center justify-center rounded-full bg-black text-white text-xs font-bold border-2 border-background shadow-sm"
                                style={{ insetInlineEnd: '-0.25rem' }}
                            >
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
