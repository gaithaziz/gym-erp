'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useFeedback } from '@/components/FeedbackProvider';

interface Announcement {
    id: string;
    title: string;
    body: string;
    audience: 'ALL' | 'CUSTOMERS' | 'COACHES' | 'STAFF';
    is_published: boolean;
    push_enabled: boolean;
    published_at?: string | null;
    updated_at?: string | null;
}

export default function AnnouncementsPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [audienceFilter, setAudienceFilter] = useState<'ALL' | 'CUSTOMERS' | 'COACHES' | 'STAFF' | 'ALL_VISIBLE'>('ALL_VISIBLE');

    const txt = useMemo(() => locale === 'ar'
        ? {
            title: 'الإعلانات',
            subtitle: 'تابع رسائل النادي المهمة والتنبيهات العامة.',
            refresh: 'تحديث',
            allVisible: 'الكل',
            all: 'الكل',
            customers: 'العملاء',
            coaches: 'المدربون',
            staff: 'الموظفون',
            noItems: 'لا توجد إعلانات حالياً.',
            published: 'منشور',
        }
        : {
            title: 'Announcements',
            subtitle: 'Stay updated with important gym notices and general updates.',
            refresh: 'Refresh',
            allVisible: 'All Visible',
            all: 'All',
            customers: 'Customers',
            coaches: 'Coaches',
            staff: 'Staff',
            noItems: 'No announcements yet.',
            published: 'Published',
        }, [locale]);

    const canUseCurrent = !!user;

    const loadItems = useCallback(async () => {
        if (!canUseCurrent) return;
        setLoading(true);
        try {
            const params = audienceFilter === 'ALL_VISIBLE' ? {} : { audience: audienceFilter };
            const response = await api.get('/announcements', { params });
            setItems(response.data?.data || []);
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل الإعلانات.' : 'Failed to load announcements.', 'error');
        } finally {
            setLoading(false);
        }
    }, [audienceFilter, canUseCurrent, locale, showToast]);

    useEffect(() => {
        void loadItems();
    }, [loadItems]);

    if (!user) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.published}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                </div>
                <button type="button" onClick={() => void loadItems()} className="btn-secondary">
                    <RefreshCw size={16} />
                    {txt.refresh}
                </button>
            </div>

            <div className="kpi-card p-4 flex flex-wrap gap-2">
                {(['ALL_VISIBLE', 'ALL', 'CUSTOMERS', 'COACHES', 'STAFF'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setAudienceFilter(value)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            audienceFilter === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {value === 'ALL_VISIBLE'
                            ? txt.allVisible
                            : value === 'ALL'
                                ? txt.all
                                : value === 'CUSTOMERS'
                                    ? txt.customers
                                    : value === 'COACHES'
                                        ? txt.coaches
                                        : txt.staff}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="kpi-card p-6 text-sm text-muted-foreground">Loading...</div>
                ) : items.length ? (
                    items.map((item) => (
                        <div key={item.id} className="kpi-card p-6">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Bell size={16} className="text-primary" />
                                        <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{item.body}</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {item.audience}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {item.published_at ? formatDate(item.published_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="kpi-card p-6 text-sm text-muted-foreground">{txt.noItems}</div>
                )}
            </div>
        </div>
    );
}
