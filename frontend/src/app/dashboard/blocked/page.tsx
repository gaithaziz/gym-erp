'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Lock, Snowflake, CalendarX } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/context/LocaleContext';

export default function SubscriptionBlockedPage() {
    const { user, logout } = useAuth();
    const { locale } = useLocale();
    const router = useRouter();

    const reason = user?.block_reason;
    const statusLabel = user?.subscription_status || 'NONE';
    const planName = user?.subscription_plan_name || 'No active plan';
    const endDate = user?.subscription_end_date
        ? new Date(user.subscription_end_date).toLocaleDateString()
        : null;

    const reasonMeta =
        reason === 'SUBSCRIPTION_EXPIRED'
            ? {
                title: locale === 'ar' ? 'انتهى الاشتراك' : 'Subscription Expired',
                description: locale === 'ar'
                    ? 'انتهى اشتراكك. اطلب التجديد لاستعادة الوصول إلى التطبيق.'
                    : 'Your subscription expired. Request renewal to regain access to the app.',
                icon: CalendarX,
            }
            : reason === 'SUBSCRIPTION_FROZEN'
                ? {
                    title: locale === 'ar' ? 'الاشتراك مجمّد' : 'Subscription Frozen',
                    description: locale === 'ar'
                        ? 'اشتراكك مجمّد حالياً. اطلب إلغاء التجميد للمتابعة.'
                        : 'Your subscription is currently frozen. Request unfreeze to continue.',
                    icon: Snowflake,
                }
                : {
                    title: locale === 'ar' ? 'لا يوجد اشتراك فعّال' : 'No Active Subscription',
                    description: locale === 'ar'
                        ? 'لم يتم العثور على اشتراك فعّال. اطلب التفعيل للمتابعة.'
                        : 'No active subscription was found. Request activation to continue using the app.',
                    icon: Lock,
                };

    const txt = {
        accessRestricted: locale === 'ar' ? 'الوصول مقيّد' : 'Access Restricted',
        accountBlocked: locale === 'ar' ? 'الحساب محجوب مؤقتاً' : 'Account Temporarily Blocked',
        status: locale === 'ar' ? 'الحالة' : 'Status',
        plan: locale === 'ar' ? 'الخطة' : 'Plan',
        endDate: locale === 'ar' ? 'تاريخ الانتهاء' : 'End Date',
        na: locale === 'ar' ? 'غير متاح' : 'N/A',
        requestRenewal: locale === 'ar' ? 'طلب تجديد' : 'Request Renewal',
        requestUnfreeze: locale === 'ar' ? 'طلب إلغاء التجميد' : 'Request Unfreeze',
        lockedPrefix: locale === 'ar' ? 'الطلبات مقفلة مؤقتاً لمدة' : 'Requests are temporarily locked for',
        lockedSuffix: locale === 'ar' ? 'ساعة إضافية.' : 'more hour(s).',
        logout: locale === 'ar' ? 'تسجيل الخروج' : 'Logout',
    };

    const ReasonIcon = reasonMeta.icon;
    const lockKey = `blocked_request_lock_${user?.id || 'anon'}`;
    const lockUntilTs = useMemo(() => {
        if (typeof window === 'undefined') return 0;
        return Number(localStorage.getItem(lockKey) || 0);
    }, [lockKey]);
    const [nowTs, setNowTs] = useState(0);

    useEffect(() => {
        const tick = () => setNowTs(Date.now());
        const timeoutId = window.setTimeout(tick, 0);
        const intervalId = window.setInterval(tick, 60_000);
        return () => {
            window.clearTimeout(timeoutId);
            window.clearInterval(intervalId);
        };
    }, []);

    const isRequestLocked = nowTs < lockUntilTs;
    const lockHoursRemaining = isRequestLocked ? Math.ceil((lockUntilTs - nowTs) / (1000 * 60 * 60)) : 0;

    const openRequest = (type: 'renewal' | 'unfreeze') => {
        if (isRequestLocked) return;
        router.push(`/dashboard/support?type=${type}`);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="kpi-card p-8">
                <div className="flex items-start justify-between gap-3 mb-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{txt.accessRestricted}</p>
                        <h1 className="text-2xl font-bold text-foreground font-serif mt-2">{txt.accountBlocked}</h1>
                    </div>
                    <ShieldAlert className="text-destructive" size={24} />
                </div>

                <div className="rounded-sm border border-border bg-muted/20 p-4 mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <ReasonIcon size={16} className="text-primary" />
                        <p className="text-sm font-semibold text-foreground">{reasonMeta.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{reasonMeta.description}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{txt.status}</p>
                        <p className="text-sm font-bold text-foreground mt-1">{statusLabel}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{txt.plan}</p>
                        <p className="text-sm font-bold text-foreground mt-1">{planName}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">{txt.endDate}</p>
                        <p className="text-sm font-bold text-foreground mt-1">{endDate || txt.na}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => openRequest('renewal')}
                        className="btn-primary text-center disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isRequestLocked}
                    >
                        {txt.requestRenewal}
                    </button>
                    <button
                        type="button"
                        onClick={() => openRequest('unfreeze')}
                        className="btn-primary text-center disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isRequestLocked}
                    >
                        {txt.requestUnfreeze}
                    </button>
                </div>
                {isRequestLocked && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {txt.lockedPrefix} {lockHoursRemaining} {txt.lockedSuffix}
                    </p>
                )}

                <button
                    type="button"
                    className="btn-ghost w-full mt-3 text-destructive hover:!text-destructive"
                    onClick={logout}
                >
                    {txt.logout}
                </button>
            </div>
        </div>
    );
}
