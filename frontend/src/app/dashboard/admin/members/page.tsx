'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, UserPlus, Save, Shield, Snowflake, XCircle, RefreshCw } from 'lucide-react';
import Modal from '@/components/Modal';

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

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ full_name: '', email: '', password: 'password123', role: 'CUSTOMER' });

    const [isManageOpen, setIsManageOpen] = useState(false);
    const [manageMember, setManageMember] = useState<Member | null>(null);
    const [subPlan, setSubPlan] = useState('Monthly');
    const [subDays, setSubDays] = useState(30);

    useEffect(() => { fetchMembers(); }, []);

    const fetchMembers = async () => {
        try {
            const res = await api.get('/hr/members');
            setMembers(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/auth/register', addForm);
            setIsAddOpen(false);
            setAddForm({ full_name: '', email: '', password: 'password123', role: 'CUSTOMER' });
            fetchMembers();
        } catch (err) {
            console.error(err);
            alert('Failed to register member.');
        }
    };

    const openManage = (member: Member) => {
        setManageMember(member);
        setSubPlan('Monthly');
        setSubDays(30);
        setIsManageOpen(true);
    };

    const handleCreateSub = async () => {
        if (!manageMember) return;
        try {
            await api.post('/hr/subscriptions', {
                user_id: manageMember.id,
                plan_name: subPlan,
                duration_days: subDays
            });
            setIsManageOpen(false);
            fetchMembers();
        } catch (err) {
            console.error(err);
            alert('Failed to create subscription.');
        }
    };

    const handleSubAction = async (action: string) => {
        if (!manageMember) return;
        try {
            await api.put(`/hr/subscriptions/${manageMember.id}`, { status: action });
            setIsManageOpen(false);
            fetchMembers();
        } catch (err) {
            console.error(err);
            alert(`Failed to ${action.toLowerCase()} subscription.`);
        }
    };

    const statusBadge = (status?: string) => {
        switch (status) {
            case 'ACTIVE': return 'badge-green';
            case 'FROZEN': return 'badge-blue';
            case 'EXPIRED': return 'badge-red';
            default: return 'badge-gray';
        }
    };

    const filtered = members.filter(m =>
        m.full_name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Members</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">{members.length} registered members</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
                        <input
                            type="text"
                            placeholder="Search members..."
                            className="input-dark pl-9 w-full sm:w-64"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <button onClick={() => setIsAddOpen(true)} className="btn-primary">
                        <UserPlus size={18} /> Add Member
                    </button>
                </div>
            </div>

            {/* Members Table */}
            <div className="chart-card overflow-hidden !p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Subscription</th>
                                <th>Expires</th>
                                <th className="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-[#333] text-sm">No members found</td></tr>
                            )}
                            {filtered.map(m => (
                                <tr key={m.id}>
                                    <td className="!text-white font-medium">{m.full_name}</td>
                                    <td>{m.email}</td>
                                    <td>
                                        <span className={`badge ${statusBadge(m.subscription?.status)}`}>
                                            {m.subscription?.status || 'NONE'}
                                        </span>
                                    </td>
                                    <td>
                                        {m.subscription?.end_date ? new Date(m.subscription.end_date).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="text-center">
                                        <button
                                            onClick={() => openManage(m)}
                                            className="text-[#FF6B00] hover:text-[#FF8533] text-xs font-medium px-2 py-1 rounded-lg hover:bg-[#FF6B00]/10 transition-colors"
                                        >
                                            Manage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ===== ADD MEMBER MODAL ===== */}
            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Member">
                <form onSubmit={handleAddMember} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Full Name</label>
                        <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Email</label>
                        <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> Register</button>
                    </div>
                </form>
            </Modal>

            {/* ===== MANAGE MEMBER MODAL ===== */}
            <Modal isOpen={isManageOpen} onClose={() => setIsManageOpen(false)} title={`Manage — ${manageMember?.full_name}`}>
                <div className="space-y-5">
                    {/* Current status */}
                    <div className="flex items-center justify-between rounded-xl p-4" style={{ background: '#2a2a2a' }}>
                        <div>
                            <p className="text-xs text-[#6B6B6B]">Current Status</p>
                            <span className={`badge mt-1 ${statusBadge(manageMember?.subscription?.status)}`}>
                                {manageMember?.subscription?.status || 'NO SUBSCRIPTION'}
                            </span>
                        </div>
                        {manageMember?.subscription?.end_date && (
                            <div className="text-right">
                                <p className="text-xs text-[#6B6B6B]">Expires</p>
                                <p className="text-sm font-medium text-white mt-1">{new Date(manageMember.subscription.end_date).toLocaleDateString()}</p>
                            </div>
                        )}
                    </div>

                    {/* Create / Renew */}
                    <div className="border border-[#333] rounded-xl p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Shield size={16} className="text-[#FF6B00]" /> {manageMember?.subscription ? 'Renew' : 'Create'} Subscription</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-[#6B6B6B] mb-1">Plan</label>
                                <select className="input-dark" value={subPlan} onChange={e => { setSubPlan(e.target.value); setSubDays(e.target.value === 'Monthly' ? 30 : e.target.value === 'Quarterly' ? 90 : 365); }}>
                                    <option value="Monthly">Monthly (30d)</option>
                                    <option value="Quarterly">Quarterly (90d)</option>
                                    <option value="Annual">Annual (365d)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-[#6B6B6B] mb-1">Duration (days)</label>
                                <input type="number" className="input-dark" value={subDays} onChange={e => setSubDays(Number(e.target.value))} />
                            </div>
                        </div>
                        <button onClick={handleCreateSub} className="btn-primary w-full justify-center">
                            <RefreshCw size={15} /> {manageMember?.subscription ? 'Renew Subscription' : 'Activate Subscription'}
                        </button>
                    </div>

                    {/* Quick actions */}
                    {manageMember?.subscription && (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleSubAction('FROZEN')}
                                disabled={manageMember.subscription.status === 'FROZEN'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-blue-500/30 text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Snowflake size={15} /> Freeze
                            </button>
                            <button
                                onClick={() => handleSubAction('EXPIRED')}
                                disabled={manageMember.subscription.status === 'EXPIRED'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-red-500/30 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <XCircle size={15} /> Cancel
                            </button>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
