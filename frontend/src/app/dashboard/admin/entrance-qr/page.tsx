'use client';

import { useMemo, useState } from 'react';
import { Copy, QrCode, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const STORAGE_KEYS = {
    client: 'gymerp.qr.client_entrance_id',
    staffStart: 'gymerp.qr.staff_start_id',
    staffEnd: 'gymerp.qr.staff_end_id',
} as const;

const DEFAULT_IDS = {
    client: 'gym-main-entrance',
    staffStart: 'staff-start-main',
    staffEnd: 'staff-end-main',
} as const;

type PayloadType = 'client_entry' | 'staff_check_in' | 'staff_check_out';

const createPayload = (type: PayloadType, kioskId: string) => JSON.stringify({ type, kiosk_id: kioskId });

export default function AdminEntranceQrPage() {
    const { t } = useLocale();
    const { showToast } = useFeedback();
    const [clientId, setClientId] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_IDS.client;
        return localStorage.getItem(STORAGE_KEYS.client) || DEFAULT_IDS.client;
    });
    const [staffStartId, setStaffStartId] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_IDS.staffStart;
        return localStorage.getItem(STORAGE_KEYS.staffStart) || DEFAULT_IDS.staffStart;
    });
    const [staffEndId, setStaffEndId] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_IDS.staffEnd;
        return localStorage.getItem(STORAGE_KEYS.staffEnd) || DEFAULT_IDS.staffEnd;
    });

    const payloads = useMemo(() => {
        const client = createPayload('client_entry', clientId);
        const staffStart = createPayload('staff_check_in', staffStartId);
        const staffEnd = createPayload('staff_check_out', staffEndId);
        return { client, staffStart, staffEnd };
    }, [clientId, staffEndId, staffStartId]);

    const saveIds = () => {
        if (!KIOSK_ID_PATTERN.test(clientId) || !KIOSK_ID_PATTERN.test(staffStartId) || !KIOSK_ID_PATTERN.test(staffEndId)) {
            showToast(t('entranceQr.invalidKioskId'), 'error');
            return;
        }

        localStorage.setItem(STORAGE_KEYS.client, clientId.trim());
        localStorage.setItem(STORAGE_KEYS.staffStart, staffStartId.trim());
        localStorage.setItem(STORAGE_KEYS.staffEnd, staffEndId.trim());
        showToast(t('entranceQr.saved'), 'success');
    };

    const copyText = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            showToast(t('entranceQr.copied'), 'success');
        } catch {
            showToast(t('entranceQr.copyFailed'), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t('entranceQr.title')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('entranceQr.subtitle')}
                    </p>
                </div>
                <button type="button" onClick={saveIds} className="btn-primary">
                    <Save size={16} /> {t('entranceQr.saveIds')}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <section className="kpi-card p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <QrCode size={16} className="text-primary" />
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{t('entranceQr.clientQr')}</h2>
                    </div>
                    <input value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-dark font-mono" />
                    <div className="rounded-sm border border-border bg-background p-4 flex justify-center">
                        <QRCodeSVG value={payloads.client} size={220} includeMargin />
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase font-mono text-muted-foreground mb-1">{t('entranceQr.payload')}</p>
                        <p className="text-xs font-mono break-all text-foreground">{payloads.client}</p>
                    </div>
                    <button type="button" className="btn-ghost w-full" onClick={() => copyText(payloads.client)}>
                        <Copy size={14} /> {t('entranceQr.copyPayload')}
                    </button>
                </section>

                <section className="kpi-card p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <QrCode size={16} className="text-primary" />
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{t('entranceQr.staffStartQr')}</h2>
                    </div>
                    <input value={staffStartId} onChange={(e) => setStaffStartId(e.target.value)} className="input-dark font-mono" />
                    <div className="rounded-sm border border-border bg-background p-4 flex justify-center">
                        <QRCodeSVG value={payloads.staffStart} size={220} includeMargin />
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase font-mono text-muted-foreground mb-1">{t('entranceQr.payload')}</p>
                        <p className="text-xs font-mono break-all text-foreground">{payloads.staffStart}</p>
                    </div>
                    <button type="button" className="btn-ghost w-full" onClick={() => copyText(payloads.staffStart)}>
                        <Copy size={14} /> {t('entranceQr.copyPayload')}
                    </button>
                </section>

                <section className="kpi-card p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <QrCode size={16} className="text-primary" />
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{t('entranceQr.staffEndQr')}</h2>
                    </div>
                    <input value={staffEndId} onChange={(e) => setStaffEndId(e.target.value)} className="input-dark font-mono" />
                    <div className="rounded-sm border border-border bg-background p-4 flex justify-center">
                        <QRCodeSVG value={payloads.staffEnd} size={220} includeMargin />
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase font-mono text-muted-foreground mb-1">{t('entranceQr.payload')}</p>
                        <p className="text-xs font-mono break-all text-foreground">{payloads.staffEnd}</p>
                    </div>
                    <button type="button" className="btn-ghost w-full" onClick={() => copyText(payloads.staffEnd)}>
                        <Copy size={14} /> {t('entranceQr.copyPayload')}
                    </button>
                </section>
            </div>
        </div>
    );
}
