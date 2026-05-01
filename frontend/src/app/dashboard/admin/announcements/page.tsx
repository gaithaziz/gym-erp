'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellPlus, RefreshCw, Save, Send } from 'lucide-react';
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

const DEFAULT_FORM = {
    title: '',
    body: '',
    audience: 'ALL' as Announcement['audience'],
    push_enabled: true,
};

export default function AdminAnnouncementsPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState(DEFAULT_FORM);

    const txt = locale === 'ar'
        ? {
            title: 'إدارة الإعلانات',
            subtitle: 'أنشئ الإعلانات وانشرها مع إشعار فوري للمتابعين المناسبين.',
            refresh: 'تحديث',
            create: 'إضافة إعلان',
            save: 'حفظ ونشر',
            saving: 'جارٍ الحفظ...',
            audience: 'الفئة',
            all: 'الكل',
            customers: 'العملاء',
            coaches: 'المدربون',
            staff: 'الموظفون',
            titleLabel: 'العنوان',
            bodyLabel: 'النص',
            pushEnabled: 'إرسال إشعار فوري',
            noItems: 'لا توجد إعلانات بعد.',
            publishNow: 'نشر الآن',
            published: 'منشور',
        }
        : {
            title: 'Announcements Admin',
            subtitle: 'Create announcements and push them instantly to the right audience.',
            refresh: 'Refresh',
            create: 'Create Announcement',
            save: 'Save & Publish',
            saving: 'Saving...',
            audience: 'Audience',
            all: 'All',
            customers: 'Customers',
            coaches: 'Coaches',
            staff: 'Staff',
            titleLabel: 'Title',
            bodyLabel: 'Body',
            pushEnabled: 'Send push notification',
            noItems: 'No announcements yet.',
            publishNow: 'Publish now',
            published: 'Published',
        };

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/admin/announcements');
            setItems(response.data?.data || []);
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل الإعلانات.' : 'Failed to load announcements.', 'error');
        } finally {
            setLoading(false);
        }
    }, [locale, showToast]);

    useEffect(() => {
        void loadItems();
    }, [loadItems]);

    const createAnnouncement = async () => {
        if (!form.title.trim() || !form.body.trim()) {
            showToast(locale === 'ar' ? 'أكمل العنوان والنص.' : 'Complete the title and body.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            await api.post('/admin/announcements', {
                title: form.title.trim(),
                body: form.body.trim(),
                audience: form.audience,
                push_enabled: form.push_enabled,
            });
            setForm(DEFAULT_FORM);
            await loadItems();
        } catch {
            showToast(locale === 'ar' ? 'فشل في نشر الإعلان.' : 'Failed to publish announcement.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const publishAnnouncement = async (announcementId: string) => {
        try {
            await api.post(`/admin/announcements/${announcementId}/publish`);
            await loadItems();
        } catch {
            showToast(locale === 'ar' ? 'فشل في النشر.' : 'Failed to publish.', 'error');
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.create}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                </div>
                <button type="button" onClick={() => void loadItems()} className="btn-secondary">
                    <RefreshCw size={16} />
                    {txt.refresh}
                </button>
            </div>

            <div className="kpi-card p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <BellPlus size={16} className="text-primary" />
                    <h2 className="text-lg font-bold text-foreground">{txt.create}</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.titleLabel}</label>
                        <input className="input-dark" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.audience}</label>
                        <select className="input-dark" value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value as Announcement['audience'] }))}>
                            <option value="ALL">{txt.all}</option>
                            <option value="CUSTOMERS">{txt.customers}</option>
                            <option value="COACHES">{txt.coaches}</option>
                            <option value="STAFF">{txt.staff}</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.bodyLabel}</label>
                    <textarea className="input-dark min-h-32" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={form.push_enabled} onChange={(event) => setForm((current) => ({ ...current, push_enabled: event.target.checked }))} />
                    {txt.pushEnabled}
                </label>
                <div className="flex justify-end">
                    <button type="button" onClick={() => void createAnnouncement()} disabled={isSaving} className="btn-primary">
                        <Save size={16} />
                        {isSaving ? txt.saving : txt.save}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="kpi-card p-6 text-sm text-muted-foreground">Loading...</div>
                ) : items.length ? (
                    items.map((item) => (
                        <div key={item.id} className="kpi-card p-6">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{item.body}</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {item.audience}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${item.is_published ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-border bg-muted/30 text-muted-foreground'}`}>
                                            {item.is_published ? txt.published : 'Draft'}
                                        </span>
                                        <button type="button" onClick={() => void publishAnnouncement(item.id)} className="btn-secondary">
                                            <Send size={16} />
                                            {txt.publishNow}
                                        </button>
                                    </div>
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
