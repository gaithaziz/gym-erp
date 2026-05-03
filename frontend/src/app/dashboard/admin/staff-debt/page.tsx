'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { ArrowUpCircle, CheckCircle2, Plus, RotateCcw, Search, Wallet } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
import { BranchSelector } from '@/components/BranchSelector';
import { useBranch } from '@/context/BranchContext';
import { useLocale } from '@/context/LocaleContext';
import { getBranchParams } from '@/lib/branch';
import { downloadBlob } from '@/lib/download';

interface StaffDebtListItem {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    branch_id: string | null;
    branch_name: string | null;
    account_id: string | null;
    current_balance: number;
    entry_count: number;
    last_entry_at: string | null;
}

interface StaffDebtSummary {
    staff_count: number;
    accounts_count: number;
    total_balance: number;
    debtors_count: number;
    entries_count: number;
}

interface StaffDebtEntry {
    id: string;
    account_id: string;
    entry_type: 'ADVANCE' | 'DEDUCTION' | 'REPAYMENT' | 'SETTLEMENT' | 'ADJUSTMENT';
    amount: number;
    balance_before: number;
    balance_after: number;
    month: number;
    year: number;
    notes: string | null;
    created_at: string;
    created_by_user_id: string;
    branch_id: string | null;
}

interface StaffDebtMonthlyBalance {
    id: string;
    account_id: string;
    month: number;
    year: number;
    opening_balance: number;
    advances_total: number;
    deductions_total: number;
    repayments_total: number;
    settlements_total: number;
    adjustments_total: number;
    closing_balance: number;
    entry_count: number;
    updated_at: string;
}

interface StaffDebtDetail {
    user: {
        id: string;
        full_name: string;
        email: string;
        role: string;
        branch_id: string | null;
        branch_name: string | null;
    };
    account: {
        id: string;
        user_id: string;
        branch_id: string | null;
        current_balance: number;
        notes: string | null;
        updated_at: string | null;
    } | null;
    entries: StaffDebtEntry[];
    monthly_balances: StaffDebtMonthlyBalance[];
}

const today = new Date();
const defaultMonth = String(today.getMonth() + 1).padStart(2, '0');
const defaultYear = String(today.getFullYear());

