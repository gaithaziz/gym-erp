'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, ArrowUpCircle, ArrowDownCircle, Wallet, Printer, FileText, CircleDollarSign, RotateCcw, CheckCircle2, Search, Settings2, Download } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
import { BranchSelector } from '@/components/BranchSelector';
import { useBranch } from '@/context/BranchContext';
import { useLocale } from '@/context/LocaleContext';
import { getBranchParams } from '@/lib/branch';
import { downloadBlob } from '@/lib/download';

interface Transaction {
    id: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    description: string;
    date: string;
    payment_method: string;
}

interface PayrollItem {
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    month: number;
    year: number;
    period_start: string | null;
    period_end: string | null;
    base_pay: number;
    overtime_hours: number;
    overtime_pay: number;
    commission_pay: number;
    bonus_pay: number;
    manual_deductions: number;
    leave_deductions?: number;
    debt_deductions?: number;
    deductions: number;
    total_pay: number;
    status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'PAID';
    paid_amount: number;
    pending_amount: number;
    payment_count: number;
    last_payment_at: string | null;
    approved_at: string | null;
    approved_by_user_id: string | null;
    paid_transaction_id: string | null;
    paid_at: string | null;
    paid_by_user_id: string | null;
    payments?: Array<{
        id: string;
        amount: number;
        payment_method: string;
        description: string | null;
        transaction_id: string;
        paid_at: string;
        paid_by_user_id: string;
    }>;
}

interface FinanceSummary {
    total_income: number;
    total_expenses: number;
    net_profit: number;
}

