'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, ArrowUpCircle, ArrowDownCircle, Wallet, Printer, FileText, CircleDollarSign, RotateCcw, CheckCircle2, Search, Settings2 } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
import { downloadBlob } from '@/lib/download';
import { useLocale } from '@/context/LocaleContext';

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
    base_pay: number;
    overtime_hours: number;
    overtime_pay: number;
    commission_pay: number;
    bonus_pay: number;
    deductions: number;
    total_pay: number;
    status: 'DRAFT' | 'PARTIAL' | 'PAID';
    paid_amount: number;
    pending_amount: number;
    payment_count: number;
    last_payment_at: string | null;
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

export default function FinancePage() {
    const { t, formatDate, formatNumber, formatCurrency, locale } = useLocale();
    const { showToast } = useFeedback();
    const PAGE_SIZE = 50;
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [payrolls, setPayrolls] = useState<PayrollItem[]>([]);
    const [transactionsTotal, setTransactionsTotal] = useState(0);
    const [payrollsTotal, setPayrollsTotal] = useState(0);
    const [transactionsPage, setTransactionsPage] = useState(1);
    const [payrollsPage, setPayrollsPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [activeSection, setActiveSection] = useState<'transactions' | 'salaries'>('transactions');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [salaryStatusFilter, setSalaryStatusFilter] = useState<'ALL' | 'DRAFT' | 'PARTIAL' | 'PAID'>('ALL');
    const [salarySearch, setSalarySearch] = useState('');
    const [selectedPayroll, setSelectedPayroll] = useState<PayrollItem | null>(null);
    const [updatingPayrollId, setUpdatingPayrollId] = useState<string | null>(null);
    const [payingPayrollId, setPayingPayrollId] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');
    const [payNote, setPayNote] = useState('');
    const [salaryCutoffDay, setSalaryCutoffDay] = useState(1);
    const [salaryCutoffInput, setSalaryCutoffInput] = useState('1');
    const [datePreset, setDatePreset] = useState<'all' | 'today' | '7d' | '30d' | 'custom'>('30d');

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
            netTotal: 'الإجمالي الصافي',
            amountPlaceholder: 'المبلغ',
            notePlaceholder: 'ملاحظة (اختياري)',
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
            netTotal: 'Net Total',
            amountPlaceholder: 'Amount',
            notePlaceholder: 'Note (optional)',
        };

    const fetchTransactions = useCallback(async () => {
        const params: Record<string, string | number> = {
            limit: PAGE_SIZE,
            offset: (transactionsPage - 1) * PAGE_SIZE,
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
    }, [PAGE_SIZE, categoryFilter, datePreset, endDate, startDate, transactionsPage, typeFilter]);

    const fetchPayrolls = useCallback(async () => {
        const params: Record<string, string | number> = {
            limit: PAGE_SIZE,
            offset: (payrollsPage - 1) * PAGE_SIZE,
        };
        if (salaryStatusFilter !== 'ALL') params.status = salaryStatusFilter;
        if (salarySearch.trim()) params.search = salarySearch.trim();
        const payrollRes = await api.get('/hr/payrolls/pending', { params });
        setPayrolls(payrollRes.data.data || []);
        setPayrollsTotal(Number(payrollRes.headers['x-total-count'] || 0));
    }, [PAGE_SIZE, payrollsPage, salarySearch, salaryStatusFilter]);

    const fetchPayrollSettings = useCallback(async () => {
        const settingsRes = await api.get('/hr/payrolls/settings');
        const next = Number(settingsRes.data?.data?.salary_cutoff_day || 1);
        setSalaryCutoffDay(next);
        setSalaryCutoffInput(String(next));
    }, []);

    const fetchData = useCallback(async () => {
        if (startDate > endDate) {
            showToast(t('finance.startAfterEnd'), 'error');
            return;
        }
        setLoading(true);
        try {
            await Promise.all([fetchTransactions(), fetchPayrolls(), fetchPayrollSettings()]);
        } catch {
            showToast(t('finance.loadingError'), 'error');
        }
        setLoading(false);
    }, [endDate, fetchPayrollSettings, fetchPayrolls, fetchTransactions, showToast, startDate, t]);

    useEffect(() => { setTimeout(() => fetchData(), 0); }, [fetchData]);

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

    const pageSummary = useMemo(() => {
        const total_income = filteredTransactions.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amount, 0);
        const total_expenses = filteredTransactions.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0);
        return {
            total_income,
            total_expenses,
            net_profit: total_income - total_expenses,
        };
    }, [filteredTransactions]);

    const totalTransactionPages = Math.max(1, Math.ceil(transactionsTotal / PAGE_SIZE));
    const totalPayrollPages = Math.max(1, Math.ceil(payrollsTotal / PAGE_SIZE));

    useEffect(() => {
        setTransactionsPage(1);
    }, [typeFilter, categoryFilter, datePreset, startDate, endDate]);

    useEffect(() => {
        setPayrollsPage(1);
    }, [salaryStatusFilter, salarySearch]);

    const handlePrintReceipt = async (tx: Transaction) => {
        try {
            const response = await api.get(`/finance/transactions/${tx.id}/receipt/export-pdf`, { responseType: 'blob' });
            downloadBlob(response.data as Blob, `receipt_${tx.id.slice(0, 8).toUpperCase()}.pdf`);
        } catch {
            showToast(t('finance.downloadReceiptError'), 'error');
        }
    };

    const handlePrintReport = async () => {
        try {
            const params = new URLSearchParams();
            if (typeFilter !== 'ALL') params.set('tx_type', typeFilter);
            if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
            if (datePreset !== 'all') {
                params.set('start_date', startDate);
                params.set('end_date', endDate);
            }
            const response = await api.get(`/finance/transactions/report.pdf?${params.toString()}`, { responseType: 'blob' });
            downloadBlob(response.data as Blob, 'financial_report.pdf');
        } catch {
            showToast(t('finance.downloadReportError'), 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/finance/transactions', {
                ...formData,
                amount: parseFloat(formData.amount)
            });
            setShowModal(false);
            setFormData({ amount: '', type: 'INCOME', category: 'OTHER_INCOME', description: '', payment_method: 'CASH' });
            await fetchTransactions();
        } catch {
            showToast(t('finance.logTransactionError'), 'error');
        }
    };

    const updatePayrollStatus = async (item: PayrollItem, status: 'PAID' | 'DRAFT') => {
        try {
            setUpdatingPayrollId(item.id);
            await api.patch(`/hr/payrolls/${item.id}/status`, { status });
            showToast(status === 'PAID' ? t('finance.markPaid') : t('finance.reopen'), 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions()]);
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.updatePayrollError'), 'error');
        } finally {
            setUpdatingPayrollId(null);
        }
    };

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

    const submitPayrollPayment = async () => {
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
            const refreshed = await api.get('/hr/payrolls/pending', { params: { user_id: selectedPayroll.user_id, month: selectedPayroll.month, year: selectedPayroll.year, limit: 1 } });
            const updated = (refreshed.data?.data || []).find((p: PayrollItem) => p.id === selectedPayroll.id) || null;
            setSelectedPayroll(updated);
            if (updated) setPayAmount(String(updated.pending_amount > 0 ? updated.pending_amount : ''));
            setPayNote('');
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('finance.paymentRecordError'), 'error');
        } finally {
            setPayingPayrollId(null);
        }
    };

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
                <div className="flex items-center gap-2">
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
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20"><ArrowUpCircle size={22} className="text-emerald-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">{txt.totalIncome}</p><p className="text-2xl font-bold text-foreground">{pageSummary.total_income.toFixed(2)} JOD</p></div></div>
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20"><ArrowDownCircle size={22} className="text-red-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">{txt.totalExpenses}</p><p className="text-2xl font-bold text-foreground">{pageSummary.total_expenses.toFixed(2)} JOD</p></div></div>
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20"><Wallet size={22} className="text-blue-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">{txt.netProfit}</p><p className={`text-2xl font-bold ${(pageSummary.net_profit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pageSummary.net_profit.toFixed(2)} JOD</p></div></div>
                    </div>

                    <div className="chart-card overflow-hidden !p-0 border border-border">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                            <h3 className="text-sm font-semibold text-muted-foreground">{t('finance.transactions')}</h3>
                            <span className="text-xs text-muted-foreground">{t('finance.total')}: {formatNumber(transactionsTotal)}</span>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left table-dark min-w-[550px]"><thead><tr><th>{t('finance.date')}</th><th>{t('finance.description')}</th><th>{t('finance.category')}</th><th>{t('finance.type')}</th><th className="text-right">{t('finance.amount')}</th><th className="text-right">{t('finance.action')}</th></tr></thead>
                                <tbody>
                                    {filteredTransactions.length === 0 && (<tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{t('finance.noTransactions')}</td></tr>)}
                                    {filteredTransactions.map((tx) => (<tr key={tx.id}><td>{formatDate(tx.date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</td><td className="!text-foreground font-medium">{tx.description || '-'}</td><td className="text-xs">{tx.category.replace(/_/g, ' ')}</td><td><span className={`badge ${tx.type === 'INCOME' ? 'badge-green' : 'badge-red'}`}>{tx.type === 'INCOME' ? t('finance.income') : t('finance.expense')}</span></td><td className={`text-right font-mono text-sm font-semibold ${tx.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>{tx.type === 'INCOME' ? '+' : '-'}{formatNumber(tx.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="text-right"><button onClick={() => handlePrintReceipt(tx)} className="text-muted-foreground hover:text-primary transition-colors p-1" title={t('finance.printReport')}><Printer size={16} /></button></td></tr>))}
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
                    <div className="chart-card p-4 border border-border space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('finance.salaryFilters')}</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setSalaryStatusFilter('ALL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.all')}</button>
                            <button onClick={() => setSalaryStatusFilter('DRAFT')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'DRAFT' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('finance.draft')}</button>
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
                        <div className="field-with-icon"><Search size={14} className="field-icon" /><input value={salarySearch} onChange={(e) => setSalarySearch(e.target.value)} placeholder={t('finance.searchEmployee')} className="input-dark input-with-icon" /></div>
                    </div>

                    <div className="chart-card overflow-hidden !p-0 border border-border">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                            <h3 className="text-sm font-semibold text-muted-foreground">{t('finance.salaryManagement')}</h3>
                            <span className="text-xs text-muted-foreground">{t('finance.total')}: {formatNumber(payrollsTotal)}</span>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left table-dark min-w-[900px]"><thead><tr><th>{t('finance.employee')}</th><th>{t('finance.period')}</th><th>{t('finance.status')}</th><th className="text-right">{t('finance.total')}</th><th className="text-right">{t('finance.paid')}</th><th className="text-right">{t('finance.pending')}</th><th>{t('finance.paidAt')}</th><th className="text-right">{t('finance.actions')}</th></tr></thead>
                                <tbody>
                                    {payrolls.length === 0 && (<tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">{t('finance.noPayroll')}</td></tr>)}
                                    {payrolls.map((item) => (
                                        <tr key={item.id}>
                                            <td><p className="text-foreground font-medium">{item.user_name}</p><p className="text-xs text-muted-foreground">{item.user_email}</p></td>
                                            <td>{String(item.month).padStart(2, '0')}/{item.year}</td>
                                            <td><span className={`badge ${item.status === 'PAID' ? 'badge-green' : item.status === 'PARTIAL' ? 'badge-blue' : 'badge-amber'}`}>{item.status === 'PAID' ? t('finance.paid') : item.status === 'PARTIAL' ? t('finance.partial') : t('finance.draft')}</span></td>
                                            <td className="text-right font-mono text-foreground">{formatCurrency(item.total_pay, 'JOD', { currencyDisplay: 'code' })}</td>
                                            <td className="text-right font-mono text-foreground">{formatCurrency(item.paid_amount, 'JOD', { currencyDisplay: 'code' })}</td>
                                            <td className={`text-right font-mono ${item.pending_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatCurrency(item.pending_amount, 'JOD', { currencyDisplay: 'code' })}</td>
                                            <td className="text-xs text-muted-foreground">{item.paid_at ? formatDate(item.paid_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                                            <td><div className="flex items-center justify-end gap-2"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setSelectedPayroll(item); setPayAmount(item.pending_amount > 0 ? String(item.pending_amount) : ''); setPayMethod('CASH'); setPayNote(''); }}>{t('finance.details')}</button>{item.status !== 'PAID' ? (<button className="btn-primary !px-2 !py-1 text-xs" onClick={() => updatePayrollStatus(item, 'PAID')} disabled={updatingPayrollId === item.id || item.pending_amount > 0}><CheckCircle2 size={14} /> {t('finance.markPaid')}</button>) : (<button className="btn-ghost !px-2 !py-1 text-xs text-amber-400" onClick={() => updatePayrollStatus(item, 'DRAFT')} disabled={updatingPayrollId === item.id}><RotateCcw size={14} /> {t('finance.reopen')}</button>)}</div></td>
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
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('finance.amount')} (JOD)</label><input type="number" step="0.01" required className="input-dark" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} /></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('finance.description')}</label><input type="text" className="input-dark" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder={locale === 'ar' ? 'مثال: اشتراك شهري للنادي' : 'e.g. Monthly gym subscription'} /></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">{txt.paymentMethod}</label><select className="input-dark" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}><option value="CASH">{txt.cash}</option><option value="CARD">{txt.card}</option><option value="TRANSFER">{txt.bankTransfer}</option></select></div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setShowModal(false)} className="btn-ghost">{t('finance.close')}</button><button type="submit" className="btn-primary">{t('finance.logTransaction')}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {selectedPayroll && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm p-6 w-full max-w-lg shadow-2xl bg-card border border-border space-y-4">
                        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CircleDollarSign size={18} /> {t('finance.details')}</h2><p className="text-sm text-muted-foreground">{selectedPayroll.user_name} - {String(selectedPayroll.month).padStart(2, '0')}/{selectedPayroll.year}</p></div><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSelectedPayroll(null)}>{t('finance.close')}</button></div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.basePay}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.base_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.overtimePay}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.overtime_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.overtimeHours}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.overtime_hours.toFixed(2)} h</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.commission}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.commission_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.bonus}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.bonus_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.deductions}</p><p className="font-mono font-semibold text-red-400">-{selectedPayroll.deductions.toFixed(2)} JOD</p></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{txt.netTotal}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.total_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{t('finance.paid')}</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.paid_amount.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">{t('finance.pending')}</p><p className={`font-mono font-semibold ${selectedPayroll.pending_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{selectedPayroll.pending_amount.toFixed(2)} JOD</p></div>
                        </div>
                        {selectedPayroll.pending_amount > 0 && (
                            <div className="space-y-3 rounded-lg p-3 bg-card border border-border">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('finance.recordPayment')}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <input type="number" min={0.01} step="0.01" max={selectedPayroll.pending_amount} className="input-dark" placeholder={txt.amountPlaceholder} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                                    <select className="input-dark" value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}>
                                        <option value="CASH">{txt.cash}</option>
                                        <option value="CARD">{txt.card}</option>
                                        <option value="TRANSFER">{txt.transfer}</option>
                                    </select>
                                    <button className="btn-primary" onClick={submitPayrollPayment} disabled={payingPayrollId === selectedPayroll.id}>{t('finance.recordPayment')}</button>
                                </div>
                                <input type="text" className="input-dark" placeholder={txt.notePlaceholder} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                            </div>
                        )}
                        <div className="rounded-lg p-3 bg-card border border-border space-y-2">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Payment History</p>
                            {(selectedPayroll.payments || []).length === 0 && <p className="text-xs text-muted-foreground">No payments recorded.</p>}
                            {(selectedPayroll.payments || []).map((payment) => (
                                <div key={payment.id} className="flex items-center justify-between text-xs border-b border-border/60 pb-1 last:border-0 last:pb-0">
                                    <div>
                                        <p className="text-foreground font-medium">{payment.amount.toFixed(2)} JOD - {payment.payment_method}</p>
                                        <p className="text-muted-foreground">{payment.description || 'Salary payment'}</p>
                                    </div>
                                    <p className="text-muted-foreground">{new Date(payment.paid_at).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
