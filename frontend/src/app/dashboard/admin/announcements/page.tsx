'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellPlus, RefreshCw, Save, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useFeedback } from '@/components/FeedbackProvider';
import { BranchSelector } from '@/components/BranchSelector';
import { useBranch } from '@/context/BranchContext';

interface Announcement {
    id: string;
    title: string;
    body: string;
    audience: 'ALL' | 'CUSTOMERS' | 'COACHES' | 'STAFF';
    target_scope: 'ALL_BRANCHES' | 'BRANCH';
    branch_id?: string | null;
    branch_name?: string | null;
    is_published: boolean;
    push_enabled: boolean;
    published_at?: string | null;
    updated_at?: string | null;
}

const DEFAULT_FORM = {
    title: '',
    body: '',
    audience: 'ALL' as Announcement['audience'],
    target_scope: 'ALL_BRANCHES' as Announcement['target_scope'],
    push_enabled: true,
};

export default function AdminAnnouncementsPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const { branches, isLoading: branchesLoading } = useBranch();
    const [items, setItems] = useState<Announcement[]>([]);
    const [localBranches, setLocalBranches] = useState<typeof branches>([]);
    const [branchFetchAttempted, setBranchFetchAttempted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [announcementBranchId, setAnnouncementBranchId] = useState('all');
    const resolvedBranches = branches.length ? branches : localBranches;

    useEffect(() => {
        if (form.target_scope !== 'BRANCH') {
            setAnnouncementBranchId('all');
            return;
        }
        if (announcementBranchId === 'all') {
            setAnnouncementBranchId(resolvedBranches[0]?.id || 'all');
        }
    }, [announcementBranchId, form.target_scope, resolvedBranches]);

    useEffect(() => {
        if (!user || branchesLoading || branches.length > 0 || branchFetchAttempted) return;
        let cancelled = false;

        const normalizeBranches = (response: { data?: unknown }) => {
            if (Array.isArray(response.data)) return response.data;
            const data = response.data as { data?: unknown } | undefined;
            return Array.isArray(data?.data) ? data?.data : [];
        };

        const loadBranches = async () => {
            for (const endpoint of ['/system/branches', '/hr/branches']) {
                try {
                    const response = await api.get(endpoint);
                    if (cancelled) return;
                    const branchData = normalizeBranches(response);
                    if (branchData.length > 0) {
                        setLocalBranches(branchData);
                        return;
                    }
                } catch {
                    // Try the next endpoint.
                }
            }

            if (!cancelled) {
                setLocalBranches([]);
            }
        };

        setBranchFetchAttempted(true);
        void loadBranches();
        return () => {
            cancelled = true;
        };
    }, [branchFetchAttempted, branches.length, branchesLoading, user]);

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
            targetScope: 'استهداف الفروع',
            allBranches: 'كل الفروع',
            selectedBranch: 'فرع محدد',
            targetHint: 'اختر كل الفروع للإعلان العام، أو فرعًا محددًا إذا أردت التقييد.',
            customers: 'العملاء',
            coaches: 'المدربون',
            staff: 'الموظفون',
            branch: 'اختر الفرع',
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
            targetScope: 'Branch Target',
            allBranches: 'All Branches',
            selectedBranch: 'Specific branch',
            targetHint: 'Choose all branches for a global announcement, or a specific branch to limit it.',
            customers: 'Customers',
            coaches: 'Coaches',
            staff: 'Staff',
            branch: 'Choose branch',
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
        if (form.target_scope === 'BRANCH' && announcementBranchId === 'all') {
            showToast(locale === 'ar' ? 'اختر فرعًا للإعلان.' : 'Select a branch for the announcement.', 'error');
            return;
        }
        if (form.target_scope === 'BRANCH' && resolvedBranches.length === 0) {
            showToast(locale === 'ar' ? 'لا توجد فروع متاحة للاختيار.' : 'No branches are available to choose from.', 'error');
            return;
        }
        setIsSaving(true);
        try {
                await api.post('/admin/announcements', {
                    title: form.title.trim(),
                    body: form.body.trim(),
                    audience: form.audience,
                    target_scope: form.target_scope,
                    branch_id: form.target_scope === 'BRANCH' && announcementBranchId !== 'all' ? announcementBranchId : null,
                    push_enabled: form.push_enabled,
                });
                setForm(DEFAULT_FORM);
                setAnnouncementBranchId('all');
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
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.targetScope}</label>
                        <select
                            className="input-dark"
                            value={form.target_scope}
                            onChange={(event) => {
                                const targetScope = event.target.value as Announcement['target_scope'];
                                setForm((current) => ({ ...current, target_scope: targetScope }));
                                if (targetScope === 'ALL_BRANCHES') {
                                    setAnnouncementBranchId('all');
                                } else if (announcementBranchId === 'all') {
                                    setAnnouncementBranchId(resolvedBranches[0]?.id || 'all');
                                }
                            }}
                        >
                            <option value="ALL_BRANCHES">{txt.allBranches}</option>
                            <option value="BRANCH">{txt.selectedBranch}</option>
                        </select>
                        <p className="mt-1 text-[11px] text-muted-foreground">{txt.targetHint}</p>
                    </div>
                    <div>
                        {form.target_scope === 'BRANCH' ? (
                            <>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.branch}</label>
                                <BranchSelector branches={resolvedBranches} selectedBranchId={announcementBranchId} onSelect={setAnnouncementBranchId} />
                            </>
                        ) : (
                            <div className="rounded-xl border border-border bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                                {locale === 'ar' ? 'سيظهر الإعلان في كل الفروع.' : 'The announcement will be visible in all branches.'}
                            </div>
                        )}
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
                                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {item.target_scope === 'ALL_BRANCHES'
                                            ? txt.allBranches
                                            : item.branch_name || txt.selectedBranch}
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
