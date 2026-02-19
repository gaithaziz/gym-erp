'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';

interface Transaction {
    id: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    description: string;
    date: string;
    payment_method: string;
}

interface FinanceSummary {
    total_income: number;
    total_expenses: number;
    net_profit: number;
}

export default function FinancePage() {
    const [summary, setSummary] = useState<FinanceSummary | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const [formData, setFormData] = useState({
        amount: '',
        type: 'INCOME',
        category: 'OTHER_INCOME',
        description: '',
        payment_method: 'CASH'
    });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const sumRes = await api.get('/finance/summary');
            setSummary(sumRes.data.data);
            const listRes = await api.get('/finance/transactions');
            setTransactions(listRes.data.data);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
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
            fetchData();
        } catch (err) {
            alert("Failed to log transaction");
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
                    <h1 className="text-2xl font-bold text-white">Financials</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">Track income, expenses and profit</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary">
                    <Plus size={18} /> Log Transaction
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="kpi-card flex items-center gap-4">
                    <div className="icon-green h-12 w-12 rounded-xl flex items-center justify-center">
                        <ArrowUpCircle size={22} className="text-white" />
                    </div>
                    <div>
                        <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Total Income</p>
                        <p className="text-2xl font-bold text-white">{summary?.total_income.toFixed(2)} JOD</p>
                    </div>
                </div>
                <div className="kpi-card flex items-center gap-4">
                    <div className="icon-red h-12 w-12 rounded-xl flex items-center justify-center">
                        <ArrowDownCircle size={22} className="text-white" />
                    </div>
                    <div>
                        <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Total Expenses</p>
                        <p className="text-2xl font-bold text-white">{summary?.total_expenses.toFixed(2)} JOD</p>
                    </div>
                </div>
                <div className="kpi-card flex items-center gap-4">
                    <div className="icon-blue h-12 w-12 rounded-xl flex items-center justify-center">
                        <Wallet size={22} className="text-white" />
                    </div>
                    <div>
                        <p className="text-[0.65rem] font-semibold text-[#6B6B6B] uppercase tracking-wider">Net Profit</p>
                        <p className={`text-2xl font-bold ${(summary?.net_profit ?? 0) >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                            {summary?.net_profit.toFixed(2)} JOD
                        </p>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="chart-card overflow-hidden !p-0">
                <div className="px-6 py-4 border-b border-white/5">
                    <h3 className="text-sm font-semibold text-[#A3A3A3]">Recent Transactions</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[550px]">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th>Type</th>
                                <th className="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-[#333] text-sm">No transactions yet</td></tr>
                            )}
                            {transactions.map((tx) => (
                                <tr key={tx.id}>
                                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                                    <td className="!text-white font-medium">{tx.description || '—'}</td>
                                    <td className="text-xs">{tx.category.replace(/_/g, ' ')}</td>
                                    <td>
                                        <span className={`badge ${tx.type === 'INCOME' ? 'badge-green' : 'badge-red'}`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className={`text-right font-mono text-sm font-semibold ${tx.type === 'INCOME' ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                                        {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-2xl p-6 w-full max-w-md shadow-2xl" style={{ background: '#1e1e1e', border: '1px solid #333' }}>
                        <h2 className="text-lg font-bold text-white mb-5">Log Transaction</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Type</label>
                                <select className="input-dark" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                    <option value="INCOME">Income</option>
                                    <option value="EXPENSE">Expense</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Category</label>
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
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Amount (JOD)</label>
                                <input type="number" step="0.01" required className="input-dark" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Description</label>
                                <input type="text" className="input-dark" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Monthly gym subscription" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Payment Method</label>
                                <select className="input-dark" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}>
                                    <option value="CASH">Cash</option>
                                    <option value="CARD">Card</option>
                                    <option value="BANK_TRANSFER">Bank Transfer</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
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
