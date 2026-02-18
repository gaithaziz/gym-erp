'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, Search } from 'lucide-react';

interface Member {
    id: string;
    full_name: string;
    email: string;
    subscription: {
        status: string;
        end_date: string | null;
    } | null;
}

export default function MembersPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => { fetchMembers(); }, []);

    const fetchMembers = async () => {
        try {
            const res = await api.get('/hr/members');
            setMembers(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const filtered = members.filter(m =>
        m.full_name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase())
    );

    const statusColor = (status: string | undefined) => {
        if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700';
        if (status === 'FROZEN') return 'bg-amber-50 text-amber-700';
        return 'bg-red-50 text-red-600';
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
                    <h1 className="text-2xl font-bold text-slate-800">Members</h1>
                    <p className="text-sm text-slate-400 mt-1">{members.length} registered members</p>
                </div>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input
                        type="text"
                        placeholder="Search members..."
                        className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none w-64"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="chart-card overflow-hidden !p-0">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-3 font-medium">Name</th>
                            <th className="px-6 py-3 font-medium">Email</th>
                            <th className="px-6 py-3 font-medium">Subscription</th>
                            <th className="px-6 py-3 font-medium">Expires</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 && (
                            <tr><td colSpan={4} className="text-center py-8 text-slate-300 text-sm">No members found</td></tr>
                        )}
                        {filtered.map(m => (
                            <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-700">{m.full_name}</td>
                                <td className="px-6 py-4 text-slate-400">{m.email}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(m.subscription?.status)}`}>
                                        {m.subscription?.status || 'NONE'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-400 text-sm">
                                    {m.subscription?.end_date ? new Date(m.subscription.end_date).toLocaleDateString() : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
