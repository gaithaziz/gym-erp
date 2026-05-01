'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, BookOpen, Plus, RefreshCw, Save, Ticket } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useFeedback } from '@/components/FeedbackProvider';
import MemberSearchSelect from '@/components/MemberSearchSelect';

interface MemberOption {
    id: string;
    full_name: string;
    email?: string;
}

interface PerkAccount {
    id: string;
    user_id: string;
    perk_key: string;
    perk_label: string;
    period_type: 'MONTHLY' | 'CONTRACT';
    total_allowance: number;
    used_allowance: number;
    remaining_allowance: number;
    contract_starts_at?: string | null;
    contract_ends_at?: string | null;
    monthly_reset_day?: number | null;
    note?: string | null;
    is_active: boolean;
    updated_at?: string | null;
}

interface PerkResponse {
    member_id: string;
    summary: {
        total_accounts: number;
        total_remaining: number;
        total_used: number;
    };
    accounts: PerkAccount[];
}

interface LedgerResponse {
    perk_account: PerkAccount;
    entries: Array<{
        id: string;
        used_amount: number;
        note?: string | null;
        used_at?: string | null;
        used_by_user_id?: string | null;
    }>;
}

const DEFAULT_FORM = {
    user_id: '',
    perk_key: '',
    perk_label: '',
    period_type: 'CONTRACT' as 'MONTHLY' | 'CONTRACT',
    total_allowance: '1',
    monthly_reset_day: '',
    note: '',
};

