'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, ArrowUpCircle, ArrowDownCircle, Wallet, Printer, FileText } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';

interface Transaction {
    id: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    description: string;
    date: string;
    payment_method: string;
}

export default function FinancePage() {
    const { showToast } = useFeedback();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
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

    const fetchData = useCallback(async () => {
        if (startDate > endDate) {
            showToast('Start date cannot be after end date.', 'error');
            return;
        }
        setLoading(true);
        try {
            const listRes = await api.get('/finance/transactions', { params: { limit: 500 } });
            setTransactions(listRes.data.data);
        } catch {
            showToast('Failed to load financial data.', 'error');
        }
        setLoading(false);
    }, [endDate, showToast, startDate]);

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

    const filteredTransactions = useMemo(() => {
        if (datePreset === 'all') return transactions;
        return transactions.filter((tx) => {
            const d = new Date(tx.date);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const txDate = `${y}-${m}-${day}`;
            return txDate >= startDate && txDate <= endDate;
        });
    }, [transactions, startDate, endDate, datePreset]);

    const filteredSummary = useMemo(() => {
        const total_income = filteredTransactions
            .filter(tx => tx.type === 'INCOME')
            .reduce((sum, tx) => sum + tx.amount, 0);
        const total_expenses = filteredTransactions
            .filter(tx => tx.type === 'EXPENSE')
            .reduce((sum, tx) => sum + tx.amount, 0);
        return {
            total_income,
            total_expenses,
            net_profit: total_income - total_expenses,
        };
    }, [filteredTransactions]);

    const reportRows = useMemo(() => {
        return filteredTransactions.map(tx => ({
            ...tx,
            sign: tx.type === 'INCOME' ? '+' : '-',
        }));
    }, [filteredTransactions]);

    const handlePrintReceipt = (tx: Transaction) => {
        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                showToast('Popup blocked. Allow popups to print receipt.', 'error');
                return;
            }

            const html = `
                <html>
                    <head>
                        <title>Receipt - ${tx.id.slice(0, 8).toUpperCase()}</title>
                        <style>
                            body { font-family: monospace; padding: 20px; max-width: 400px; margin: 0 auto; color: #000; }
                            h2 { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
                            .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
                            .footer { text-align: center; margin-top: 30px; font-size: 0.8rem; border-top: 1px dashed #000; padding-top: 10px; }
                        </style>
                    </head>
                    <body>
                        <h2>Gym ERP Management</h2>
                        <div class="row"><span>Receipt No:</span> <span>${tx.id.slice(0, 8).toUpperCase()}</span></div>
                        <div class="row"><span>Date:</span> <span>${new Date(tx.date).toLocaleString()}</span></div>
                        <div class="row"><span>Billed To:</span> <span>Guest/System</span></div>
                        <br/>
                        <div class="row"><span>Item:</span> <span>${tx.description || 'Gym Service/Item'}</span></div>
                        <div class="row"><span>Type:</span> <span>${tx.type} / ${tx.category.replace(/_/g, ' ')}</span></div>
                        <div class="row"><span>Method:</span> <span>${tx.payment_method}</span></div>
                        <div class="row total"><span>TOTAL:</span> <span>${tx.amount.toFixed(2)} JOD</span></div>
                        
                        <div class="footer">Thank you for your business!</div>
                        <script>window.onload = function() { window.print(); window.close(); }</script>
                    </body>
                </html>
            `;
            printWindow.document.write(html);
            printWindow.document.close();
        } catch {
            showToast('Failed to generate receipt', 'error');
        }
    };

    const handlePrintReport = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showToast('Popup blocked. Allow popups to print report.', 'error');
            return;
        }

        const summaryData = filteredSummary ?? { total_income: 0, total_expenses: 0, net_profit: 0 };
        const rowsHtml = reportRows.length > 0
            ? reportRows.map((tx) => `
                <tr>
                    <td>${new Date(tx.date).toLocaleDateString()}</td>
                    <td>${tx.description || '-'}</td>
                    <td>${tx.category.replace(/_/g, ' ')}</td>
                    <td>${tx.type}</td>
                    <td style="text-align:right;">${tx.sign}${tx.amount.toFixed(2)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" style="text-align:center; padding:16px;">No transactions in selected date range</td></tr>';

        const html = `
            <html>
                <head>
                    <title>Financial Report (${startDate} to ${endDate})</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
                        h2 { margin: 0 0 8px 0; }
                        .meta { color: #555; margin-bottom: 14px; }
                        .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0 18px 0; }
                        .card { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background: #f5f5f5; }
                    </style>
                </head>
                <body>
                    <h2>Financial Report</h2>
                    <div class="meta">Date range: ${datePreset === 'all' ? 'All Dates' : `${startDate} to ${endDate}`}</div>
                    <div class="summary">
                        <div class="card"><strong>Total Income</strong><br/>${summaryData.total_income.toFixed(2)} JOD</div>
                        <div class="card"><strong>Total Expenses</strong><br/>${summaryData.total_expenses.toFixed(2)} JOD</div>
                        <div class="card"><strong>Net Profit</strong><br/>${summaryData.net_profit.toFixed(2)} JOD</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th>Type</th>
                                <th style="text-align:right;">Amount (JOD)</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    <script>window.onload = function() { window.print(); window.close(); }</script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
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
            fetchData();
        } catch {
            showToast('Failed to log transaction', 'error');
        }
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Financials</h1>
                    <p className="text-sm text-muted-foreground mt-1">Track income, expenses and profit</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handlePrintReport} className="btn-ghost">
                        <FileText size={16} /> Print Report
                    </button>
                    <button onClick={() => setShowModal(true)} className="btn-primary">
                        <Plus size={18} /> Log Transaction
                    </button>
                </div>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Slicer</p>
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
                        <input
                            type="date"
                            className="input-dark"
                            value={startDate}
                            onChange={(e) => {
                                setDatePreset('custom');
                                setStartDate(e.target.value);
                                if (e.target.value > endDate) setEndDate(e.target.value);
                            }}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">End Date</label>
                        <input
                            type="date"
                            className="input-dark"
                            value={endDate}
                            min={startDate}
                            onChange={(e) => {
                                setDatePreset('custom');
                                setEndDate(e.target.value);
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="kpi-card flex items-center gap-4 border border-border">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
                        <ArrowUpCircle size={22} className="text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">Total Income</p>
                        <p className="text-2xl font-bold text-foreground">{filteredSummary.total_income.toFixed(2)} JOD</p>
                    </div>
                </div>
                <div className="kpi-card flex items-center gap-4 border border-border">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20">
                        <ArrowDownCircle size={22} className="text-red-500" />
                    </div>
                    <div>
                        <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">Total Expenses</p>
                        <p className="text-2xl font-bold text-foreground">{filteredSummary.total_expenses.toFixed(2)} JOD</p>
                    </div>
                </div>
                <div className="kpi-card flex items-center gap-4 border border-border">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20">
                        <Wallet size={22} className="text-blue-500" />
                    </div>
                    <div>
                        <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</p>
                        <p className={`text-2xl font-bold ${(filteredSummary.net_profit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {filteredSummary.net_profit.toFixed(2)} JOD
                        </p>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-muted-foreground">Recent Transactions</h3>
                </div>
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[550px]">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th>Type</th>
                                <th className="text-right">Amount</th>
                                <th className="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.length === 0 && (
                                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No transactions yet</td></tr>
                            )}
                            {filteredTransactions.map((tx) => (
                                <tr key={tx.id}>
                                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                                    <td className="!text-foreground font-medium">{tx.description || '-'}</td>
                                    <td className="text-xs">{tx.category.replace(/_/g, ' ')}</td>
                                    <td>
                                        <span className={`badge ${tx.type === 'INCOME' ? 'badge-green' : 'badge-red'}`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className={`text-right font-mono text-sm font-semibold ${tx.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toFixed(2)}
                                    </td>
                                    <td className="text-right">
                                        <button onClick={() => handlePrintReceipt(tx)} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Print Receipt">
                                            <Printer size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="md:hidden divide-y divide-border">
                    {filteredTransactions.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet</div>
                    )}
                    {filteredTransactions.map((tx) => (
                        <div key={tx.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground truncate">{tx.description || '--'}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</p>
                                </div>
                                <span className={`badge ${tx.type === 'INCOME' ? 'badge-green' : 'badge-red'}`}>
                                    {tx.type}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">Category</p>
                                    <p className="mt-0.5 font-medium text-foreground">{tx.category.replace(/_/g, ' ')}</p>
                                </div>
                                <div className="rounded-sm border border-border bg-muted/20 p-2">
                                    <p className="text-muted-foreground">Amount</p>
                                    <p className={`mt-0.5 font-mono font-semibold ${tx.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 flex justify-end">
                                <button
                                    onClick={() => handlePrintReceipt(tx)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs justify-center"
                                    title="Print Receipt"
                                >
                                    <Printer size={14} /> Receipt
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm p-6 w-full max-w-md shadow-2xl bg-card border border-border">
                        <h2 className="text-lg font-bold text-foreground mb-5">Log Transaction</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
                                <select className="input-dark" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                    <option value="INCOME">Income</option>
                                    <option value="EXPENSE">Expense</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                                <select className="input-dark" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                    <option value="OTHER_INCOME">Other Income</option>
                                    <option value="SUBSCRIPTION">Subscription</option>
                                    <option value="POS_SALE">POS Sale</option>
                                    <option value="RENT">Rent</option>
                                    <option value="SALARY">Salary</option>
                                    <option value="UTILITIES">Utilities</option>
                                    <option value="MAINTENANCE">Maintenance</option>
                                    <option value="EQUIPMENT">Equipment</option>
                                    <option value="OTHER_EXPENSE">Other Expense</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Amount (JOD)</label>
                                <input type="number" step="0.01" required className="input-dark" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                                <input type="text" className="input-dark" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Monthly gym subscription" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Payment Method</label>
                                <select className="input-dark" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}>
                                    <option value="CASH">Cash</option>
                                    <option value="CARD">Card</option>
                                    <option value="BANK_TRANSFER">Bank Transfer</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                                <button type="submit" className="btn-primary">Save Transaction</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
