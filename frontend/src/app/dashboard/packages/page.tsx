'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, RefreshCw, Save, Ticket, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useFeedback } from '@/components/FeedbackProvider';
import MemberSearchSelect from '@/components/MemberSearchSelect';
import { canManagePackagesRole, canUseCoachPackagesRole } from '@/lib/roles';

interface MemberOption {
    id: string;
    full_name: string;
    email?: string;
    role?: string;
}

interface CoachingPackage {
    id: string;
    user_id: string;
    coach_id?: string | null;
    coach_name?: string | null;
    member_name?: string | null;
    package_key: string;
    package_label: string;
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    start_date?: string | null;
    end_date?: string | null;
    note?: string | null;
    is_active: boolean;
    updated_at?: string | null;
}

interface PackagesResponse {
    summary: {
        total_packages: number;
        total_remaining: number;
        total_used: number;
        total_members: number;
        total_coaches: number;
    };
    packages: CoachingPackage[];
}

interface LedgerResponse {
    package: CoachingPackage;
    entries: Array<{
        id: string;
        session_delta: number;
        note?: string | null;
        performed_at?: string | null;
        performed_by_user_id?: string | null;
    }>;
}

const DEFAULT_FORM = {
    user_id: '',
    coach_id: '',
    package_label: '',
    total_sessions: '8',
    start_date: '',
    end_date: '',
    note: '',
};

const asValue = (value: string) => (value.trim() ? value : '');