export default function StaffDebtPage() {
    const { showToast } = useFeedback();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const { locale, formatDate, formatNumber } = useLocale();

    const [loading, setLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [items, setItems] = useState<StaffDebtListItem[]>([]);
    const [summary, setSummary] = useState<StaffDebtSummary>({
        staff_count: 0,
        accounts_count: 0,
        total_balance: 0,
        debtors_count: 0,
        entries_count: 0,
    });
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [detail, setDetail] = useState<StaffDebtDetail | null>(null);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 300);
    const listFetchSeqRef = useRef(0);
    const detailFetchSeqRef = useRef(0);
    const [form, setForm] = useState({
        amount: '',
        month: defaultMonth,
        year: defaultYear,
        notes: '',
    });

    const txt = locale === 'ar'
        ? {
            title: 'ديون الموظفين',
            subtitle: 'سجل الديون فقط',
            staff: 'الموظفون',
            search: 'بحث',
            branch: 'الفرع',
            balance: 'الرصيد',
            entries: 'القيود',
            lastEntry: 'آخر حركة',
            noStaff: 'لا يوجد موظفون',
            noDetail: 'اختر موظفًا لعرض التفاصيل',
            currentBalance: 'الرصيد الحالي',
            monthlyHistory: 'التاريخ الشهري',
            ledger: 'سجل الحركات',
            addEntry: 'إضافة دين',
            saveEntry: 'حفظ الدين',
            amount: 'المبلغ',
            month: 'الشهر',
            year: 'السنة',
            notes: 'ملاحظات',
            debtOnlyHint: 'يتم تسجيل نوع دين واحد فقط.',
            advance: 'دين',
            deduction: 'خصم',
            repayment: 'سداد',
            settlement: 'تسوية',
            adjustment: 'تعديل',
            overdue: 'مستحق',
            settled: 'مسدد',
            accounts: 'حسابات',
            totalDebt: 'إجمالي الدين',
            debtors: 'المدينون',
            opened: 'تم الفتح',
            balanceAfter: 'الرصيد بعد القيد',
            balanceBefore: 'الرصيد قبل القيد',
            noEntries: 'لا توجد حركات بعد',
            noBalances: 'لا يوجد سجل شهري بعد',
            exportCsv: 'تصدير CSV',
            exportPdf: 'تصدير PDF',
            requiredAmount: 'يجب إدخال مبلغ صحيح.',
            failedLoad: 'فشل في تحميل ديون الموظفين.',
            failedDetail: 'فشل في تحميل تفاصيل الموظف.',
            failedSave: 'فشل في حفظ القيد.',
        }
        : {
            title: 'Employee Debt',
            subtitle: 'Track debts only',
            staff: 'Staff',
            search: 'Search',
            branch: 'Branch',
            balance: 'Balance',
            entries: 'Entries',
            lastEntry: 'Last entry',
            noStaff: 'No staff members found',
            noDetail: 'Select a staff member to see details',
            currentBalance: 'Current balance',
            monthlyHistory: 'Monthly history',
            ledger: 'Ledger',
            addEntry: 'Add debt',
            saveEntry: 'Save debt',
            amount: 'Amount',
            month: 'Month',
            year: 'Year',
            notes: 'Notes',
            debtOnlyHint: 'Only one debt type is recorded here.',
            advance: 'Debt',
            deduction: 'Deduction',
            repayment: 'Repayment',
            settlement: 'Settlement',
            adjustment: 'Adjustment',
            overdue: 'Outstanding',
            settled: 'Settled',
            accounts: 'Accounts',
            totalDebt: 'Total debt',
            debtors: 'Debtors',
            opened: 'Opened',
            balanceAfter: 'Balance after',
            balanceBefore: 'Balance before',
            noEntries: 'No entries yet',
            noBalances: 'No monthly balances yet',
            exportCsv: 'Export CSV',
            exportPdf: 'Export PDF',
            requiredAmount: 'Please enter a valid amount.',
            failedLoad: 'Failed to load employee debt.',
            failedDetail: 'Failed to load employee debt details.',
            failedSave: 'Failed to save debt entry.',
        };

    const getTypeLabel = (type: StaffDebtEntry['entry_type']) => {
        const labels: Record<StaffDebtEntry['entry_type'], string> = {
            ADVANCE: txt.advance,
            DEDUCTION: txt.deduction,
            REPAYMENT: txt.repayment,
            SETTLEMENT: txt.settlement,
            ADJUSTMENT: txt.adjustment,
        };
        return labels[type];
    };

    const isAutoPayrollDeduction = (entry: StaffDebtEntry) =>
        entry.entry_type === 'DEDUCTION' && Boolean(entry.notes?.toLowerCase().includes('automatic payroll debt deduction'));

    const autoPayrollDeductionLabel = locale === 'ar'
        ? 'خصم تلقائي من الراتب'
        : 'Auto salary deduction';

    const selectedItem = useMemo(
        () => items.find((item) => item.user_id === selectedUserId) || null,
        [items, selectedUserId]
    );

    const fetchList = useCallback(async () => {
        const requestSeq = ++listFetchSeqRef.current;
        setListLoading(true);
        try {
            const res = await api.get('/hr/staff-debt', {
                params: {
                    ...getBranchParams(selectedBranchId),
                    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                },
            });
            if (requestSeq !== listFetchSeqRef.current) return;
            const payload = res.data?.data || {};
            setItems(payload.items || []);
            setSummary(payload.summary || {
                staff_count: 0,
                accounts_count: 0,
                total_balance: 0,
                debtors_count: 0,
                entries_count: 0,
            });
        } catch (err) {
            if (requestSeq !== listFetchSeqRef.current) return;
            console.error(err);
            showToast(txt.failedLoad, 'error');
        } finally {
            if (requestSeq === listFetchSeqRef.current) {
                setListLoading(false);
                setLoading(false);
            }
        }
    }, [debouncedSearch, selectedBranchId, showToast, txt.failedLoad]);

    const fetchDetail = useCallback(async (userId: string) => {
        const requestSeq = ++detailFetchSeqRef.current;
        setDetailLoading(true);
        try {
            const res = await api.get(`/hr/staff-debt/staff/${userId}`);
            if (requestSeq !== detailFetchSeqRef.current) return;
            setDetail(res.data?.data || null);
        } catch (err) {
            if (requestSeq !== detailFetchSeqRef.current) return;
            console.error(err);
            showToast(txt.failedDetail, 'error');
        } finally {
            if (requestSeq === detailFetchSeqRef.current) {
                setDetailLoading(false);
            }
        }
    }, [showToast, txt.failedDetail]);

    useEffect(() => {
        void fetchList();
    }, [fetchList]);

    useEffect(() => {
        if (!items.length) {
            setSelectedUserId(null);
            setDetail(null);
            return;
        }
        if (!selectedUserId || !items.some((item) => item.user_id === selectedUserId)) {
            setSelectedUserId(items[0].user_id);
        }
    }, [items, selectedUserId]);

    useEffect(() => {
        if (!selectedUserId) return;
        void fetchDetail(selectedUserId);
    }, [fetchDetail, selectedUserId]);

    const handleSaveEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserId) return;
        if (!form.amount || Number(form.amount) === 0) {
            showToast(txt.requiredAmount, 'error');
            return;
        }
        try {
            await api.post(`/hr/staff-debt/staff/${selectedUserId}/entries`, {
                entry_type: 'ADVANCE',
                amount: Number(form.amount),
                month: Number(form.month),
                year: Number(form.year),
                notes: form.notes || null,
                branch_id: selectedBranchId !== 'all' ? selectedBranchId : undefined,
            });
            showToast(locale === 'ar' ? 'تم حفظ القيد.' : 'Debt entry saved.', 'success');
            await fetchList();
            await fetchDetail(selectedUserId);
            setForm((current) => ({
                ...current,
                amount: '',
                notes: '',
            }));
        } catch (err) {
            console.error(err);
            showToast(txt.failedSave, 'error');
        }
    };

    const exportCsv = async () => {
        try {
            const res = await api.get('/hr/staff-debt/export', {
                params: {
                    ...getBranchParams(selectedBranchId),
                    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                },
                responseType: 'blob',
            });
            downloadBlob(res.data as Blob, 'staff_debt_report.csv');
        } catch (err) {
            console.error(err);
            showToast(locale === 'ar' ? 'فشل في تصدير CSV.' : 'Failed to export CSV.', 'error');
        }
    };

    const exportPdf = async () => {
        try {
            const res = await api.get('/hr/staff-debt/export-pdf', {
                params: {
                    ...getBranchParams(selectedBranchId),
                    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                },
                responseType: 'blob',
            });
            downloadBlob(res.data as Blob, 'staff_debt_report.pdf');
        } catch (err) {
            console.error(err);
            showToast(locale === 'ar' ? 'فشل في تصدير PDF.' : 'Failed to export PDF.', 'error');
        }
    };

    const currentBranchName = selectedBranchId === 'all'
        ? (locale === 'ar' ? 'كل الفروع' : 'All branches')
        : branches.find((branch) => branch.id === selectedBranchId)?.display_name
            || branches.find((branch) => branch.id === selectedBranchId)?.name
            || (locale === 'ar' ? 'الفرع الحالي' : 'Current branch');

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
            </div>
        );
    }

    const currentBalance = detail?.account?.current_balance ?? selectedItem?.current_balance ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Wallet size={18} />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em]">{txt.title}</span>
                    </div>
                    <h1 className="mt-2 text-2xl font-bold text-foreground">{txt.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{txt.subtitle}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                        type="button"
                        onClick={exportCsv}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
                    >
                        <RotateCcw size={14} />
                        {txt.exportCsv}
                    </button>
                    <button
                        type="button"
                        onClick={exportPdf}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
                    >
                        <RotateCcw size={14} />
                        {txt.exportPdf}
                    </button>
                    <BranchSelector branches={branches} selectedBranchId={selectedBranchId} onSelect={setSelectedBranchId} />
                    <div className="relative w-full sm:w-72">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            aria-label={txt.search}
                            className="input-dark pl-9"
                            placeholder={txt.search}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.staff}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{summary.staff_count}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{currentBranchName}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.accounts}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{summary.accounts_count}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{locale === 'ar' ? 'حسابات مفتوحة' : 'Open accounts'}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.totalDebt}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(summary.total_balance)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">JOD</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.debtors}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{summary.debtors_count}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{locale === 'ar' ? 'أرصدة إيجابية' : 'Positive balances'}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.entries}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{summary.entries_count}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{locale === 'ar' ? 'كل الحركات' : 'All ledger movements'}</p>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">{txt.staff}</h2>
                            <p className="text-xs text-muted-foreground">{locale === 'ar' ? 'اختر موظفًا لإدارة ديونه.' : 'Pick a staff member to manage debt.'}</p>
                        </div>
                        {listLoading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-start table-dark">
                            <thead>
                                <tr>
                                    <th>{locale === 'ar' ? 'الاسم' : 'Name'}</th>
                                    <th>{txt.branch}</th>
                                    <th>{txt.balance}</th>
                                    <th>{txt.entries}</th>
                                    <th>{txt.lastEntry}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                            {txt.noStaff}
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item) => {
                                        const isSelected = item.user_id === selectedUserId;
                                        const hasBalance = item.current_balance > 0;
                                        return (
                                            <tr
                                                key={item.user_id}
                                                className={isSelected ? 'bg-primary/10' : 'cursor-pointer hover:bg-muted/40'}
                                                onClick={() => setSelectedUserId(item.user_id)}
                                            >
                                                <td>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground">{item.full_name}</span>
                                                        <span className="text-xs text-muted-foreground">{item.email}</span>
                                                    </div>
                                                </td>
                                                <td className="text-sm text-muted-foreground">
                                                    {item.branch_name || '-'}
                                                </td>
                                                <td>
                                                    <span className={`font-mono text-sm font-semibold ${hasBalance ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                        {formatNumber(item.current_balance)} JOD
                                                    </span>
                                                </td>
                                                <td className="text-sm text-muted-foreground">{item.entry_count}</td>
                                                <td className="text-sm text-muted-foreground">
                                                    {item.last_entry_at ? formatDate(item.last_entry_at) : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-4">
                        {detailLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            </div>
                        ) : detail ? (
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.currentBalance}</p>
                                        <h2 className="mt-1 text-xl font-semibold text-foreground">{detail.user.full_name}</h2>
                                        <p className="text-xs text-muted-foreground">{detail.user.email}</p>
                                    </div>
                                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${currentBalance > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                        {formatNumber(currentBalance)} JOD
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                                        <p className="text-xs text-muted-foreground">{txt.branch}</p>
                                        <p className="mt-1 font-medium text-foreground">{detail.user.branch_name || '-'}</p>
                                    </div>
                                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                                        <p className="text-xs text-muted-foreground">{locale === 'ar' ? 'الحساب' : 'Account'}</p>
                                        <p className="mt-1 font-medium text-foreground">{detail.account ? txt.opened : (locale === 'ar' ? 'لم يُفتح بعد' : 'Not opened yet')}</p>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveEntry} className="space-y-3 rounded-2xl border border-border bg-background p-4">
                                    <div className="flex items-center gap-2">
                                        <Plus size={16} className="text-primary" />
                                        <h3 className="text-sm font-semibold text-foreground">{txt.addEntry}</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{txt.debtOnlyHint}</p>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-muted-foreground">{txt.amount}</label>
                                            <input
                                                aria-label={txt.amount}
                                                className="input-dark"
                                                type="number"
                                                step="0.01"
                                                value={form.amount}
                                                onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-muted-foreground">{txt.month}</label>
                                            <input
                                                aria-label={txt.month}
                                                className="input-dark"
                                                type="number"
                                                min="1"
                                                max="12"
                                                value={form.month}
                                                onChange={(e) => setForm((current) => ({ ...current, month: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-muted-foreground">{txt.year}</label>
                                            <input
                                                aria-label={txt.year}
                                                className="input-dark"
                                                type="number"
                                                min="2000"
                                                value={form.year}
                                                onChange={(e) => setForm((current) => ({ ...current, year: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-muted-foreground">{txt.notes}</label>
                                        <textarea
                                            aria-label={txt.notes}
                                            className="input-dark min-h-[88px]"
                                            value={form.notes}
                                            onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-3 pt-1">
                                        <button type="submit" className="btn-primary">
                                            <CheckCircle2 size={16} /> {txt.saveEntry}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                {txt.noDetail}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2">
                            <Wallet size={16} className="text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">{txt.monthlyHistory}</h3>
                        </div>
                        {detail?.monthly_balances?.length ? (
                            <div className="mt-4 space-y-3">
                                {detail.monthly_balances.map((balance) => (
                                    <div key={balance.id} className="rounded-xl border border-border bg-muted/20 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-foreground">
                                                    {balance.month.toString().padStart(2, '0')}/{balance.year}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {balance.entry_count} {locale === 'ar' ? 'قيد' : 'entries'}
                                                </p>
                                            </div>
                                            <div className="font-mono text-sm font-semibold text-foreground">
                                                {formatNumber(balance.closing_balance)} JOD
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                            <div className="rounded-lg bg-background p-2">
                                                <p className="text-muted-foreground">{locale === 'ar' ? 'الافتتاح' : txt.opened}</p>
                                                <p className="mt-1 font-medium text-foreground">{formatNumber(balance.opening_balance)} JOD</p>
                                            </div>
                                            <div className="rounded-lg bg-background p-2">
                                                <p className="text-muted-foreground">{txt.balanceAfter}</p>
                                                <p className="mt-1 font-medium text-foreground">{formatNumber(balance.closing_balance)} JOD</p>
                                            </div>
                                            <div className="rounded-lg bg-background p-2">
                                                <p className="text-muted-foreground">{txt.advance}</p>
                                                <p className="mt-1 font-medium text-foreground">{formatNumber(balance.advances_total)} JOD</p>
                                            </div>
                                            <div className="rounded-lg bg-background p-2">
                                                <p className="text-muted-foreground">{txt.deduction}</p>
                                                <p className="mt-1 font-medium text-foreground">{formatNumber(balance.deductions_total)} JOD</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                {txt.noBalances}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2">
                            <ArrowUpCircle size={16} className="text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">{txt.ledger}</h3>
                        </div>
                        {detail?.entries?.length ? (
                            <div className="mt-4 space-y-3">
                                {detail.entries.map((entry) => {
                                    const isPositive = entry.balance_after > entry.balance_before;
                                    return (
                                        <div key={entry.id} className="rounded-xl border border-border bg-muted/20 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{getTypeLabel(entry.entry_type)}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatDate(entry.created_at)} • {entry.month.toString().padStart(2, '0')}/{entry.year}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    {isAutoPayrollDeduction(entry) && (
                                                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                                                            {autoPayrollDeductionLabel}
                                                        </span>
                                                    )}
                                                    <div className={`font-mono text-sm font-semibold ${isPositive ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                        {isPositive ? '+' : '-'}{formatNumber(entry.amount)} JOD
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                                <div className="rounded-lg bg-background p-2">
                                                    <p className="text-muted-foreground">{txt.balanceBefore}</p>
                                                    <p className="mt-1 font-medium text-foreground">{formatNumber(entry.balance_before)} JOD</p>
                                                </div>
                                                <div className="rounded-lg bg-background p-2">
                                                    <p className="text-muted-foreground">{txt.balanceAfter}</p>
                                                    <p className="mt-1 font-medium text-foreground">{formatNumber(entry.balance_after)} JOD</p>
                                                </div>
                                            </div>
                                            {entry.notes && (
                                                <p className="mt-2 text-xs text-muted-foreground">{entry.notes}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                {txt.noEntries}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
