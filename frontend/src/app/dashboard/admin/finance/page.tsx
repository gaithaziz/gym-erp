'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, ArrowUpCircle, ArrowDownCircle, Wallet, Printer, FileText, CircleDollarSign, RotateCcw, CheckCircle2, Search, Settings2 } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
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
            showToast('Start date cannot be after end date.', 'error');
            return;
        }
        setLoading(true);
        try {
            await Promise.all([fetchTransactions(), fetchPayrolls(), fetchPayrollSettings()]);
        } catch {
            showToast('Failed to load financial data.', 'error');
        }
        setLoading(false);
    }, [endDate, fetchPayrollSettings, fetchPayrolls, fetchTransactions, showToast, startDate]);

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
            showToast('Failed to download receipt', 'error');
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
            showToast('Failed to download report', 'error');
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
            showToast('Failed to log transaction', 'error');
        }
    };

    const updatePayrollStatus = async (item: PayrollItem, status: 'PAID' | 'DRAFT') => {
        try {
            setUpdatingPayrollId(item.id);
            await api.patch(`/hr/payrolls/${item.id}/status`, { status });
            showToast(status === 'PAID' ? 'Salary marked as paid.' : 'Salary reopened to draft.', 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions()]);
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to update payroll', 'error');
        } finally {
            setUpdatingPayrollId(null);
        }
    };

    const saveCutoffDay = async () => {
        const value = Number(salaryCutoffInput);
        if (!Number.isFinite(value) || value < 1 || value > 31) {
            showToast('Cutoff day must be between 1 and 31.', 'error');
            return;
        }
        try {
            await api.patch('/hr/payrolls/settings', { salary_cutoff_day: Math.floor(value) });
            setSalaryCutoffDay(Math.floor(value));
            setSalaryCutoffInput(String(Math.floor(value)));
            showToast('Salary cutoff day updated.', 'success');
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to update salary cutoff', 'error');
        }
    };

    const submitPayrollPayment = async () => {
        if (!selectedPayroll) return;
        const amount = Number(payAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast('Enter a valid payment amount.', 'error');
            return;
        }
        try {
            setPayingPayrollId(selectedPayroll.id);
            await api.post(`/hr/payrolls/${selectedPayroll.id}/payments`, {
                amount,
                payment_method: payMethod,
                description: payNote || undefined,
            });
            showToast('Salary payment recorded.', 'success');
            await Promise.all([fetchPayrolls(), fetchTransactions()]);
            const refreshed = await api.get('/hr/payrolls/pending', { params: { user_id: selectedPayroll.user_id, month: selectedPayroll.month, year: selectedPayroll.year, limit: 1 } });
            const updated = (refreshed.data?.data || []).find((p: PayrollItem) => p.id === selectedPayroll.id) || null;
            setSelectedPayroll(updated);
            if (updated) setPayAmount(String(updated.pending_amount > 0 ? updated.pending_amount : ''));
            setPayNote('');
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to record salary payment', 'error');
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
                    <h1 className="text-2xl font-bold text-foreground">Financials</h1>
                    <p className="text-sm text-muted-foreground mt-1">Track transactions and manage salary payouts</p>
                </div>
                <div className="flex items-center gap-2">
                    {activeSection === 'transactions' && (
                        <>
                            <button onClick={handlePrintReport} className="btn-ghost"><FileText size={16} /> Print Report</button>
                            <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={18} /> Log Transaction</button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={() => setActiveSection('transactions')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${activeSection === 'transactions' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Transactions</button>
                <button onClick={() => setActiveSection('salaries')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${activeSection === 'salaries' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Pending Salaries</button>
            </div>

            {activeSection === 'transactions' && (
                <>
                    <div className="chart-card p-4 border border-border space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filters</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setTypeFilter('ALL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${typeFilter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>All</button>
                            <button onClick={() => setTypeFilter('INCOME')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${typeFilter === 'INCOME' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Income</button>
                            <button onClick={() => setTypeFilter('EXPENSE')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${typeFilter === 'EXPENSE' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Expense</button>
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">Category</label>
                            <select className="input-dark" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                                <option value="ALL">All Categories</option>
                                <option value="SUBSCRIPTION">Subscription</option>
                                <option value="POS_SALE">POS Sale</option>
                                <option value="OTHER_INCOME">Other Income</option>
                                <option value="SALARY">Salary</option>
                                <option value="RENT">Rent</option>
                                <option value="UTILITIES">Utilities</option>
                                <option value="MAINTENANCE">Maintenance</option>
                                <option value="EQUIPMENT">Equipment</option>
                                <option value="OTHER_EXPENSE">Other Expense</option>
                            </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => applyPreset('all')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>All Dates</button>
                            <button onClick={() => applyPreset('today')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'today' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Today</button>
                            <button onClick={() => applyPreset('7d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '7d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Last 7 Days</button>
                            <button onClick={() => applyPreset('30d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '30d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Last 30 Days</button>
                            <button onClick={() => applyPreset('custom')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Custom</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
                                <input type="date" className="input-dark" value={startDate} onChange={(e) => { setDatePreset('custom'); setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">End Date</label>
                                <input type="date" className="input-dark" value={endDate} min={startDate} onChange={(e) => { setDatePreset('custom'); setEndDate(e.target.value); }} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20"><ArrowUpCircle size={22} className="text-emerald-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">Total Income</p><p className="text-2xl font-bold text-foreground">{pageSummary.total_income.toFixed(2)} JOD</p></div></div>
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20"><ArrowDownCircle size={22} className="text-red-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">Total Expenses</p><p className="text-2xl font-bold text-foreground">{pageSummary.total_expenses.toFixed(2)} JOD</p></div></div>
                        <div className="kpi-card flex items-center gap-4 border border-border"><div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20"><Wallet size={22} className="text-blue-500" /></div><div><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</p><p className={`text-2xl font-bold ${(pageSummary.net_profit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pageSummary.net_profit.toFixed(2)} JOD</p></div></div>
                    </div>

                    <div className="chart-card overflow-hidden !p-0 border border-border">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                            <h3 className="text-sm font-semibold text-muted-foreground">Transactions</h3>
                            <span className="text-xs text-muted-foreground">Total: {transactionsTotal}</span>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left table-dark min-w-[550px]"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead>
                                <tbody>
                                    {filteredTransactions.length === 0 && (<tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No transactions yet</td></tr>)}
                                    {filteredTransactions.map((tx) => (<tr key={tx.id}><td>{new Date(tx.date).toLocaleDateString()}</td><td className="!text-foreground font-medium">{tx.description || '-'}</td><td className="text-xs">{tx.category.replace(/_/g, ' ')}</td><td><span className={`badge ${tx.type === 'INCOME' ? 'badge-green' : 'badge-red'}`}>{tx.type}</span></td><td className={`text-right font-mono text-sm font-semibold ${tx.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>{tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toFixed(2)}</td><td className="text-right"><button onClick={() => handlePrintReceipt(tx)} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Print Receipt"><Printer size={16} /></button></td></tr>))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Page {transactionsPage} of {totalTransactionPages}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={transactionsPage <= 1}
                                    onClick={() => setTransactionsPage((prev) => Math.max(1, prev - 1))}
                                >
                                    Previous
                                </button>
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={transactionsPage >= totalTransactionPages}
                                    onClick={() => setTransactionsPage((prev) => Math.min(totalTransactionPages, prev + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeSection === 'salaries' && (
                <div className="space-y-4">
                    <div className="chart-card p-4 border border-border space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Salary Filters</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setSalaryStatusFilter('ALL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'ALL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>All</button>
                            <button onClick={() => setSalaryStatusFilter('DRAFT')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'DRAFT' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Draft</button>
                            <button onClick={() => setSalaryStatusFilter('PARTIAL')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'PARTIAL' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Partial</button>
                            <button onClick={() => setSalaryStatusFilter('PAID')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${salaryStatusFilter === 'PAID' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Paid</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Salary Cutoff Day</label>
                                <input type="number" min={1} max={31} className="input-dark" value={salaryCutoffInput} onChange={(e) => setSalaryCutoffInput(e.target.value)} />
                                <p className="text-[11px] text-muted-foreground mt-1">Current: {salaryCutoffDay}</p>
                            </div>
                            <button className="btn-ghost" onClick={saveCutoffDay}><Settings2 size={14} /> Save Cutoff</button>
                        </div>
                        <div className="field-with-icon"><Search size={14} className="field-icon" /><input value={salarySearch} onChange={(e) => setSalarySearch(e.target.value)} placeholder="Search employee" className="input-dark input-with-icon" /></div>
                    </div>

                    <div className="chart-card overflow-hidden !p-0 border border-border">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                            <h3 className="text-sm font-semibold text-muted-foreground">Pending Salaries Management</h3>
                            <span className="text-xs text-muted-foreground">Total: {payrollsTotal}</span>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left table-dark min-w-[900px]"><thead><tr><th>Employee</th><th>Period</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Pending</th><th>Paid At</th><th className="text-right">Actions</th></tr></thead>
                                <tbody>
                                    {payrolls.length === 0 && (<tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No payroll records</td></tr>)}
                                    {payrolls.map((item) => (
                                        <tr key={item.id}>
                                            <td><p className="text-foreground font-medium">{item.user_name}</p><p className="text-xs text-muted-foreground">{item.user_email}</p></td>
                                            <td>{String(item.month).padStart(2, '0')}/{item.year}</td>
                                            <td><span className={`badge ${item.status === 'PAID' ? 'badge-green' : item.status === 'PARTIAL' ? 'badge-blue' : 'badge-amber'}`}>{item.status}</span></td>
                                            <td className="text-right font-mono text-foreground">{item.total_pay.toFixed(2)} JOD</td>
                                            <td className="text-right font-mono text-foreground">{item.paid_amount.toFixed(2)} JOD</td>
                                            <td className={`text-right font-mono ${item.pending_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{item.pending_amount.toFixed(2)} JOD</td>
                                            <td className="text-xs text-muted-foreground">{item.paid_at ? new Date(item.paid_at).toLocaleString() : '-'}</td>
                                            <td><div className="flex items-center justify-end gap-2"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setSelectedPayroll(item); setPayAmount(item.pending_amount > 0 ? String(item.pending_amount) : ''); setPayMethod('CASH'); setPayNote(''); }}>Details</button>{item.status !== 'PAID' ? (<button className="btn-primary !px-2 !py-1 text-xs" onClick={() => updatePayrollStatus(item, 'PAID')} disabled={updatingPayrollId === item.id || item.pending_amount > 0}><CheckCircle2 size={14} /> Mark Paid</button>) : (<button className="btn-ghost !px-2 !py-1 text-xs text-amber-400" onClick={() => updatePayrollStatus(item, 'DRAFT')} disabled={updatingPayrollId === item.id}><RotateCcw size={14} /> Reopen</button>)}</div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Page {payrollsPage} of {totalPayrollPages}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={payrollsPage <= 1}
                                    onClick={() => setPayrollsPage((prev) => Math.max(1, prev - 1))}
                                >
                                    Previous
                                </button>
                                <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={payrollsPage >= totalPayrollPages}
                                    onClick={() => setPayrollsPage((prev) => Math.min(totalPayrollPages, prev + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm p-6 w-full max-w-md shadow-2xl bg-card border border-border">
                        <h2 className="text-lg font-bold text-foreground mb-5">Log Transaction</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label><select className="input-dark" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}><option value="INCOME">Income</option><option value="EXPENSE">Expense</option></select></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label><select className="input-dark" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}><option value="OTHER_INCOME">Other Income</option><option value="SUBSCRIPTION">Subscription</option><option value="POS_SALE">POS Sale</option><option value="RENT">Rent</option><option value="SALARY">Salary</option><option value="UTILITIES">Utilities</option><option value="MAINTENANCE">Maintenance</option><option value="EQUIPMENT">Equipment</option><option value="OTHER_EXPENSE">Other Expense</option></select></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Amount (JOD)</label><input type="number" step="0.01" required className="input-dark" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} /></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label><input type="text" className="input-dark" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Monthly gym subscription" /></div>
                            <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Payment Method</label><select className="input-dark" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="TRANSFER">Bank Transfer</option></select></div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Save Transaction</button></div>
                        </form>
                    </div>
                </div>
            )}

            {selectedPayroll && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm p-6 w-full max-w-lg shadow-2xl bg-card border border-border space-y-4">
                        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CircleDollarSign size={18} /> Salary Details</h2><p className="text-sm text-muted-foreground">{selectedPayroll.user_name} - {String(selectedPayroll.month).padStart(2, '0')}/{selectedPayroll.year}</p></div><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSelectedPayroll(null)}>Close</button></div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Base Pay</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.base_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Overtime Pay</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.overtime_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Overtime Hours</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.overtime_hours.toFixed(2)} h</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Commission</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.commission_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Bonus</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.bonus_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Deductions</p><p className="font-mono font-semibold text-red-400">-{selectedPayroll.deductions.toFixed(2)} JOD</p></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Net Total</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.total_pay.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Paid</p><p className="font-mono font-semibold text-foreground">{selectedPayroll.paid_amount.toFixed(2)} JOD</p></div>
                            <div className="rounded-lg p-3 bg-card border border-border"><p className="text-xs text-muted-foreground">Pending</p><p className={`font-mono font-semibold ${selectedPayroll.pending_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{selectedPayroll.pending_amount.toFixed(2)} JOD</p></div>
                        </div>
                        {selectedPayroll.pending_amount > 0 && (
                            <div className="space-y-3 rounded-lg p-3 bg-card border border-border">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Record Payment</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <input type="number" min={0.01} step="0.01" max={selectedPayroll.pending_amount} className="input-dark" placeholder="Amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                                    <select className="input-dark" value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}>
                                        <option value="CASH">Cash</option>
                                        <option value="CARD">Card</option>
                                        <option value="TRANSFER">Transfer</option>
                                    </select>
                                    <button className="btn-primary" onClick={submitPayrollPayment} disabled={payingPayrollId === selectedPayroll.id}>Pay</button>
                                </div>
                                <input type="text" className="input-dark" placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
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