export default function PerksPage() {
    const { user } = useAuth();
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const canManage = ['ADMIN', 'MANAGER', 'COACH'].includes(user?.role || '');
    const [members, setMembers] = useState<MemberOption[]>([]);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [perkData, setPerkData] = useState<PerkResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [ledgerData, setLedgerData] = useState<LedgerResponse | null>(null);
    const [useAmount, setUseAmount] = useState('1');
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState(DEFAULT_FORM);

    const txt = locale === 'ar'
        ? {
            title: 'المزايا والعدادات',
            subtitle: 'تتبع الزيارات المجانية، وفحوصات InBody، والجلسات الخاصة، وسجل الاستخدام.',
            summary: 'الملخص',
            totalAccounts: 'إجمالي الحسابات',
            totalRemaining: 'المتبقي',
            totalUsed: 'المستخدم',
            create: 'إضافة ميزة',
            perkKey: 'مفتاح الميزة',
            perkLabel: 'اسم الميزة',
            periodType: 'نوع الفترة',
            monthly: 'شهري',
            contract: 'عقد',
            allowance: 'الكمية',
            monthlyResetDay: 'يوم إعادة الضبط',
            note: 'ملاحظة',
            targetMember: 'العضو',
            selectMember: 'اختر العضو',
            refresh: 'تحديث',
            saving: 'جارٍ الحفظ...',
            addPerk: 'حفظ الميزة',
            use: 'استخدم',
            useAmount: 'كمية الاستخدام',
            noPerks: 'لا توجد مزايا بعد.',
            ledger: 'سجل الاستخدام',
            noLedger: 'لا يوجد سجل حتى الآن.',
            active: 'نشط',
        }
        : {
            title: 'Perks & Counters',
            subtitle: 'Track free guest visits, InBody tests, private sessions, and the usage ledger.',
            summary: 'Summary',
            totalAccounts: 'Total Accounts',
            totalRemaining: 'Remaining',
            totalUsed: 'Used',
            create: 'Add Perk',
            perkKey: 'Perk Key',
            perkLabel: 'Perk Label',
            periodType: 'Period Type',
            monthly: 'Monthly',
            contract: 'Contract',
            allowance: 'Allowance',
            monthlyResetDay: 'Reset Day',
            note: 'Note',
            targetMember: 'Member',
            selectMember: 'Select Member',
            refresh: 'Refresh',
            saving: 'Saving...',
            addPerk: 'Save Perk',
            use: 'Use',
            useAmount: 'Use Amount',
            noPerks: 'No perks yet.',
            ledger: 'Usage Ledger',
            noLedger: 'No usage entries yet.',
            active: 'Active',
        };

    const targetMemberId = selectedMemberId || user?.id || '';

    const loadMembers = useCallback(async () => {
        if (!canManage) return;
        try {
            const response = await api.get('/hr/members');
            setMembers((response.data?.data || []).map((member: { id: string; full_name: string; email?: string }) => ({
                id: member.id,
                full_name: member.full_name,
                email: member.email,
            })));
        } catch {
            setMembers([]);
        }
    }, [canManage]);

    const loadPerks = useCallback(async () => {
        if (!targetMemberId) return;
        setLoading(true);
        try {
            const response = await api.get('/membership/perks', { params: { member_id: targetMemberId } });
            setPerkData(response.data?.data || null);
        } catch (error) {
            console.error(error);
            showToast(locale === 'ar' ? 'فشل في تحميل المزايا.' : 'Failed to load perks.', 'error');
        } finally {
            setLoading(false);
        }
    }, [locale, showToast, targetMemberId]);

    useEffect(() => {
        void loadMembers();
    }, [loadMembers]);

    useEffect(() => {
        void loadPerks();
    }, [loadPerks]);

    useEffect(() => {
        if (!targetMemberId && user?.id) setSelectedMemberId(user.id);
    }, [targetMemberId, user?.id]);

    const openLedger = async (accountId: string) => {
        try {
            const response = await api.get(`/membership/perks/${accountId}/ledger`);
            setLedgerData(response.data?.data || null);
        } catch {
            showToast(locale === 'ar' ? 'فشل في تحميل السجل.' : 'Failed to load ledger.', 'error');
        }
    };

    const createPerk = async () => {
        if (!form.user_id || !form.perk_key.trim() || !form.perk_label.trim()) {
            showToast(locale === 'ar' ? 'أكمل الحقول المطلوبة.' : 'Complete the required fields.', 'error');
            return;
        }
        setIsCreating(true);
        try {
            await api.post('/membership/perks', {
                user_id: form.user_id,
                perk_key: form.perk_key.trim(),
                perk_label: form.perk_label.trim(),
                period_type: form.period_type,
                total_allowance: Number(form.total_allowance || 0),
                monthly_reset_day: form.monthly_reset_day ? Number(form.monthly_reset_day) : null,
                note: form.note.trim() || null,
            });
            setForm(DEFAULT_FORM);
            await loadPerks();
        } catch {
            showToast(locale === 'ar' ? 'فشل في إضافة الميزة.' : 'Failed to add perk.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleUsePerk = async (accountId: string) => {
        const amount = Number(useAmount || 1);
        try {
            await api.post(`/membership/perks/${accountId}/use`, { used_amount: amount });
            await loadPerks();
            if (ledgerData?.perk_account.id === accountId) {
                await openLedger(accountId);
            }
        } catch {
            showToast(locale === 'ar' ? 'فشل في تسجيل الاستخدام.' : 'Failed to record usage.', 'error');
        }
    };

    const selectedMember = members.find((member) => member.id === form.user_id);

    if (!user) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{txt.summary}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{txt.subtitle}</p>
                </div>
                <button type="button" onClick={() => void loadPerks()} className="btn-secondary">
                    <RefreshCw size={16} />
                    {txt.refresh}
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalAccounts}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{perkData?.summary.total_accounts || 0}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalRemaining}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{perkData?.summary.total_remaining || 0}</p>
                </div>
                <div className="kpi-card p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{txt.totalUsed}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{perkData?.summary.total_used || 0}</p>
                </div>
            </div>

            {canManage && (
                <div className="kpi-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Plus size={16} className="text-primary" />
                        <h2 className="text-lg font-bold text-foreground">{txt.create}</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.targetMember}</label>
                            <MemberSearchSelect
                                members={members}
                                value={form.user_id}
                                onChange={(value) => setForm((current) => ({ ...current, user_id: value }))}
                                placeholder={txt.selectMember}
                                allowClear
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.useAmount}</label>
                            <input className="input-dark" value={useAmount} onChange={(event) => setUseAmount(event.target.value)} />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.perkKey}</label>
                            <input className="input-dark" value={form.perk_key} onChange={(event) => setForm((current) => ({ ...current, perk_key: event.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.perkLabel}</label>
                            <input className="input-dark" value={form.perk_label} onChange={(event) => setForm((current) => ({ ...current, perk_label: event.target.value }))} />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.periodType}</label>
                            <select className="input-dark" value={form.period_type} onChange={(event) => setForm((current) => ({ ...current, period_type: event.target.value as 'MONTHLY' | 'CONTRACT' }))}>
                                <option value="CONTRACT">{txt.contract}</option>
                                <option value="MONTHLY">{txt.monthly}</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.allowance}</label>
                            <input className="input-dark" type="number" min="0" value={form.total_allowance} onChange={(event) => setForm((current) => ({ ...current, total_allowance: event.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.monthlyResetDay}</label>
                            <input className="input-dark" type="number" min="1" max="31" value={form.monthly_reset_day} onChange={(event) => setForm((current) => ({ ...current, monthly_reset_day: event.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{txt.note}</label>
                        <textarea className="input-dark min-h-24" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">{selectedMember?.full_name || txt.selectMember}</p>
                        <button type="button" onClick={() => void createPerk()} disabled={isCreating} className="btn-primary">
                            <Save size={16} />
                            {isCreating ? txt.saving : txt.addPerk}
                        </button>
                    </div>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                    {loading ? (
                        <div className="kpi-card p-6 text-sm text-muted-foreground">Loading...</div>
                    ) : perkData?.accounts?.length ? (
                        perkData.accounts.map((account) => (
                            <div key={account.id} className="kpi-card p-6 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <p className="section-chip mb-2">{account.perk_key}</p>
                                        <h3 className="text-lg font-bold text-foreground">{account.perk_label}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {account.period_type} · {account.remaining_allowance} / {account.total_allowance} {locale === 'ar' ? 'متبقي' : 'remaining'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => void openLedger(account.id)} className="btn-secondary">
                                            <BookOpen size={16} />
                                            {txt.ledger}
                                        </button>
                                        <button type="button" onClick={() => void handleUsePerk(account.id)} className="btn-primary">
                                            <Ticket size={16} />
                                            {txt.use}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-xl border border-border bg-card/40 p-3">
                                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.totalAccounts}</p>
                                        <p className="text-sm font-semibold text-foreground mt-1">{account.used_allowance}</p>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card/40 p-3">
                                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.totalRemaining}</p>
                                        <p className="text-sm font-semibold text-foreground mt-1">{account.remaining_allowance}</p>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card/40 p-3">
                                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{txt.periodType}</p>
                                        <p className="text-sm font-semibold text-foreground mt-1">{account.period_type}</p>
                                    </div>
                                </div>

                                {account.note && <p className="text-xs text-muted-foreground">{account.note}</p>}
                            </div>
                        ))
                    ) : (
                        <div className="kpi-card p-6 text-sm text-muted-foreground">{txt.noPerks}</div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="kpi-card p-6">
                        <div className="flex items-center gap-2">
                            <BadgeCheck size={18} className="text-primary" />
                            <h2 className="text-lg font-bold text-foreground">{txt.ledger}</h2>
                        </div>
                        {ledgerData ? (
                            <div className="mt-4 space-y-3">
                                <div className="rounded-xl border border-border bg-background/60 p-4">
                                    <p className="text-sm font-semibold text-foreground">{ledgerData.perk_account.perk_label}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {ledgerData.perk_account.remaining_allowance} / {ledgerData.perk_account.total_allowance}
                                    </p>
                                </div>
                                {ledgerData.entries.length ? ledgerData.entries.map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-border bg-card/50 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-foreground">{entry.used_amount}</p>
                                            <p className="text-xs text-muted-foreground">{entry.used_at ? formatDate(entry.used_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</p>
                                        </div>
                                        {entry.note && <p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>}
                                    </div>
                                )) : (
                                    <p className="text-sm text-muted-foreground">{txt.noLedger}</p>
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
