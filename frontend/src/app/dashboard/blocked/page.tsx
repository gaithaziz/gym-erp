'use client';

import Link from 'next/link';
import { ShieldAlert, Lock, Snowflake, CalendarX } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function SubscriptionBlockedPage() {
    const { user, logout } = useAuth();

    const reason = user?.block_reason;
    const statusLabel = user?.subscription_status || 'NONE';
    const planName = user?.subscription_plan_name || 'No active plan';
    const endDate = user?.subscription_end_date
        ? new Date(user.subscription_end_date).toLocaleDateString()
        : null;

    const reasonMeta =
        reason === 'SUBSCRIPTION_EXPIRED'
            ? {
                title: 'Subscription Expired',
                description: 'Your subscription expired. Request renewal to regain access to the app.',
                icon: CalendarX,
            }
            : reason === 'SUBSCRIPTION_FROZEN'
                ? {
                    title: 'Subscription Frozen',
                    description: 'Your subscription is currently frozen. Request unfreeze to continue.',
                    icon: Snowflake,
                }
                : {
                    title: 'No Active Subscription',
                    description: 'No active subscription was found. Request activation to continue using the app.',
                    icon: Lock,
                };

    const ReasonIcon = reasonMeta.icon;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="kpi-card p-8">
                <div className="flex items-start justify-between gap-3 mb-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access Restricted</p>
                        <h1 className="text-2xl font-bold text-foreground font-serif mt-2">Account Temporarily Blocked</h1>
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
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Status</p>
                        <p className="text-sm font-bold text-foreground mt-1">{statusLabel}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Plan</p>
                        <p className="text-sm font-bold text-foreground mt-1">{planName}</p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/10 p-3">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">End Date</p>
                        <p className="text-sm font-bold text-foreground mt-1">{endDate || 'N/A'}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Link href="/dashboard/support?type=renewal" className="btn-primary text-center">
                        Request Renewal
                    </Link>
                    <Link href="/dashboard/support?type=unfreeze" className="btn-ghost text-center">
                        Request Unfreeze
                    </Link>
                </div>

                <button
                    type="button"
                    className="btn-ghost w-full mt-3 text-destructive hover:!text-destructive"
                    onClick={logout}
                >
                    Logout
                </button>
            </div>
        </div>
    );
}