export default function FinancePage() {
    const { t, formatDate, formatNumber, formatCurrency, locale } = useLocale();
    const { showToast } = useFeedback();
    const { branches, selectedBranchId, setSelectedBranchId } = useBranch();
    const DEFAULT_PAGE_SIZE = 50;
    const PAGE_SIZE = DEFAULT_PAGE_SIZE;
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [payrolls, setPayrolls] = useState<PayrollItem[]>([]);
    const [summary, setSummary] = useState<FinanceSummary>({
        total_income: 0,
        total_expenses: 0,
        net_profit: 0,
    });
    const [transactionsTotal, setTransactionsTotal] = useState(0);
    const [payrollsTotal, setPayrollsTotal] = useState(0);
    const [transactionsPage, setTransactionsPage] = useState(1);
    const [payrollsPage, setPayrollsPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [activeSection, setActiveSection] = useState<'transactions' | 'salaries'>('transactions');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [salaryStatusFilter, setSalaryStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'PAID'>('ALL');
    const [salarySearch, setSalarySearch] = useState('');
    const [selectedPayroll, setSelectedPayroll] = useState<PayrollItem | null>(null);
    const [draftReminderCount, setDraftReminderCount] = useState(0);
    const [draftReminderLoading, setDraftReminderLoading] = useState(false);
    const [reviewForm, setReviewForm] = useState({
        base_pay: 0,
        overtime_hours: 0,
        overtime_pay: 0,
        commission_pay: 0,
        bonus_pay: 0,
        manual_deductions: 0,
    });
    const [updatingPayrollId, setUpdatingPayrollId] = useState<string | null>(null);
    const [payingPayrollId, setPayingPayrollId] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');
    const [payNote, setPayNote] = useState('');
    const [salaryCutoffDay, setSalaryCutoffDay] = useState(1);
    const [salaryCutoffInput, setSalaryCutoffInput] = useState('1');
    const [datePreset, setDatePreset] = useState<'all' | 'today' | '7d' | '30d' | 'custom'>('30d');
    const [facilityExpenseNotice, setFacilityExpenseNotice] = useState<{ branchId: string; assetName: string; amount: string | null } | null>(null);
    const [noticeRefreshKey, setNoticeRefreshKey] = useState(0);
    const [transactionsPageSize, setTransactionsPageSize] = useState(DEFAULT_PAGE_SIZE);

    const [formData, setFormData] = useState({
        amount: '',
        type: 'INCOME',
        category: 'OTHER_INCOME',
        description: '',
        payment_method: 'CASH'
    });

    const toDateInput = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const [startDate, setStartDate] = useState(toDateInput(thirtyDaysAgo));
    const [endDate, setEndDate] = useState(toDateInput(today));
    const txt = locale === 'ar'
        ? {
            categorySubscription: 'اشتراك',
            categoryPosSale: 'بيع نقطة البيع',
            categoryOtherIncome: 'دخل آخر',
            categorySalary: 'راتب',
            categoryRent: 'إيجار',
            categoryUtilities: 'مرافق',
            categoryMaintenance: 'صيانة',
            categoryEquipment: 'معدات',
            categoryOtherExpense: 'مصروف آخر',
            totalIncome: 'إجمالي الدخل',
            totalExpenses: 'إجمالي المصروفات',
            netProfit: 'صافي الربح',
            paymentMethod: 'طريقة الدفع',
            cash: 'نقد',
            card: 'بطاقة',
            bankTransfer: 'تحويل بنكي',
            transfer: 'تحويل',
            basePay: 'الأجر الأساسي',
            overtimePay: 'أجر العمل الإضافي',
            overtimeHours: 'ساعات إضافية',
            commission: 'عمولة',
            bonus: 'مكافأة',
            deductions: 'خصومات',
            debtDeductions: 'خصومات الدَّين',
            netTotal: 'الإجمالي الصافي',
            amountPlaceholder: 'المبلغ',
            notePlaceholder: 'ملاحظة (اختياري)',
            draft: 'مسودة',
            approved: 'معتمد',
            rejected: 'مرفوض',
            approve: 'اعتماد',
            partial: 'جزئي',
            paid: 'مدفوع',
            downloadSlip: 'تنزيل القسيمة',
            reviewReady: 'مسودات الرواتب جاهزة للمراجعة',
            reviewReadyDesc: 'توجد كشوف رواتب تحتاج مراجعة واعتمادًا قبل الدفع.',
        }
        : {
            categorySubscription: 'Subscription',
            categoryPosSale: 'POS Sale',
            categoryOtherIncome: 'Other Income',
            categorySalary: 'Salary',
            categoryRent: 'Rent',
            categoryUtilities: 'Utilities',
            categoryMaintenance: 'Maintenance',
            categoryEquipment: 'Equipment',
            categoryOtherExpense: 'Other Expense',
            totalIncome: 'Total Income',
            totalExpenses: 'Total Expenses',
            netProfit: 'Net Profit',
            paymentMethod: 'Payment Method',
            cash: 'Cash',
            card: 'Card',
            bankTransfer: 'Bank Transfer',
            transfer: 'Transfer',
            basePay: 'Base Pay',
            overtimePay: 'Overtime Pay',
            overtimeHours: 'Overtime Hours',
            commission: 'Commission',
            bonus: 'Bonus',
            deductions: 'Deductions',
            debtDeductions: 'Debt deductions',
            netTotal: 'Net Total',
            amountPlaceholder: 'Amount',
            notePlaceholder: 'Note (optional)',
            draft: 'Draft',
            approved: 'Approved',
            rejected: 'Rejected',
            approve: 'Approve',
            partial: 'Partial',
            paid: 'Paid',
            downloadSlip: 'Download Slip',
            reviewReady: 'Payroll drafts ready for review',
            reviewReadyDesc: 'There are payslips waiting for review and approval before payment.',
        };
    const consumeFacilityExpenseNotice = useCallback((raw: string | null) => {
        if (!raw) return false;
        try {
            const parsed = JSON.parse(raw) as { branchId?: string; assetName?: string; amount?: string | null };
            if (!parsed.branchId || !parsed.assetName) return false;
            setFacilityExpenseNotice({
                branchId: parsed.branchId,
                assetName: parsed.assetName,
                amount: parsed.amount ?? null,
            });
            setActiveSection('transactions');
            setTypeFilter('ALL');
            setCategoryFilter('ALL');
            setDatePreset('30d');
            const now = new Date();
            const start = new Date(now);
            start.setDate(now.getDate() - 29);
            setStartDate(toDateInput(start));
            setEndDate(toDateInput(now));
            setTransactionsPage(1);
            setTransactionsPageSize(500);
            setNoticeRefreshKey((prev) => prev + 1);
            setSelectedBranchId('all');
            return true;
        } catch {
            return false;
        }
    }, [setSelectedBranchId]);
    const jodCode = 'JOD';
    const paymentHistoryLabel = locale === 'ar' ? 'سجل المدفوعات' : 'Payment History';
    const noPaymentsRecordedLabel = locale === 'ar' ? 'لا توجد مدفوعات مسجلة.' : 'No payments recorded.';
    const descriptionPlaceholder = locale === 'ar' ? 'مثال: اشتراك شهري للنادي' : 'e.g. Monthly gym subscription';
    const salaryPaymentDefault = locale === 'ar' ? 'دفعة راتب' : 'Salary payment';
    const categoryLabelMap: Record<string, string> = {
        SUBSCRIPTION: txt.categorySubscription,
        POS_SALE: txt.categoryPosSale,
        OTHER_INCOME: txt.categoryOtherIncome,
        SALARY: txt.categorySalary,
        RENT: txt.categoryRent,
        UTILITIES: txt.categoryUtilities,
        MAINTENANCE: txt.categoryMaintenance,
        EQUIPMENT: txt.categoryEquipment,
        OTHER_EXPENSE: txt.categoryOtherExpense,
    };
    const paymentMethodLabelMap: Record<string, string> = {
        CASH: txt.cash,
        CARD: txt.card,
        TRANSFER: txt.transfer,
        BANK_TRANSFER: txt.bankTransfer,
    };
    const getCategoryLabel = (category: string) => categoryLabelMap[category] || category.replace(/_/g, ' ');
    const getPaymentMethodLabel = (method: string) => paymentMethodLabelMap[method] || method;
    const getPayrollStatusLabel = (status: PayrollItem['status']) => {
        if (status === 'PAID') return txt.paid;
        if (status === 'PARTIAL') return txt.partial;
        if (status === 'APPROVED') return txt.approved;
        if (status === 'REJECTED') return txt.rejected;
        return txt.draft;
    };

    useEffect(() => {
        if (!selectedPayroll) return;
        setReviewForm({
            base_pay: selectedPayroll.base_pay,
            overtime_hours: selectedPayroll.overtime_hours,
            overtime_pay: selectedPayroll.overtime_pay,
            commission_pay: selectedPayroll.commission_pay,
            bonus_pay: selectedPayroll.bonus_pay,
            manual_deductions: selectedPayroll.manual_deductions ?? 0,
        });
    }, [selectedPayroll]);

    const fetchTransactions = useCallback(async () => {
        const params: Record<string, string | number> = {
            limit: transactionsPageSize,
            offset: (transactionsPage - 1) * transactionsPageSize,
            ...getBranchParams(selectedBranchId),
        };
        if (typeFilter !== 'ALL') params.tx_type = typeFilter;
        if (categoryFilter !== 'ALL') params.category = categoryFilter;
        if (datePreset !== 'all') {
            params.start_date = startDate;
            params.end_date = endDate;
        }
        const listRes = await api.get('/finance/transactions', { params });
        setTransactions(listRes.data.data || []);
        setTransactionsTotal(Number(listRes.headers['x-total-count'] || 0));
    }, [categoryFilter, datePreset, endDate, selectedBranchId, startDate, transactionsPage, transactionsPageSize, typeFilter]);

    const fetchSummary = useCallback(async () => {
        const params: Record<string, string | number> = {
            ...getBranchParams(selectedBranchId),
        };
        if (typeFilter !== 'ALL') params.tx_type = typeFilter;
        if (categoryFilter !== 'ALL') params.category = categoryFilter;
        if (datePreset !== 'all') {
            params.start_date = startDate;
            params.end_date = endDate;
        }
        const summaryRes = await api.get('/finance/summary', { params });
        setSummary(summaryRes.data?.data || { total_income: 0, total_expenses: 0, net_profit: 0 });
    }, [categoryFilter, datePreset, endDate, selectedBranchId, startDate, typeFilter]);

    const fetchPayrolls = useCallback(async () => {
        const params: Record<string, string | number> = {
            limit: PAGE_SIZE,
            offset: (payrollsPage - 1) * PAGE_SIZE,
            ...getBranchParams(selectedBranchId),
        };
        if (salaryStatusFilter !== 'ALL') params.status = salaryStatusFilter;
        if (salarySearch.trim()) params.search = salarySearch.trim();
        const payrollRes = await api.get('/hr/payrolls/pending', { params });
        setPayrolls(payrollRes.data.data || []);
        setPayrollsTotal(Number(payrollRes.headers['x-total-count'] || 0));
    }, [PAGE_SIZE, payrollsPage, salarySearch, salaryStatusFilter, selectedBranchId]);

    const fetchDraftReminder = useCallback(async () => {
        setDraftReminderLoading(true);
        try {
            const res = await api.get('/hr/payrolls/pending', {
                params: {
                    status: 'DRAFT',
                    limit: 1,
                    ...getBranchParams(selectedBranchId),
                },
            });
            setDraftReminderCount(Number(res.headers['x-total-count'] || 0));
        } catch {
            setDraftReminderCount(0);
        } finally {
            setDraftReminderLoading(false);
        }
    }, [selectedBranchId]);

    const fetchPayrollSettings = useCallback(async () => {
        try {
            const settingsRes = await api.get('/hr/payrolls/settings');
            const next = Number(settingsRes.data?.data?.salary_cutoff_day || 1);
            setSalaryCutoffDay(next);
            setSalaryCutoffInput(String(next));
        } catch {
            setSalaryCutoffDay(1);
            setSalaryCutoffInput('1');
        }
    }, []);

    const fetchData = useCallback(async () => {
        if (startDate > endDate) {
            showToast(t('finance.startAfterEnd'), 'error');
            return;
        }
        setLoading(true);
        try {
            await Promise.all([fetchTransactions(), fetchSummary(), fetchPayrolls(), fetchPayrollSettings(), fetchDraftReminder()]);
        } catch {
            showToast(t('finance.loadingError'), 'error');
        }
        setLoading(false);
    }, [endDate, fetchDraftReminder, fetchPayrollSettings, fetchPayrolls, fetchSummary, fetchTransactions, showToast, startDate, t]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const consumeStoredNotice = () => {
            const rawSession = sessionStorage.getItem('pending_finance_asset_notice');
            const rawLocal = localStorage.getItem('pending_finance_asset_notice');
            const consumed = consumeFacilityExpenseNotice(rawSession || rawLocal);
            if (consumed) {
                sessionStorage.removeItem('pending_finance_asset_notice');
                localStorage.removeItem('pending_finance_asset_notice');
            }
        };
        consumeStoredNotice();
        const onStorage = (event: StorageEvent) => {
            if (event.key !== 'pending_finance_asset_notice') return;
            const consumed = consumeFacilityExpenseNotice(event.newValue);
            if (consumed) {
                localStorage.removeItem('pending_finance_asset_notice');
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [consumeFacilityExpenseNotice]);

    useEffect(() => {
        if (!noticeRefreshKey) return;
        void fetchData();
    }, [fetchData, noticeRefreshKey]);

    const applyPreset = (preset: 'all' | 'today' | '7d' | '30d' | 'custom') => {
        setDatePreset(preset);
        if (preset === 'custom' || preset === 'all') return;

        const now = new Date();
        const start = new Date(now);
        if (preset === 'today') start.setDate(now.getDate());
        if (preset === '7d') start.setDate(now.getDate() - 6);
        if (preset === '30d') start.setDate(now.getDate() - 29);
        setStartDate(toDateInput(start));
        setEndDate(toDateInput(now));
    };

    const filteredTransactions = transactions;

    const totalTransactionPages = Math.max(1, Math.ceil(transactionsTotal / transactionsPageSize));
    const totalPayrollPages = Math.max(1, Math.ceil(payrollsTotal / PAGE_SIZE));

    useEffect(() => {
        setTransactionsPage(1);
    }, [typeFilter, categoryFilter, datePreset, startDate, endDate, selectedBranchId]);

    useEffect(() => {
        setPayrollsPage(1);
    }, [salaryStatusFilter, salarySearch, selectedBranchId]);

    const handlePrintReceipt = async (tx: Transaction) => {
        try {
            const url = new URL(`/print/finance/receipt/${tx.id}`, window.location.origin);
            url.searchParams.set('locale', locale);
            const w = window.open(url.toString(), '_blank');
            if (!w) throw new Error('popup-blocked');
        } catch {
            showToast(t('finance.downloadReceiptError'), 'error');
        }
    };

    const handlePrintReport = async () => {
        try {
            const params = new URLSearchParams();
            if (typeFilter !== 'ALL') params.set('tx_type', typeFilter);
            if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
            const branchParams = getBranchParams(selectedBranchId);
            if (branchParams.branch_id) params.set('branch_id', branchParams.branch_id);
            if (datePreset !== 'all') {
                params.set('start_date', startDate);
                params.set('end_date', endDate);
            }
            params.set('locale', locale);
            const url = new URL(`/print/finance/report?${params.toString()}`, window.location.origin);
            const w = window.open(url.toString(), '_blank');
            if (!w) throw new Error('popup-blocked');
        } catch {
            showToast(t('finance.downloadReportError'), 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/finance/transactions', {
                ...formData,
                amount: parseFloat(formData.amount),
                ...getBranchParams(selectedBranchId),
            });
            setShowModal(false);
            setFormData({ amount: '', type: 'INCOME', category: 'OTHER_INCOME', description: '', payment_method: 'CASH' });
            await Promise.all([fetchTransactions(), fetchSummary()]);
        } catch {
            showToast(t('finance.logTransactionError'), 'error');
        }
    };

    const savePayrollReview = async () => {
        if (!selectedPayroll) return;
        try {
            setUpdatingPayrollId(selectedPayroll.id);
            const res = await api.patch(`/hr/payrolls/${selectedPayroll.id}`, {
                base_pay: Number(reviewForm.base_pay),
                overtime_hours: Number(reviewForm.overtime_hours),
                overtime_pay: Number(reviewForm.overtime_pay),
                commission_pay: Number(reviewForm.commission_pay),
                bonus_pay: Number(reviewForm.bonus_pay),
                manual_deductions: Number(reviewForm.manual_deductions),
            });
            setSelectedPayroll(res.data.data);
            showToast(locale === 'ar' ? 'تم حفظ مسودة مسير الرواتب.' : 'Payroll draft saved.', 'success');
            await Promise.all([fetchPayrolls(), fetchDraftReminder()]);
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.updatePayrollError'), 'error');
        } finally {
            setUpdatingPayrollId(null);
        }
    };

    const approveCurrentDraft = async () => {
        if (!selectedPayroll) return;
        await savePayrollReview();
        await approvePayroll(selectedPayroll);
    };

    const rejectPayroll = async (item: PayrollItem) => {
        try {
            setUpdatingPayrollId(item.id);
            const res = await api.patch(`/hr/payrolls/${item.id}/status`, { status: 'REJECTED' });
            setSelectedPayroll(res.data.data);
            showToast(locale === 'ar' ? 'تم رفض مسير الرواتب.' : 'Payroll rejected.', 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions(), fetchDraftReminder()]);
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.updatePayrollError'), 'error');
        } finally {
            setUpdatingPayrollId(null);
        }
    };

    const rejectCurrentDraft = async () => {
        if (!selectedPayroll) return;
        await rejectPayroll(selectedPayroll);
    };

    const approvePayroll = async (item: PayrollItem) => {
        try {
            setUpdatingPayrollId(item.id);
            const res = await api.patch(`/hr/payrolls/${item.id}/status`, { status: 'APPROVED' });
            setSelectedPayroll(res.data.data);
            showToast(locale === 'ar' ? 'تم اعتماد مسير الرواتب.' : 'Payroll approved.', 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions(), fetchDraftReminder()]);
            setPayAmount(String(res.data.data.pending_amount > 0 ? res.data.data.pending_amount : ''));
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.updatePayrollError'), 'error');
        } finally {
            setUpdatingPayrollId(null);
        }
    };

    const reopenPayroll = async (item: PayrollItem) => {
        try {
            setUpdatingPayrollId(item.id);
            const res = await api.patch(`/hr/payrolls/${item.id}/status`, { status: 'DRAFT' });
            setSelectedPayroll(res.data.data);
            showToast(t('finance.reopen'), 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions(), fetchDraftReminder()]);
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.updatePayrollError'), 'error');
        } finally {
            setUpdatingPayrollId(null);
        }
    };

    const handlePrintPayslip = async (payrollId: string) => {
        try {
            const res = await api.get(`/hr/payroll/${payrollId}/payslip/export-pdf`, { responseType: 'blob' });
            downloadBlob(res.data as Blob, `payslip_${payrollId.slice(0, 8).toUpperCase()}.pdf`);
        } catch {
            showToast(locale === 'ar' ? 'فشل تنزيل القسيمة' : 'Failed to download payslip', 'error');
        }
    };

    const reviewNetPay =
        Number(reviewForm.base_pay || 0)
        + Number(reviewForm.overtime_pay || 0)
        + Number(reviewForm.commission_pay || 0)
        + Number(reviewForm.bonus_pay || 0)
        - Number(reviewForm.manual_deductions || 0)
        - Number(selectedPayroll?.leave_deductions || 0)
        - Number(selectedPayroll?.debt_deductions || 0);

    const saveCutoffDay = async () => {
        const value = Number(salaryCutoffInput);
        if (!Number.isFinite(value) || value < 1 || value > 31) {
            showToast(t('finance.cutoffRangeError'), 'error');
            return;
        }
        try {
            await api.patch('/hr/payrolls/settings', { salary_cutoff_day: Math.floor(value) });
            setSalaryCutoffDay(Math.floor(value));
            setSalaryCutoffInput(String(Math.floor(value)));
            showToast(t('finance.cutoffUpdated'), 'success');
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.cutoffUpdateError'), 'error');
        }
    };

    const submitPayrollPayment = useCallback(async () => {
        if (!selectedPayroll) return;
        const amount = Number(payAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast(t('finance.paymentAmountError'), 'error');
            return;
        }
        try {
            setPayingPayrollId(selectedPayroll.id);
            await api.post(`/hr/payrolls/${selectedPayroll.id}/payments`, {
                amount,
                payment_method: payMethod,
                description: payNote || undefined,
            });
            showToast(t('finance.paymentRecorded'), 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions()]);
            const refreshed = await api.get('/hr/payrolls/pending', {
                params: {
                    user_id: selectedPayroll.user_id,
                    month: selectedPayroll.month,
                    year: selectedPayroll.year,
                    limit: 1,
                    ...getBranchParams(selectedBranchId),
                },
            });
            const updated = (refreshed.data?.data || []).find((p: PayrollItem) => p.id === selectedPayroll.id) || null;
            setSelectedPayroll(updated);
            if (updated) setPayAmount(String(updated.pending_amount > 0 ? updated.pending_amount : ''));
            setPayNote('');
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.paymentRecordError'), 'error');
        } finally {
            setPayingPayrollId(null);
        }
    }, [fetchPayrolls, fetchTransactions, payAmount, payMethod, payNote, selectedBranchId, selectedPayroll, showToast, t]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" /></div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t('finance.title')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('finance.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <BranchSelector
                        branches={branches}
                        selectedBranchId={selectedBranchId}
                        onSelect={setSelectedBranchId}
                    />
                    {activeSection === 'transactions' && (
                        <>
                            <button onClick={handlePrintReport} className="btn-ghost"><FileText size={16} /> {t('finance.printReport')}</button>
                            <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={18} /> {t('finance.logTransaction')}</button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={() => setActiveSection('transactions')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${activeSection === 'transactions' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.transactionsTab')}</button>
                <button onClick={() => setActiveSection('salaries')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${activeSection === 'salaries' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.salariesTab')}</button>
            </div>

            {activeSection === 'transactions' && (
                <>
                    {facilityExpenseNotice && (
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
                            <p className="font-semibold">
                                {locale === 'ar' ? 'تم ترحيل مصروف صيانة من المرافق' : 'Facility repair expense posted'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {facilityExpenseNotice.assetName}
                                {facilityExpenseNotice.amount ? ` - ${facilityExpenseNotice.amount}` : ''}
                            </p>
                        </div>
                    )}
                    <div className="chart-card p-4 border border-border space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('finance.filters')}</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setTypeFilter('ALL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${typeFilter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.all')}</button>
                            <button onClick={() => setTypeFilter('INCOME')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${typeFilter === 'INCOME' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.income')}</button>
                            <button onClick={() => setTypeFilter('EXPENSE')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${typeFilter === 'EXPENSE' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.expense')}</button>
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">{t('finance.category')}</label>
                            <select className="input-dark" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                                <option value="ALL">{t('finance.allCategories')}</option>
                                <option value="SUBSCRIPTION">{txt.categorySubscription}</option>
                                <option value="POS_SALE">{txt.categoryPosSale}</option>
                                <option value="OTHER_INCOME">{txt.categoryOtherIncome}</option>
                                <option value="SALARY">{txt.categorySalary}</option>
                                <option value="RENT">{txt.categoryRent}</option>
                                <option value="UTILITIES">{txt.categoryUtilities}</option>
                                <option value="MAINTENANCE">{txt.categoryMaintenance}</option>
                                <option value="EQUIPMENT">{txt.categoryEquipment}</option>
                                <option value="OTHER_EXPENSE">{txt.categoryOtherExpense}</option>
                            </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => applyPreset('all')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.allDates')}</button>
                            <button onClick={() => applyPreset('today')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'today' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.today')}</button>
                            <button onClick={() => applyPreset('7d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '7d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.last7')}</button>
                            <button onClick={() => applyPreset('30d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '30d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.last30')}</button>
                            <button onClick={() => applyPreset('custom')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.custom')}</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{t('finance.startDate')}</label>
                                <input type="date" className="input-dark" value={startDate} onChange={(e) => { setDatePreset('custom'); setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{t('finance.endDate')}</label>
                                <input type="date" className="input-dark" value={endDate} min={startDate} onChange={(e) => { setDatePreset('custom'); setEndDate(e.target.value); }} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20"><ArrowUpCircle size={22} className="text-emerald-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">{txt.totalIncome}</p><p className="text-2xl font-bold text-foreground">{summary.total_income.toFixed(2)} JOD</p></div></div>
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20"><ArrowDownCircle size={22} className="text-red-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">{txt.totalExpenses}</p><p className="text-2xl font-bold text-foreground">{summary.total_expenses.toFixed(2)} JOD</p></div></div>
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20"><Wallet size={22} className="text-blue-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">{txt.netProfit}</p><p className={`text-2xl font-bold ${(summary.net_profit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{summary.net_profit.toFixed(2)} JOD</p></div></div>
                    </div>

                    <div className="chart-card overflow-hidden !p-0 border border-border">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                            <h3 className="text-sm font-semibold text-muted-foreground">{t('finance.transactions')}</h3>
                            <span className="text-xs text-muted-foreground">{t('finance.total')}: {formatNumber(transactionsTotal)}</span>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-start table-dark min-w-[550px]"><thead><tr><th>{t('finance.date')}</th><th>{t('finance.description')}</th><th>{t('finance.category')}</th><th>{t('finance.type')}</th><th className="text-end">{t('finance.amount')}</th><th className="text-end">{t('finance.action')}</th></tr></thead>
                                <tbody>
                                    {filteredTransactions.length === 0 && (<tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{t('finance.noTransactions')}</td></tr>)}
                                    {filteredTransactions.map((tx) => (<tr key={tx.id}><td>{formatDate(tx.date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</td><td className="!text-foreground font-medium">{tx.description || '-'}</td><td className="text-xs">{getCategoryLabel(tx.category)}</td><td><span className={`badge ${tx.type === 'INCOME' ? 'badge-green' : 'badge-red'}`}>{tx.type === 'INCOME' ? t('finance.income') : t('finance.expense')}</span></td><td className={`text-end font-mono text-sm font-semibold ${tx.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>{tx.type === 'INCOME' ? '+' : '-'}{formatNumber(tx.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="text-end"><button onClick={() => handlePrintReceipt(tx)} className="text-muted-foreground hover:text-primary transition-colors p-1" title={t('finance.printReport')}><Printer size={16} /></button></td></tr>))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t('finance.pageOf').replace('{{page}}', String(transactionsPage)).replace('{{total}}', String(totalTransactionPages))}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={transactionsPage <= 1}
                                    onClick={() => setTransactionsPage((prev) => Math.max(1, prev - 1))}
                                >
                                    {t('finance.previous')}
                                </button>
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={transactionsPage >= totalTransactionPages}
                                    onClick={() => setTransactionsPage((prev) => Math.min(totalTransactionPages, prev + 1))}
                                >
                                    {t('finance.next')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeSection === 'salaries' && (
                <div className="space-y-4">
                    <div className={`rounded-2xl border px-4 py-3 ${draftReminderCount > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-card/60'}`}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-foreground">{txt.reviewReady}</p>
                                <p className="text-xs text-muted-foreground">
                                    {draftReminderLoading ? t('common.loading') : txt.reviewReadyDesc}
                                </p>
                            </div>
                            <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground">
                                {draftReminderCount}
                            </div>
                        </div>
                    </div>
                    <div className="chart-card p-4 border border-border space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('finance.salaryFilters')}</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setSalaryStatusFilter('ALL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.all')}</button>
                            <button onClick={() => setSalaryStatusFilter('DRAFT')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'DRAFT' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.draft')}</button>
                            <button onClick={() => setSalaryStatusFilter('APPROVED')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'APPROVED' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.approved}</button>
                            <button onClick={() => setSalaryStatusFilter('REJECTED')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'REJECTED' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.rejected}</button>
                            <button onClick={() => setSalaryStatusFilter('PARTIAL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'PARTIAL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.partial')}</button>
                            <button onClick={() => setSalaryStatusFilter('PAID')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'PAID' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.paid')}</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{t('finance.salaryCutoffDay')}</label>
                                <input type="number" min={1} max={31} className="input-dark" value={salaryCutoffInput} onChange={(e) => setSalaryCutoffInput(e.target.value)} />
                                <p className="text-[11px] text-muted-foreground mt-1">{t('finance.current')}: {formatNumber(salaryCutoffDay)}</p>
                            </div>
                            <button className="btn-ghost" onClick={saveCutoffDay}><Settings2 size={14} /> {t('finance.saveCutoff')}</button>
                        </div>
                        <div className="field-with-icon"><Search size={14} className="field-icon" /><input value={salarySearch} onChange={(e) => setSalarySearch(e.target.value)} placeholder={t('finance.searchEmployee')} aria-label={t('finance.searchEmployee')} className="input-dark input-with-icon" /></div>
                    </div>

                    <div className="chart-card overflow-hidden !p-0 border border-border">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                            <h3 className="text-sm font-semibold text-muted-foreground">{t('finance.salaryManagement')}</h3>
                            <span className="text-xs text-muted-foreground">{t('finance.total')}: {formatNumber(payrollsTotal)}</span>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-start table-dark min-w-[900px]"><thead><tr><th>{t('finance.employee')}</th><th>{t('finance.period')}</th><th>{t('finance.status')}</th><th className="text-end">{t('finance.total')}</th><th className="text-end">{t('finance.paid')}</th><th className="text-end">{t('finance.pending')}</th><th>{t('finance.paidAt')}</th><th className="text-end">{t('finance.actions')}</th></tr></thead>
                                <tbody>
                                    {payrolls.length === 0 && (<tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">{t('finance.noPayroll')}</td></tr>)}
                                    {payrolls.map((item) => (
                                        <tr key={item.id}>
                                            <td><p className="text-foreground font-medium">{item.user_name}</p><p className="text-xs text-muted-foreground">{item.user_email}</p></td>
                                            <td>{String(item.month).padStart(2, '0')}/{item.year}</td>
                                            <td><span className={`badge ${item.status === 'PAID' ? 'badge-green' : item.status === 'PARTIAL' ? 'badge-blue' : item.status === 'APPROVED' ? 'badge-violet' : item.status === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>{getPayrollStatusLabel(item.status)}</span></td>
                                            <td className="text-end font-mono text-foreground">{formatCurrency(item.total_pay, 'JOD', { currencyDisplay: 'code' })}</td>
                                            <td className="text-end font-mono text-foreground">{formatCurrency(item.paid_amount, 'JOD', { currencyDisplay: 'code' })}</td>
                                            <td className={`text-end font-mono ${item.pending_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatCurrency(item.pending_amount, 'JOD', { currencyDisplay: 'code' })}</td>
                                            <td className="text-xs text-muted-foreground">{item.paid_at ? formatDate(item.paid_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                                            <td><div className="flex items-center justify-end gap-2"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setSelectedPayroll(item); setPayAmount(item.pending_amount > 0 ? String(item.pending_amount) : ''); setPayMethod('CASH'); setPayNote(''); }}>{t('finance.details')}</button>{item.status === 'DRAFT' ? (<><button className="btn-primary !px-2 !py-1 text-xs" onClick={() => approvePayroll(item)} disabled={updatingPayrollId === item.id}><CheckCircle2 size={14} /> {txt.approve}</button><button className="btn-ghost !px-2 !py-1 text-xs text-red-400" onClick={() => rejectPayroll(item)} disabled={updatingPayrollId === item.id}><span className="inline-block">✕</span> {locale === 'ar' ? 'رفض' : 'Reject'}</button></>) : item.status === 'APPROVED' || item.status === 'REJECTED' ? (<button className="btn-ghost !px-2 !py-1 text-xs text-amber-400" onClick={() => reopenPayroll(item)} disabled={updatingPayrollId === item.id}><RotateCcw size={14} /> {t('finance.reopen')}</button>) : null}</div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t('finance.pageOf').replace('{{page}}', String(payrollsPage)).replace('{{total}}', String(totalPayrollPages))}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={payrollsPage <= 1}
                                    onClick={() => setPayrollsPage((prev) => Math.max(1, prev - 1))}
                                >
                                    {t('finance.previous')}
                                </button>
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={payrollsPage >= totalPayrollPages}
                                    onClick={() => setPayrollsPage((prev) => Math.min(totalPayrollPages, prev + 1))}
                                >
                                    {t('finance.next')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm p-6 w-full max-w-md shadow-2xl bg-card border border-border">
                        <h2 className="text-lg font-bold text-foreground mb-5">{t('finance.logTransaction')}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('finance.type')}</label><select className="input-dark" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}><option value="INCOME">{t('finance.income')}</option><option value="EXPENSE">{t('finance.expense')}</option></select></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('finance.category')}</label><select className="input-dark" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}><option value="OTHER_INCOME">{txt.categoryOtherIncome}</option><option value="SUBSCRIPTION">{txt.categorySubscription}</option><option value="POS_SALE">{txt.categoryPosSale}</option><option value="RENT">{txt.categoryRent}</option><option value="SALARY">{txt.categorySalary}</option><option value="UTILITIES">{txt.categoryUtilities}</option><option value="MAINTENANCE">{txt.categoryMaintenance}</option><option value="EQUIPMENT">{txt.categoryEquipment}</option><option value="OTHER_EXPENSE">{txt.categoryOtherExpense}</option></select></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{`${t('finance.amount')} (${jodCode})`}</label><input type="number" step="0.01" required className="input-dark" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} /></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('finance.description')}</label><input type="text" className="input-dark" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder={descriptionPlaceholder} aria-label={t('finance.description')} /></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.paymentMethod}</label><select className="input-dark" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}><option value="CASH">{txt.cash}</option><option value="CARD">{txt.card}</option><option value="TRANSFER">{txt.bankTransfer}</option></select></div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setShowModal(false)} className="btn-ghost">{t('finance.close')}</button><button type="submit" className="btn-primary">{t('finance.logTransaction')}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {selectedPayroll && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
                    <div className="rounded-2xl p-4 sm:p-5 w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl bg-card border border-border space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CircleDollarSign size={18} /> {t('finance.details')}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {selectedPayroll.user_name} - {selectedPayroll.period_start && selectedPayroll.period_end
                                        ? `${selectedPayroll.period_start.slice(0, 10)} → ${selectedPayroll.period_end.slice(0, 10)}`
                                        : `${String(selectedPayroll.month).padStart(2, '0')}/${selectedPayroll.year}`} - {getPayrollStatusLabel(selectedPayroll.status)}
                                </p>
                            </div>
                            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSelectedPayroll(null)}>{t('finance.close')}</button>
                        </div>

                        <div className="rounded-2xl border border-border bg-background p-3 sm:p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txt.netTotal}</p>
                                    <p className="mt-1 text-3xl font-bold text-foreground">{selectedPayroll.total_pay.toFixed(2)} JOD</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    {selectedPayroll.approved_at && (
                                        <span className="rounded-full border border-border bg-card px-3 py-1">
                                            {locale === 'ar' ? 'اعتمد في' : 'Approved'} {formatDate(selectedPayroll.approved_at, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                        </span>
                                    )}
                                    <span className="rounded-full border border-border bg-card px-3 py-1">{selectedPayroll.payment_count} {locale === 'ar' ? 'دفعات' : 'payments'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.basePay}</p><p className="font-mono font-semibold text-foreground">{reviewForm.base_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.overtimePay}</p><p className="font-mono font-semibold text-foreground">{reviewForm.overtime_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.overtimeHours}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.overtime_hours.toFixed(2)} h</p></div>
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.commission}</p><p className="font-mono font-semibold text-foreground">{reviewForm.commission_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.bonus}</p><p className="font-mono font-semibold text-foreground">{reviewForm.bonus_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.deductions}</p><p className="font-mono font-semibold text-red-400">-{selectedPayroll.deductions.toFixed(2)} JOD</p></div>
                            <div className="rounded-xl p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.debtDeductions}</p><p className="font-mono font-semibold text-red-400">-{(selectedPayroll.debt_deductions || 0).toFixed(2)} JOD</p></div>
                        </div>

                        {selectedPayroll.status === 'DRAFT' ? (
                            <div className="space-y-3 rounded-2xl p-3 sm:p-4 bg-card border border-border">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{locale === 'ar' ? 'مراجعة المسير' : 'Review payroll'}</p>
                                    <p className="text-xs text-muted-foreground">{locale === 'ar' ? 'عدّل القيم ثم اعتمد' : 'Edit values before approval'}</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.basePay}</label>
                                        <input className="input-dark" type="number" min="0" step="0.01" value={reviewForm.base_pay} onChange={(e) => setReviewForm((current) => ({ ...current, base_pay: Number(e.target.value) }))} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.overtimePay}</label>
                                        <input className="input-dark" type="number" min="0" step="0.01" value={reviewForm.overtime_pay} onChange={(e) => setReviewForm((current) => ({ ...current, overtime_pay: Number(e.target.value) }))} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.commission}</label>
                                        <input className="input-dark" type="number" min="0" step="0.01" value={reviewForm.commission_pay} onChange={(e) => setReviewForm((current) => ({ ...current, commission_pay: Number(e.target.value) }))} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.bonus}</label>
                                        <input className="input-dark" type="number" min="0" step="0.01" value={reviewForm.bonus_pay} onChange={(e) => setReviewForm((current) => ({ ...current, bonus_pay: Number(e.target.value) }))} />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">{txt.deductions}</label>
                                        <input className="input-dark" type="number" min="0" step="0.01" value={reviewForm.manual_deductions} onChange={(e) => setReviewForm((current) => ({ ...current, manual_deductions: Number(e.target.value) }))} />
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border bg-background px-3 py-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground">{txt.netTotal}</p>
                                        <p className="font-mono text-2xl font-semibold text-foreground">{reviewNetPay.toFixed(2)} JOD</p>
                                    </div>
                                    <div className="text-xs text-muted-foreground text-end">
                                        <p>{locale === 'ar' ? 'خصومات الإجازات والديون تُحسب تلقائياً' : 'Leave and debt deductions stay automatic'}</p>
                                        <p>{locale === 'ar' ? 'هذه التعديلات قبل الاعتماد' : 'These changes apply before approval'}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
                                    <button type="button" className="btn-ghost" onClick={() => setSelectedPayroll(null)}>{t('finance.close')}</button>
                                    <div className="flex gap-3">
                                        <button type="button" className="btn-ghost" onClick={() => savePayrollReview()} disabled={updatingPayrollId === selectedPayroll.id}>{locale === 'ar' ? 'حفظ' : 'Save Draft'}</button>
                                        <button type="button" className="btn-primary" onClick={approveCurrentDraft} disabled={updatingPayrollId === selectedPayroll.id}><CheckCircle2 size={14} /> {txt.approve}</button>
                                        <button type="button" className="btn-ghost text-red-400" onClick={rejectCurrentDraft} disabled={updatingPayrollId === selectedPayroll.id}>{locale === 'ar' ? 'رفض' : 'Reject'}</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 rounded-2xl p-3 sm:p-4 bg-card border border-border">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                    <div className="rounded-lg p-3 bg-background border border-border"><p className="text-xs text-muted-foreground">{t('finance.paid')}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.paid_amount.toFixed(2)} JOD</p></div>
                                    <div className="rounded-lg p-3 bg-background border border-border"><p className="text-xs text-muted-foreground">{t('finance.pending')}</p><p className={`font-mono font-semibold ${selectedPayroll.pending_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{selectedPayroll.pending_amount.toFixed(2)} JOD</p></div>
                                    <div className="rounded-lg p-3 bg-background border border-border"><p className="text-xs text-muted-foreground">{selectedPayroll.status === 'APPROVED' ? (locale === 'ar' ? 'جاهز للدفع' : 'Ready to pay') : selectedPayroll.status === 'REJECTED' ? (locale === 'ar' ? 'مرفوض' : 'Rejected') : t('finance.status')}</p><p className="font-mono font-semibold text-foreground">{getPayrollStatusLabel(selectedPayroll.status)}</p></div>
                                </div>
                                {selectedPayroll.pending_amount > 0 && (
                                    <div className="space-y-3 rounded-lg p-3 bg-background border border-border">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('finance.recordPayment')}</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <input type="number" min={0.01} step="0.01" max={selectedPayroll.pending_amount} className="input-dark" placeholder={txt.amountPlaceholder} aria-label={txt.amountPlaceholder} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                                            <select className="input-dark" aria-label={txt.paymentMethod} value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}>
                                                <option value="CASH">{txt.cash}</option>
                                                <option value="CARD">{txt.card}</option>
                                                <option value="TRANSFER">{txt.transfer}</option>
                                            </select>
                                            <button className="btn-primary" onClick={submitPayrollPayment} disabled={payingPayrollId === selectedPayroll.id}>{t('finance.recordPayment')}</button>
                                        </div>
                                        <input type="text" className="input-dark" placeholder={txt.notePlaceholder} aria-label={txt.notePlaceholder} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                                    </div>
                                )}
                                <div className="rounded-lg p-3 bg-background border border-border space-y-2">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{paymentHistoryLabel}</p>
                                    {(selectedPayroll.payments || []).length === 0 && <p className="text-xs text-muted-foreground">{noPaymentsRecordedLabel}</p>}
                                    {(selectedPayroll.payments || []).map((payment) => (
                                        <div key={payment.id} className="flex items-center justify-between text-xs border-b border-border/60 pb-1 last:border-0 last:pb-0">
                                            <div>
                                                <p className="text-foreground font-medium">{`${payment.amount.toFixed(2)} ${jodCode} - ${getPaymentMethodLabel(payment.payment_method)}`}</p>
                                                <p className="text-muted-foreground">{payment.description || salaryPaymentDefault}</p>
                                            </div>
                                            <p className="text-muted-foreground">{formatDate(payment.paid_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' })}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between gap-2 pt-1">
                                    <button className="btn-ghost" onClick={() => setSelectedPayroll(null)}>{t('finance.close')}</button>
                                    <div className="flex gap-3">
                                        {(selectedPayroll.status === 'APPROVED' || selectedPayroll.status === 'REJECTED') && (
                                            <button className="btn-ghost" onClick={() => reopenPayroll(selectedPayroll)} disabled={updatingPayrollId === selectedPayroll.id}><RotateCcw size={14} /> {t('finance.reopen')}</button>
                                        )}
                                        <button onClick={() => handlePrintPayslip(selectedPayroll.id)} className="btn-primary flex items-center justify-center gap-2">
                                            <Download size={16} /> {txt.downloadSlip}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
