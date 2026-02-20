'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, UserPlus, Save, Shield, Snowflake, XCircle, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';

interface Member {
    id: string;
    full_name: string;
    email: string;
    role: string;
    subscription: {
        status: string;
        end_date: string | null;
    } | null;
}

export default function MembersPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Add Modal
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ full_name: '', email: '', password: 'password123', role: 'CUSTOMER' });

    // Edit Modal
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ id: '', full_name: '', email: '' });

    // Subscription Modal
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [manageMember, setManageMember] = useState<Member | null>(null);
    const [subPlan, setSubPlan] = useState('Monthly');
    const [subDays, setSubDays] = useState(30);

    const fetchMembers = async () => {
        try {
            const res = await api.get('/hr/members');
            setMembers(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { setTimeout(() => fetchMembers(), 0); }, []);

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

    const openEdit = (member: Member) => {
        setEditForm({ id: member.id, full_name: member.full_name, email: member.email });
        setIsEditOpen(true);
    };

    const handleEditMember = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.put(`/users/${editForm.id}`, {
                full_name: editForm.full_name,
                email: editForm.email
            });
            setIsEditOpen(false);
            fetchMembers();
        } catch (err) {
            console.error(err);
            alert('Failed to update member.');
        }
    };

    const handleDeleteMember = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to deactivate ${name}? This action cannot be easily undone.`)) return;
        try {
            await api.delete(`/users/${id}`);
            fetchMembers();
        } catch (err) {
            console.error(err);
            alert('Failed to deactivate member.');
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
                    <h1 className="text-2xl font-bold text-foreground">Members</h1>
                    <p className="text-sm text-muted-foreground mt-1">{members.length} registered members</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[800px]">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Subscription</th>
                                <th>Expires</th>
                                <th className="text-right pr-6">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No members found</td></tr>
                            )}
                            {filtered.map(m => (
                                <tr key={m.id}>
                                    <td className="!text-foreground font-medium">{m.full_name}</td>
                                    <td>{m.email}</td>
                                    <td>
                                        <span className={`badge ${statusBadge(m.subscription?.status)}`}>
                                            {m.subscription?.status || 'NONE'}
                                        </span>
                                    </td>
                                    <td>
                                        {m.subscription?.end_date ? new Date(m.subscription.end_date).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="text-right pr-6">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openManage(m)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs"
                                                title="Manage Subscription"
                                            >
                                                <Shield size={14} className="mr-1" /> Sub
                                            </button>
                                            <button
                                                onClick={() => openEdit(m)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs text-blue-400 hover:text-blue-300"
                                                title="Edit Details"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMember(m.id, m.full_name)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs text-destructive hover:text-destructive/80"
                                                title="Deactivate Member"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
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
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
                        <input type="text" required className="input-dark" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                        <input type="email" required className="input-dark" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> Register</button>
                    </div>
                </form>
            </Modal>

            {/* ===== EDIT MEMBER MODAL ===== */}
            <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Member Details">
                <form onSubmit={handleEditMember} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
                        <input type="text" required className="input-dark" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                        <input type="email" required className="input-dark" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsEditOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><Save size={16} /> Update</button>
                    </div>
                </form>
            </Modal>

            {/* ===== MANAGE SUBSCRIPTION MODAL ===== */}
            <Modal isOpen={isManageOpen} onClose={() => setIsManageOpen(false)} title={`Manage — ${manageMember?.full_name}`}>
                <div className="space-y-5">
                    {/* Current status */}
                    <div className="flex items-center justify-between rounded-sm p-4 bg-card border border-border">
                        <div>
                            <p className="text-xs text-muted-foreground">Current Status</p>
                            <span className={`badge mt-1 ${statusBadge(manageMember?.subscription?.status)}`}>
                                {manageMember?.subscription?.status || 'NO SUBSCRIPTION'}
                            </span>
                        </div>
                        {manageMember?.subscription?.end_date && (
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Expires</p>
                                <p className="text-sm font-medium text-foreground mt-1">{new Date(manageMember.subscription.end_date).toLocaleDateString()}</p>
                            </div>
                        )}
                    </div>

                    {/* Create / Renew */}
                    <div className="border border-border rounded-sm p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield size={16} className="text-primary" /> {manageMember?.subscription ? 'Renew' : 'Create'} Subscription</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Plan</label>
                                <select className="input-dark" value={subPlan} onChange={e => { setSubPlan(e.target.value); setSubDays(e.target.value === 'Monthly' ? 30 : e.target.value === 'Quarterly' ? 90 : 365); }}>
                                    <option value="Monthly">Monthly (30d)</option>
                                    <option value="Quarterly">Quarterly (90d)</option>
                                    <option value="Annual">Annual (365d)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Duration (days)</label>
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
                                className="flex items-center justify-center gap-2 py-2.5 border border-blue-500/30 text-blue-400 rounded-sm text-sm font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Snowflake size={15} /> Freeze
                            </button>
                            <button
                                onClick={() => handleSubAction('EXPIRED')}
                                disabled={manageMember.subscription.status === 'EXPIRED'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-red-500/30 text-red-400 rounded-sm text-sm font-medium hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
