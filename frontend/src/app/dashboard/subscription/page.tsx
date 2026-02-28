'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ShieldAlert, Snowflake, Lock, ArrowRightCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

type SubscriptionStatus = 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'NONE';

export default function CustomerSubscriptionPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const router = useRouter();
    const txt = locale === 'ar' ? {
        noActivePlan: '?? ???? ??? ????',
        noExpirySet: '?? ???? ????? ?????? ????',
        title: '????????',
        subtitle: '???? ?????? ???????? ????? ??????? ?????.',
        currentPlan: '????? ???????',
        status: '??????',
        expiryDate: '????? ????????',
        requests: '????? ????????',
        requestRenewal: '??? ?????',
        requestFreeze: '??? ?????',
        requestUnfreeze: '??? ????? ?????',
        contactSupport: '????? ?? ?????',
        requestExtension: '??? ?????',
        requestActivationExtend: '??? ????? / ?????',
        lockPrefix: '??????? ????? ?????? ????',
        lockSuffix: '???? ??????.',
        activeTitle: '???????? ???',
        activeDesc: '???? ????. ????? ??? ????? ?? ????? ?? ??? ??????.',
        frozenTitle: '???????? ?????',
        frozenDesc: '??????? ????? ??????. ???? ????? ??????? ???????? ?????? ??????.',
        expiredTitle: '???????? ?????',
        expiredDesc: '????? ???????. ???? ??????? ?? ??????? ????????? ?? ??????? ???? ???????.',
        noneTitle: '?? ???? ?????? ???',
        noneDesc: '?? ???? ?????? ??? ????? ??????. ???? ??????? ?? ???????.',
        statusActive: '???',
        statusFrozen: '?????',
        statusExpired: '?????',
        statusNone: '?? ????',
    } : {
        noActivePlan: 'No active plan',
        noExpirySet: 'No expiry date set',
        title: 'Subscription',
        subtitle: 'View subscription details and request plan actions.',
        currentPlan: 'Current Plan',
        status: 'Status',
        expiryDate: 'Expiry Date',
        requests: 'Subscription Requests',
        requestRenewal: 'Request Renewal',
        requestFreeze: 'Request Freeze',
        requestUnfreeze: 'Request Unfreeze',
        contactSupport: 'Contact Support',
        requestExtension: 'Request Extension',
        requestActivationExtend: 'Request Activation / Extend',
        lockPrefix: 'Requests are temporarily locked for',
        lockSuffix: 'more hour(s).',
        activeTitle: 'Subscription Active',
        activeDesc: 'Your plan is active. You can request an extension or freeze from this page.',
        frozenTitle: 'Subscription Frozen',
        frozenDesc: 'Your subscription is currently frozen. Request unfreeze to restore full access.',
        expiredTitle: 'Subscription Expired',
        expiredDesc: 'Your subscription has expired. Request renewal or extension to continue using all features.',
        noneTitle: 'No Active Subscription',
        noneDesc: 'No active subscription is linked to your account. Request activation or extension.',
        statusActive: 'Active',
        statusFrozen: 'Frozen',
        statusExpired: 'Expired',
        statusNone: 'None',
    };

    const status = (user?.subscription_status || 'NONE') as SubscriptionStatus;
    const planName = user?.subscription_plan_name || txt.noActivePlan;
    const parsedEndDate = user?.subscription_end_date ? new Date(user.subscription_end_date) : null;
    const hasValidEndDate = Boolean(parsedEndDate && !Number.isNaN(parsedEndDate.getTime()));
    const statusLabelMap: Record<SubscriptionStatus, string> = {
        ACTIVE: txt.statusActive,
        FROZEN: txt.statusFrozen,
        EXPIRED: txt.statusExpired,
        NONE: txt.statusNone,
    };
    const endDateLabel = hasValidEndDate
        ? formatDate(parsedEndDate!, {
            weekday: 'short',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
        : txt.noExpirySet;

    const statusMeta = {
        ACTIVE: {
            title: txt.activeTitle,
            description: txt.activeDesc,
            cardClass: 'border-emerald-500/30 bg-emerald-500/5',
            badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        },
        FROZEN: {
            title: txt.frozenTitle,
            description: txt.frozenDesc,
            cardClass: 'border-blue-500/30 bg-blue-500/5',
            badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        },
        EXPIRED: {
            title: txt.expiredTitle,
            description: txt.expiredDesc,
            cardClass: 'border-red-500/30 bg-red-500/5',
            badgeClass: 'border-red-500/30 bg-red-500/10 text-red-400',
        },
        NONE: {
            title: txt.noneTitle,
            description: txt.noneDesc,
            cardClass: 'border-border bg-muted/20',
            badgeClass: 'border-border bg-muted/30 text-muted-foreground',
        },
    }[status];

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

    const openRequest = (type: 'renewal' | 'unfreeze' | 'freeze' | 'extend') => {
        if (isRequestLocked) return;
        router.push(`/dashboard/support?type=${type}`);
    };

    if (!user || user.role !== 'CUSTOMER') return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{txt.subtitle}</p>
            </div>

            <div className={`kpi-card p-6 ${statusMeta.cardClass}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.currentPlan}</p>
                        <p className="text-xl font-bold text-foreground mt-1">{planName}</p>
                        <p className="text-sm text-muted-foreground mt-2">{statusMeta.description}</p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${statusMeta.badgeClass}`}>
                        <ShieldAlert size={14} />
                        {statusLabelMap[status]}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                    <div className="rounded-sm border border-border bg-card/40 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.status}</p>
                        <p className="text-sm font-semibold text-foreground mt-1">{statusMeta.title}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-card/40 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.expiryDate}</p>
                        <p className="text-sm font-semibold text-foreground mt-1 inline-flex items-center gap-2">
                            <CalendarClock size={14} className="text-primary" />
                            {endDateLabel}
                        </p>
                    </div>
                </div>
            </div>

            <div className="kpi-card p-6">
                <p className="section-chip mb-4">{txt.requests}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {status === 'ACTIVE' && (
                        <>
                            <button
                                type="button"
                                onClick={() => openRequest('renewal')}
                                className="btn-primary justify-center"
                                disabled={isRequestLocked}
                            >
                                <ArrowRightCircle size={16} />
                                {txt.requestRenewal}
                            </button>
                            <button
                                type="button"
                                onClick={() => openRequest('freeze')}
                                className="btn-secondary justify-center"
                                disabled={isRequestLocked}
                            >
                                <Snowflake size={16} />
                                {txt.requestFreeze}
                            </button>
                        </>
                    )}

                    {status === 'FROZEN' && (
                        <>
                            <button
                                type="button"
                                onClick={() => openRequest('unfreeze')}
                                className="btn-primary justify-center"
                                disabled={isRequestLocked}
                            >
                                <ArrowRightCircle size={16} />
                                {txt.requestUnfreeze}
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard/support')}
                                className="btn-secondary justify-center"
                            >
                                {txt.contactSupport}
                            </button>
                        </>
                    )}

                    {status === 'EXPIRED' && (
                        <>
                            <button
                                type="button"
                                onClick={() => openRequest('renewal')}
                                className="btn-primary justify-center"
                                disabled={isRequestLocked}
                            >
                                <ArrowRightCircle size={16} />
                                {txt.requestRenewal}
                            </button>
                            <button
                                type="button"
                                onClick={() => openRequest('extend')}
                                className="btn-secondary justify-center"
                                disabled={isRequestLocked}
                            >
                                {txt.requestExtension}
                            </button>
                        </>
                    )}

                    {status === 'NONE' && (
                        <>
                            <button
                                type="button"
                                onClick={() => openRequest('extend')}
                                className="btn-primary justify-center"
                                disabled={isRequestLocked}
                            >
                                <Lock size={16} />
                                {txt.requestActivationExtend}
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard/support')}
                                className="btn-secondary justify-center"
                            >
                                {txt.contactSupport}
                            </button>
                        </>
                    )}
                </div>

                {isRequestLocked && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        {txt.lockPrefix} {lockHoursRemaining} {txt.lockSuffix}
                    </p>
                )}
            </div>
        </div>
    );
}