export default function PackagesPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const canManage = canManagePackagesRole(user?.role);
    const canCoachUse = canUseCoachPackagesRole(user?.role);
    const [members, setMembers] = useState<MemberOption[]>([]);
    const [coaches, setCoaches] = useState<MemberOption[]>([]);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [selectedCoachId, setSelectedCoachId] = useState('');
    const [packagesData, setPackagesData] = useState<PackagesResponse | null>(null);
    const [ledgerData, setLedgerData] = useState<LedgerResponse | null>(null);
    const [selectedPackageId, setSelectedPackageId] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [useAmount, setUseAmount] = useState('1');
    const [adjustDelta, setAdjustDelta] = useState('1');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [form, setForm] = useState(DEFAULT_FORM);
    const filterStorageKey = user?.id ? `gym-erp-packages-filters-${user.id}` : null;

    const txt = locale === 'ar'
        ? {
            title: 'التدريب الخاص',
            subtitle: 'أنشئ خطط التدريب الخاصة وراقب الجلسات المتبقية لكل عميل ومدرب.',
            summary: 'الملخص',
            totalPackages: 'إجمالي الخطط',
            totalRemaining: 'المتبقي',
            totalUsed: 'المستخدم',
            totalMembers: 'العملاء',
            totalCoaches: 'المدربون',
            create: 'خطة تدريب خاصة جديدة',
            member: 'العميل',
            coach: 'المدرب',
            selectMember: 'اختر العميل',
            selectCoach: 'اختر المدرب',
            packageKey: 'رمز الخطة',
            packageKeyAuto: 'يُنشأ رمز الخطة تلقائياً.',
            packageLabel: 'اسم الخطة',
            totalSessions: 'عدد الجلسات',
            startDate: 'تاريخ البداية',
            endDate: 'تاريخ النهاية',
            note: 'ملاحظة',
            save: 'حفظ الخطة',
            saving: 'جارٍ الحفظ...',
            refresh: 'تحديث',
            use: 'استخدام جلسة',
            useAmount: 'كمية الاستهلاك',
            ledger: 'سجل الجلسات',
            noPackages: 'لا توجد خطط تدريب خاصة بعد.',
            noLedger: 'لا يوجد سجل لهذا العنصر.',
            active: 'نشط',
            inactive: 'غير نشط',
            adjust: 'تعديل الجلسات',
            adjustHint: 'أضف أو اخصم من إجمالي الجلسات',
            applyAdjustment: 'تطبيق التعديل',
            helper: 'ابدأ باختيار العميل والمدرب، ثم أضف خطة التدريب الخاصة.',
        }
        : {
            title: 'Private Coaching',
            subtitle: 'Create private training plans and track the sessions left for each member and coach.',
            summary: 'Summary',
            totalPackages: 'Total Plans',
            totalRemaining: 'Remaining',
            totalUsed: 'Used',
            totalMembers: 'Customers',
            totalCoaches: 'Coaches',
            create: 'New Coaching Plan',
            member: 'Customer',
            coach: 'Coach',
            selectMember: 'Select Customer',
            selectCoach: 'Select Coach',
            packageKey: 'Plan Code',
            packageKeyAuto: 'Plan code is generated automatically.',
            packageLabel: 'Plan Name',
            totalSessions: 'Total Sessions',
            startDate: 'Start Date',
            endDate: 'End Date',
            note: 'Note',
            save: 'Save Plan',
            saving: 'Saving...',
            refresh: 'Refresh',
            use: 'Use Session',
            useAmount: 'Amount',
            ledger: 'Session Log',
            noPackages: 'No private coaching plans yet.',
            noLedger: 'No ledger entries for this package.',
            active: 'Active',
            inactive: 'Inactive',
            adjust: 'Adjust Sessions',
            adjustHint: 'Add or subtract from the total sessions',
            applyAdjustment: 'Apply Adjustment',
            helper: 'Start by choosing the customer and coach, then add the private training plan.',
        };

    const isCustomer = user?.role === 'CUSTOMER';
    const isCoach = user?.role === 'COACH';
    const isAdmin = canManage;
    const selectedPackage = useMemo(
        () => packagesData?.packages.find((item) => item.id === selectedPackageId) || ledgerData?.package || null,
        [ledgerData?.package, packagesData?.packages, selectedPackageId],
    );
    const hasSavedPackageFilters = Boolean(selectedMemberId || selectedCoachId || statusFilter !== 'ALL');

    useEffect(() => {
        if (!filterStorageKey || typeof window === 'undefined') return;
        const raw = window.localStorage.getItem(filterStorageKey);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as Partial<{
                selectedMemberId: string;
                selectedCoachId: string;
                statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE';
            }>;
            if (typeof parsed.selectedMemberId === 'string') setSelectedMemberId(parsed.selectedMemberId);
            if (typeof parsed.selectedCoachId === 'string') setSelectedCoachId(parsed.selectedCoachId);
            if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
        } catch {
            // Ignore malformed saved state.
        }
    }, [filterStorageKey]);

    useEffect(() => {
        if (!filterStorageKey || typeof window === 'undefined') return;
        window.localStorage.setItem(filterStorageKey, JSON.stringify({
            selectedMemberId,
            selectedCoachId,
            statusFilter,
        }));
    }, [filterStorageKey, selectedCoachId, selectedMemberId, statusFilter]);

    const resetSavedFilters = () => {
        setSelectedMemberId('');
        setSelectedCoachId('');
        setStatusFilter('ALL');
        if (filterStorageKey && typeof window !== 'undefined') {
            window.localStorage.removeItem(filterStorageKey);
        }
    };
    const filteredPackages = useMemo(() => {
        const source = packagesData?.packages || [];
        return source.filter((item) => {
            if (statusFilter === 'ACTIVE' && !item.is_active) return false;
            if (statusFilter === 'INACTIVE' && item.is_active) return false;
            return true;
        });
    }, [packagesData?.packages, statusFilter]);

    const loadMembers = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const response = await api.get('/hr/members');
            setMembers((response.data?.data || []).map((member: { id: string; full_name: string; email?: string; role?: string }) => ({
                id: member.id,
                full_name: member.full_name,
                email: member.email,
                role: member.role,
            })));
        } catch {
            setMembers([]);
        }
    }, [isAdmin]);

    const loadCoaches = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const response = await api.get('/hr/staff');
            setCoaches((response.data?.data || [])
                .filter((member: { role?: string }) => ['COACH', 'MANAGER', 'ADMIN'].includes(member.role || ''))
                .map((member: { id: string; full_name: string; email?: string; role?: string }) => ({
                    id: member.id,
                    full_name: member.full_name,
                    email: member.email,
                    role: member.role,
                })));
        } catch {
            setCoaches([]);
        }
    }, [isAdmin]);

    const loadPackages = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (isCustomer) {
                params.member_id = user.id;
            } else if (isCoach) {
                params.coach_id = user.id;
            } else {
                if (selectedMemberId) params.member_id = selectedMemberId;
                if (selectedCoachId) params.coach_id = selectedCoachId;
            }
            const response = await api.get('/coaching/packages', { params });
            setPackagesData(response.data?.data || null);
            if (!selectedPackageId) {
                const firstPackage = response.data?.data?.packages?.[0];
                setSelectedPackageId(firstPackage?.id || '');
            }
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل الباقات.' : 'Failed to load coaching packages.', 'error');
        } finally {
            setLoading(false);
        }
    }, [isCoach, isCustomer, locale, selectedCoachId, selectedMemberId, selectedPackageId, showToast, user?.id]);

    useEffect(() => {
        void loadMembers();
    }, [loadMembers]);

    useEffect(() => {
        void loadCoaches();
    }, [loadCoaches]);

    useEffect(() => {
        void loadPackages();
    }, [loadPackages]);

    const customerMembers = useMemo(() => members.filter((member) => member.role === 'CUSTOMER'), [members]);
    const coachMembers = useMemo(() => coaches, [coaches]);

    const copyFilterToForm = () => {
        setForm((current) => ({
            ...current,
            user_id: selectedMemberId || current.user_id,
            coach_id: selectedCoachId || current.coach_id,
        }));
    };

    const loadPackageIntoForm = (item: CoachingPackage) => {
        setForm({
            user_id: item.user_id,
            coach_id: item.coach_id || '',
            package_label: item.package_label,
            total_sessions: String(item.total_sessions),
            start_date: item.start_date ? item.start_date.slice(0, 16) : '',
            end_date: item.end_date ? item.end_date.slice(0, 16) : '',
            note: item.note || '',
        });
        setSelectedMemberId(item.user_id);
        setSelectedCoachId(item.coach_id || '');
        setSelectedPackageId(item.id);
    };

    const openLedger = async (packageId: string) => {
        try {
            const response = await api.get(`/coaching/packages/${packageId}/ledger`);
            setLedgerData(response.data?.data || null);
            setSelectedPackageId(packageId);
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل السجل.' : 'Failed to load ledger.', 'error');
        }
    };

    const createPackage = async () => {
        if (!form.user_id || !form.package_label.trim()) {
            showToast(locale === 'ar' ? 'أكمل الحقول المطلوبة.' : 'Complete the required fields.', 'error');
            return;
        }
        setIsCreating(true);
        try {
            await api.post('/coaching/packages', {
                user_id: form.user_id,
                coach_id: asValue(form.coach_id) || null,
                package_label: form.package_label.trim(),
                total_sessions: Number(form.total_sessions || 0),
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                note: form.note.trim() || null,
            });
            setForm(DEFAULT_FORM);
            await loadPackages();
        } catch {
            showToast(locale === 'ar' ? 'فشل في إضافة الباقة.' : 'Failed to add coaching package.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const consumePackage = async (packageId: string) => {
        const amount = Number(useAmount || 1);
        try {
            await api.post(`/coaching/packages/${packageId}/use`, { used_sessions: amount });
            await loadPackages();
            if (selectedPackageId === packageId) {
                await openLedger(packageId);
            }
        } catch {
            showToast(locale === 'ar' ? 'فشل في تسجيل الاستهلاك.' : 'Failed to record session use.', 'error');
        }
    };

    const adjustPackage = async () => {
        if (!selectedPackage || !isAdmin) return;
        const delta = Number(adjustDelta || 0);
        if (!Number.isFinite(delta) || delta === 0) return;
        setIsSaving(true);
        try {
            await api.patch(`/coaching/packages/${selectedPackage.id}`, {
                total_sessions: Math.max(0, selectedPackage.total_sessions + delta),
            });
            await loadPackages();
            await openLedger(selectedPackage.id);
            setAdjustDelta('1');
        } catch {
            showToast(locale === 'ar' ? 'فشل في تعديل الباقة.' : 'Failed to adjust the package.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{locale === 'ar' ? 'تدريب خاص' : 'Private Coaching'}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                    <p className="mt-2 text-xs text-muted-foreground max-w-2xl">{txt.helper}</p>
                </div>
                <button type="button" onClick={() => void loadPackages()} className="btn-secondary">
                    <RefreshCw size={16} />
                    {txt.refresh}
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalPackages}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{packagesData?.summary.total_packages || 0}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalRemaining}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{packagesData?.summary.total_remaining || 0}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalUsed}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{packagesData?.summary.total_used || 0}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalMembers}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{packagesData?.summary.total_members || 0}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalCoaches}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{packagesData?.summary.total_coaches || 0}</p>
                </div>
            </div>

            {isAdmin && (
                <div className="kpi-card p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid gap-4 md:grid-cols-3 flex-1">
                        <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.member}</label>
                                <MemberSearchSelect
                                    members={customerMembers}
                                    value={selectedMemberId}
                                    onChange={setSelectedMemberId}
                                    placeholder={txt.selectMember}
                                    allowClear
                                    className="w-full"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.coach}</label>
                                <MemberSearchSelect
                                    members={coachMembers}
                                    value={selectedCoachId}
                                    onChange={setSelectedCoachId}
                                    placeholder={txt.selectCoach}
                                    allowClear
                                    className="w-full"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{locale === 'ar' ? 'الحالة' : 'Status'}</label>
                                <select className="input-dark" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                                    <option value="ALL">{locale === 'ar' ? 'الكل' : 'All'}</option>
                                    <option value="ACTIVE">{txt.active}</option>
                                    <option value="INACTIVE">{txt.inactive}</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.useAmount}</label>
                                <input className="input-dark" type="number" min="1" value={useAmount} onChange={(event) => setUseAmount(event.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {hasSavedPackageFilters && (
                                <span
                                    title={locale === 'ar' ? 'الفلاتر محفوظة في هذا المتصفح' : 'Filters are saved in this browser'}
                                    className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400"
                                >
                                    {locale === 'ar' ? 'محفوظ' : 'Saved'}
                                </span>
                            )}
                            <button type="button" onClick={copyFilterToForm} className="btn-secondary">
                                {locale === 'ar' ? 'استخدم الفلاتر في النموذج' : 'Use filters in form'}
                            </button>
                            <button type="button" onClick={resetSavedFilters} className="btn-secondary">
                                {locale === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                            </button>
                            <button type="button" onClick={() => void loadPackages()} className="btn-secondary">
                                <RefreshCw size={16} />
                                {txt.refresh}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAdmin && (
                <div className="kpi-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Plus size={16} className="text-primary" />
                        <h2 className="text-lg font-bold text-foreground">{txt.create}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">{locale === 'ar' ? 'العميل والمدرب أولاً، ثم الخطة.' : 'Pick the member and coach first, then add the plan.'}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.member}</label>
                            <MemberSearchSelect
                                members={customerMembers}
                                value={form.user_id}
                                onChange={(value) => setForm((current) => ({ ...current, user_id: value }))}
                                placeholder={txt.selectMember}
                                allowClear
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.coach}</label>
                            <MemberSearchSelect
                                members={coachMembers}
                                value={form.coach_id}
                                onChange={(value) => setForm((current) => ({ ...current, coach_id: value }))}
                                placeholder={txt.selectCoach}
                                allowClear
                                className="w-full"
                            />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.packageKey}</label>
                            <input className="input-dark" value="PT - auto generated" disabled readOnly />
                            <p className="mt-1 text-[11px] text-muted-foreground">{txt.packageKeyAuto}</p>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.packageLabel}</label>
                            <input className="input-dark" value={form.package_label} onChange={(event) => setForm((current) => ({ ...current, package_label: event.target.value }))} />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.totalSessions}</label>
                            <input className="input-dark" type="number" min="0" value={form.total_sessions} onChange={(event) => setForm((current) => ({ ...current, total_sessions: event.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.startDate}</label>
                            <input className="input-dark" type="datetime-local" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.endDate}</label>
                            <input className="input-dark" type="datetime-local" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.note}</label>
                        <textarea className="input-dark min-h-24" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">{txt.adjustHint}</p>
                        <button type="button" onClick={() => void createPackage()} disabled={isCreating} className="btn-primary">
                            <Save size={16} />
                            {isCreating ? txt.saving : txt.save}
                        </button>
                    </div>
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4">
                    {loading ? (
                        <div className="kpi-card p-6 text-sm text-muted-foreground">Loading...</div>
                    ) : filteredPackages.length ? (
                        filteredPackages.map((item) => (
                            <div key={item.id} className={`kpi-card p-6 space-y-4 ${item.id === selectedPackageId ? 'border-primary/50' : ''}`}>
                                <div className="flex flex-col gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-2 inline-flex max-w-full flex-col rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary/90">
                                                {locale === 'ar' ? 'رمز الخطة' : 'Plan code'}
                                            </span>
                                            <span className="font-mono text-sm font-semibold tracking-[0.2em] text-primary break-all leading-tight">
                                                {item.package_key}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">{item.package_label}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {item.member_name || item.user_id}
                                            {item.coach_name || item.coach_id ? ` · ${item.coach_name || item.coach_id}` : ''}
                                        </p>
                                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <div className="rounded-xl border border-border bg-card/40 p-3">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{txt.totalSessions}</p>
                                                <p className="mt-1 text-sm font-semibold text-foreground">{item.total_sessions}</p>
                                            </div>
                                            <div className="rounded-xl border border-border bg-card/40 p-3">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{txt.totalUsed}</p>
                                                <p className="mt-1 text-sm font-semibold text-foreground">{item.used_sessions}</p>
                                            </div>
                                            <div className="rounded-xl border border-border bg-card/40 p-3">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{txt.totalRemaining}</p>
                                                <p className="mt-1 text-sm font-semibold text-foreground">{item.remaining_sessions}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                                        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${item.is_active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-border bg-muted/30 text-muted-foreground'}`}>
                                            {item.is_active ? txt.active : txt.inactive}
                                        </span>
                                        {isAdmin && (
                                            <button type="button" onClick={() => loadPackageIntoForm(item)} className="btn-secondary w-full justify-center">
                                                {locale === 'ar' ? 'تحميل في النموذج' : 'Load into form'}
                                            </button>
                                        )}
                                        <button type="button" onClick={() => void openLedger(item.id)} className="btn-secondary w-full justify-center">
                                            <BookOpen size={16} />
                                            {txt.ledger}
                                        </button>
                                        {canCoachUse && (
                                            <button type="button" onClick={() => void consumePackage(item.id)} className="btn-primary w-full justify-center">
                                                <Ticket size={16} />
                                                {txt.use}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                            </div>
                        ))
                    ) : (
                        <div className="kpi-card p-6 text-sm text-muted-foreground">{txt.noPackages}</div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="kpi-card p-6">
                        <div className="flex items-center gap-2">
                            <Users size={18} className="text-primary" />
                            <h2 className="text-lg font-bold text-foreground">{txt.ledger}</h2>
                        </div>
                        {selectedPackage ? (
                            <div className="mt-4 space-y-4">
                                <div className="rounded-xl border border-border bg-background/60 p-4">
                                    <p className="text-sm font-semibold text-foreground">{selectedPackage.package_label}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {selectedPackage.remaining_sessions} / {selectedPackage.total_sessions}
                                    </p>
                                </div>
                                {ledgerData?.entries?.length ? (
                                    <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                                        {ledgerData.entries.map((entry) => (
                                            <div key={entry.id} className="rounded-xl border border-border bg-card/50 p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-foreground">{entry.session_delta}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {entry.performed_at ? formatDate(entry.performed_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
                                                    </p>
                                                </div>
                                                {entry.note && <p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{txt.noLedger}</p>
                                )}

                                {isAdmin && (
                                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-foreground">{txt.adjust}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{txt.adjustHint}</p>
                                        </div>
                                        <input className="input-dark" type="number" value={adjustDelta} onChange={(event) => setAdjustDelta(event.target.value)} />
                                        <button type="button" onClick={() => void adjustPackage()} disabled={isSaving} className="btn-primary w-full justify-center">
                                            {isSaving ? txt.saving : txt.applyAdjustment}
                                        </button>
                                    </div>
                                )}
                                {isAdmin && (
                                    <button type="button" onClick={() => selectedPackage && loadPackageIntoForm(selectedPackage)} className="btn-secondary w-full justify-center">
                                        {locale === 'ar' ? 'نسخ إلى النموذج' : 'Copy into form'}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">{txt.noLedger}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
