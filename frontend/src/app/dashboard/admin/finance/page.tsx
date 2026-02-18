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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Financials</h1>
                    <p className="text-sm text-slate-400 mt-1">Track income, expenses and profit</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-5 py-2.5 rounded-xl hover:shadow-lg hover:shadow-green-200 transition-all text-sm font-medium"
                >
                    <Plus size={18} />
                    <span>Log Transaction</span>
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="kpi-card flex items-center gap-4">
                    <div className="icon-green h-12 w-12 rounded-xl flex items-center justify-center shadow-lg">
                        <ArrowUpCircle size={22} className="text-white" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Income</p>
                        <p className="text-2xl font-bold text-slate-800">{summary?.total_income.toFixed(2)} JOD</p>
                    </div>
                </div>
                <div className="kpi-card flex items-center gap-4">
                    <div className="icon-red h-12 w-12 rounded-xl flex items-center justify-center shadow-lg">
                        <ArrowDownCircle size={22} className="text-white" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Expenses</p>
                        <p className="text-2xl font-bold text-slate-800">{summary?.total_expenses.toFixed(2)} JOD</p>
                    </div>
                </div>
                <div className="kpi-card flex items-center gap-4">
                    <div className="icon-blue h-12 w-12 rounded-xl flex items-center justify-center shadow-lg">
                        <Wallet size={22} className="text-white" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Profit</p>
                        <p className={`text-2xl font-bold ${(summary?.net_profit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {summary?.net_profit.toFixed(2)} JOD
                        </p>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="chart-card overflow-hidden !p-0">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">Recent Transactions</h3>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-3 font-medium">Date</th>
                            <th className="px-6 py-3 font-medium">Description</th>
                            <th className="px-6 py-3 font-medium">Category</th>
                            <th className="px-6 py-3 font-medium">Type</th>
                            <th className="px-6 py-3 font-medium text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {transactions.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-8 text-slate-300 text-sm">No transactions yet</td></tr>
                        )}
                        {transactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 text-slate-400 text-sm">{new Date(tx.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 font-medium text-slate-700 text-sm">{tx.description || '—'}</td>
                                <td className="px-6 py-4 text-xs text-slate-400">{tx.category.replace(/_/g, ' ')}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        ${tx.type === 'INCOME' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                        {tx.type}
                                    </span>
                                </td>
                                <td className={`px-6 py-4 text-right font-mono text-sm font-semibold ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-800 mb-5">Log Transaction</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Type</label>
                                <select className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                    <option value="INCOME">Income</option>
                                    <option value="EXPENSE">Expense</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Category</label>
                                <select className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
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
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Amount (JOD)</label>
                                <input type="number" step="0.01" required className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                                <input type="text" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Monthly gym subscription" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Payment Method</label>
                                <select className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}>
                                    <option value="CASH">Cash</option>
                                    <option value="CARD">Card</option>
                                    <option value="BANK_TRANSFER">Bank Transfer</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-sm">Cancel</button>
                                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all text-sm font-medium">Save Transaction</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
