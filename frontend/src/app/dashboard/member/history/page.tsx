'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { QrCode, Wallet, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';

interface AccessLog {
    id: string;
    scan_time: string;
    status: string;
    reason: string | null;
}

interface Transaction {
    id: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    description: string;
    date: string;
    payment_method: string;
}

export default function HistoryPage() {
    const [activeTab, setActiveTab] = useState<'ACCESS' | 'PAYMENTS'>('ACCESS');
    const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                // Fetch both in parallel
                const [accessRes, financeRes] = await Promise.all([
                    api.get('/access/my-history').catch(() => ({ data: { data: [] } })),
                    api.get('/finance/my-transactions').catch(() => ({ data: { data: [] } }))
                ]);

                setAccessLogs(accessRes.data.data || []);
                setTransactions(financeRes.data.data || []);
            } catch (err) {
                console.error("Failed to fetch history", err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, []);

    const LoadingSkeleton = () => (
        <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-muted/50 w-full" />
            ))}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">History & Logs</h1>
                <p className="text-sm text-muted-foreground mt-1">View your attendance and payment records</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setActiveTab('ACCESS')}
                    className={`px-6 py-3 text-sm font-medium font-mono uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'ACCESS'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <QrCode size={16} />
                    Access Logs
                </button>
                <button
                    onClick={() => setActiveTab('PAYMENTS')}
                    className={`px-6 py-3 text-sm font-medium font-mono uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'PAYMENTS'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <Wallet size={16} />
                    Payments
                </button>
            </div>

            <div className="min-h-[400px]">
                {loading ? (
                    <LoadingSkeleton />
                ) : activeTab === 'ACCESS' ? (
                    <div className="space-y-4">
                        {accessLogs.length > 0 ? (
                            accessLogs.map(log => (
                                <div key={log.id} className="kpi-card p-4 flex items-center justify-between group hover:border-primary transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-none border border-border ${log.status === 'GRANTED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                            {log.status === 'GRANTED' ? <CheckIcon /> : <Clock size={20} />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-foreground">
                                                {log.status === 'GRANTED' ? 'Check-in Successful' : 'Access Denied'}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                {format(new Date(log.scan_time), 'PPpp')}
                                            </p>
                                        </div>
                                    </div>
                                    {log.reason && (
                                        <span className="text-xs font-mono px-2 py-1 bg-muted text-muted-foreground uppercase">{log.reason}</span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <EmptyState icon={QrCode} text="No access logs found" />
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {transactions.length > 0 ? (
                            transactions.map(tx => (
                                <div key={tx.id} className="kpi-card p-4 flex items-center justify-between group hover:border-primary transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-none border border-border ${tx.type === 'INCOME' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                            {tx.type === 'INCOME' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-foreground">{tx.description || tx.category}</p>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                {format(new Date(tx.date), 'PP')} • {tx.payment_method}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-mono font-bold ${tx.type === 'INCOME' ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toFixed(2)} JOD
                                    </span>
                                </div>
                            ))
                        ) : (
                            <EmptyState icon={Wallet} text="No transactions found" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType, text: string }) {
    return (
        <div className="text-center py-12 flex flex-col items-center justify-center border border-dashed border-border">
            <div className="p-3 bg-muted/30 rounded-full mb-3">
                <Icon size={24} className="text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">{text}</p>
        </div>
    );
}

function CheckIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    )
}
