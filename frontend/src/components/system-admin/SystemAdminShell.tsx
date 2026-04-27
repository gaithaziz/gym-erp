'use client';

import Link from 'next/link';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

type SystemAdminTab = 'stats' | 'gyms' | 'users' | 'audit';

const tabs: Array<{
    key: SystemAdminTab;
    href: string;
    label: { en: string; ar: string };
}> = [
    { key: 'stats', href: '/dashboard/system/stats', label: { en: 'Stats', ar: 'الإحصاءات' } },
    { key: 'gyms', href: '/dashboard/system/gyms', label: { en: 'Gyms', ar: 'الصالات' } },
    { key: 'users', href: '/dashboard/system/users', label: { en: 'Users', ar: 'المستخدمون' } },
    { key: 'audit', href: '/dashboard/system/audit', label: { en: 'Audit', ar: 'التدقيق' } },
];

interface SystemAdminShellProps {
    title: string;
    description: string;
    activeTab: SystemAdminTab;
    lastUpdated: Date | null;
    onRefresh?: () => void | Promise<void>;
    refreshing?: boolean;
    actionSlot?: React.ReactNode;
    children: React.ReactNode;
}

export function SystemAdminShell({
    title,
    description,
    activeTab,
    lastUpdated,
    onRefresh,
    refreshing = false,
    actionSlot,
    children,
}: SystemAdminShellProps) {
    const { locale, formatDate } = useLocale();

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            <ShieldAlert size={14} />
                            {locale === 'ar' ? 'وضع المشرف الأعلى' : 'Super Admin'}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground font-serif">{title}</h1>
                            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <span className="rounded-md border border-border bg-muted/30 px-2 py-1">
                                {locale === 'ar' ? 'آخر تحديث' : 'Last updated'}:{' '}
                                <span className="font-mono text-foreground">
                                    {lastUpdated ? formatDate(lastUpdated, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--'}
                                </span>
                            </span>
                            {refreshing ? (
                                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                                    {locale === 'ar' ? 'جارٍ التحديث' : 'Refreshing'}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {actionSlot}
                        {onRefresh ? (
                            <button
                                type="button"
                                onClick={onRefresh}
                                disabled={refreshing}
                                className="btn-ghost flex items-center gap-2 border border-border"
                            >
                                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                                {locale === 'ar' ? 'تحديث' : 'Refresh'}
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                    {tabs.map((tab) => {
                        const isActive = tab.key === activeTab;
                        return (
                            <Link
                                key={tab.key}
                                href={tab.href}
                                className={`rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                                    isActive
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-background/70 text-muted-foreground hover:text-foreground hover:border-primary/40'
                                }`}
                            >
                                {locale === 'ar' ? tab.label.ar : tab.label.en}
                            </Link>
                        );
                    })}
                </div>
            </section>

            {children}
        </div>
    );
}

export function SystemAdminAccessDenied() {
    const { locale } = useLocale();

    return (
        <div className="flex min-h-[50vh] items-center justify-center">
            <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <ShieldAlert size={22} />
                </div>
                <h2 className="text-xl font-bold text-foreground font-serif">
                    {locale === 'ar' ? 'هذه الصفحة للمشرف الأعلى فقط' : 'Super admin access required'}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    {locale === 'ar'
                        ? 'لا تملك صلاحية الوصول إلى قسم النظام العالمي.'
                        : 'You do not have permission to access the global system area.'}
                </p>
            </div>
        </div>
    );
}
