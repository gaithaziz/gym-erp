'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ShieldAlert, Snowflake, Lock, ArrowRightCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type SubscriptionStatus = 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'NONE';

export default function CustomerSubscriptionPage() {
    const { user } = useAuth();
    const router = useRouter();

    const status = (user?.subscription_status || 'NONE') as SubscriptionStatus;
    const planName = user?.subscription_plan_name || 'No active plan';
    const parsedEndDate = user?.subscription_end_date ? new Date(user.subscription_end_date) : null;
    const hasValidEndDate = Boolean(parsedEndDate && !Number.isNaN(parsedEndDate.getTime()));
    const endDateLabel = hasValidEndDate
        ? parsedEndDate!.toLocaleDateString(undefined, {
            weekday: 'short',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
        : 'No expiry date set';

    const statusMeta = {
        ACTIVE: {
            title: 'Subscription Active',
            description: 'Your plan is active. You can request an extension or freeze from this page.',
            cardClass: 'border-emerald-500/30 bg-emerald-500/5',
            badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        },
        FROZEN: {
            title: 'Subscription Frozen',
            description: 'Your subscription is currently frozen. Request unfreeze to restore full access.',
            cardClass: 'border-blue-500/30 bg-blue-500/5',
            badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        },
        EXPIRED: {
            title: 'Subscription Expired',
            description: 'Your subscription has expired. Request renewal or extension to continue using all features.',
            cardClass: 'border-red-500/30 bg-red-500/5',
            badgeClass: 'border-red-500/30 bg-red-500/10 text-red-400',
        },
        NONE: {
            title: 'No Active Subscription',
            description: 'No active subscription is linked to your account. Request activation or extension.',
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
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Subscription</h1>
                <p className="text-sm text-muted-foreground mt-1">View subscription details and request plan actions.</p>
            </div>

            <div className={`kpi-card p-6 ${statusMeta.cardClass}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Current Plan</p>
                        <p className="text-xl font-bold text-foreground mt-1">{planName}</p>
                        <p className="text-sm text-muted-foreground mt-2">{statusMeta.description}</p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${statusMeta.badgeClass}`}>
                        <ShieldAlert size={14} />
                        {status}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                    <div className="rounded-sm border border-border bg-card/40 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
                        <p className="text-sm font-semibold text-foreground mt-1">{statusMeta.title}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-card/40 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Expiry Date</p>
                        <p className="text-sm font-semibold text-foreground mt-1 inline-flex items-center gap-2">
                            <CalendarClock size={14} className="text-primary" />
                            {endDateLabel}
                        </p>
                    </div>
                </div>
            </div>

            <div className="kpi-card p-6">
                <p className="section-chip mb-4">Subscription Requests</p>
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
                                Request Renewal
                            </button>
                            <button
                                type="button"
                                onClick={() => openRequest('freeze')}
                                className="btn-secondary justify-center"
                                disabled={isRequestLocked}
                            >
                                <Snowflake size={16} />
                                Request Freeze
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
                                Request Unfreeze
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard/support')}
                                className="btn-secondary justify-center"
                            >
                                Contact Support
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
                                Request Renewal
                            </button>
                            <button
                                type="button"
                                onClick={() => openRequest('extend')}
                                className="btn-secondary justify-center"
                                disabled={isRequestLocked}
                            >
                                Request Extension
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
                                Request Activation / Extend
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard/support')}
                                className="btn-secondary justify-center"
                            >
                                Contact Support
                            </button>
                        </>
                    )}
                </div>

                {isRequestLocked && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Requests are temporarily locked for {lockHoursRemaining} more hour(s).
                    </p>
                )}
            </div>
        </div>
    );
}
