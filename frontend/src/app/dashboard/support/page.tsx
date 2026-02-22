'use client';

import { useSearchParams } from 'next/navigation';
import { MessageSquareWarning } from 'lucide-react';

const SUPPORT_PHONE = '+1 (000) 000-0000';
const SUPPORT_EMAIL = 'support@gym-erp.local';

export default function SupportPage() {
    const searchParams = useSearchParams();
    const type = searchParams.get('type');

    const requestType = type === 'unfreeze' ? 'Unfreeze Request' : 'Renewal Request';
    const requestMessage =
        type === 'unfreeze'
            ? 'Please contact support to request unfreezing your subscription.'
            : 'Please contact support to request subscription renewal.';

    return (
        <div className="max-w-2xl mx-auto">
            <div className="kpi-card p-8 space-y-5">
                <div className="flex items-center gap-3">
                    <MessageSquareWarning size={20} className="text-primary" />
                    <h1 className="text-xl font-bold text-foreground font-serif">Support Request</h1>
                </div>

                <div className="rounded-sm border border-border bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Request Type</p>
                    <p className="text-base font-semibold text-foreground mt-1">{requestType}</p>
                    <p className="text-sm text-muted-foreground mt-2">{requestMessage}</p>
                </div>

                <div className="rounded-sm border border-border bg-muted/10 p-4 space-y-2">
                    <p className="text-sm text-foreground">
                        Email: <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                    </p>
                    <p className="text-sm text-foreground">
                        Phone: <a className="text-primary hover:underline" href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}>{SUPPORT_PHONE}</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
