'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { Search, UserPlus, Save, Shield, Snowflake, XCircle, RefreshCw, Pencil, Trash2, Eye } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';

interface Member {
    id: string;
    full_name: string;
    email: string;
    role: string;
    profile_picture_url?: string;
    phone_number?: string;
    date_of_birth?: string;
    emergency_contact?: string;
    bio?: string;
    subscription: {
        status: string;
        end_date: string | null;
    } | null;
}

export default function MembersPage() {
    const { showToast, confirm: confirmAction } = useFeedback();
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

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

    // View Profile Modal
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [viewMember, setViewMember] = useState<Member | null>(null);

    const openView = (member: Member) => {
        setViewMember(member);
        setIsViewOpen(true);
    };

    const fetchMembers = async () => {
        try {
            const res = await api.get('/hr/members');
            setMembers(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { setTimeout(() => fetchMembers(), 0); }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim().toLowerCase());
        }, 250);
        return () => clearTimeout(timer);
    }, [search]);

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/auth/register', addForm);
            setIsAddOpen(false);
            setAddForm({ full_name: '', email: '', password: 'password123', role: 'CUSTOMER' });
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast('Failed to register member.', 'error');
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
            showToast('Failed to update member.', 'error');
        }
    };

    const handleDeleteMember = async (id: string, name: string) => {
        const confirmed = await confirmAction({
            title: 'Deactivate Member',
            description: `Are you sure you want to deactivate ${name}? This action cannot be easily undone.`,
            confirmText: 'Deactivate',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await api.delete(`/users/${id}`);
            fetchMembers();
        } catch (err) {
            console.error(err);
            showToast('Failed to deactivate member.', 'error');
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
            showToast('Failed to create subscription.', 'error');
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
            showToast(`Failed to ${action.toLowerCase()} subscription.`, 'error');
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

    const filtered = useMemo(() => {
        if (!debouncedSearch) return members;
        return members.filter(m =>
            m.full_name.toLowerCase().includes(debouncedSearch) ||
            m.email.toLowerCase().includes(debouncedSearch)
        );
    }, [members, debouncedSearch]);

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
                <div className="hidden md:block overflow-x-auto">
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
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                                {m.profile_picture_url ? (
                                                    <Image src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${m.profile_picture_url}`} alt={m.full_name} fill className="object-cover" unoptimized />
                                                ) : (
                                                    m.full_name.charAt(0)
                                                )}
                                            </div>
                                            <span className="!text-foreground font-medium">{m.full_name}</span>
                                        </div>
                                    </td>
                                    <td>{m.email}</td>
                                    <td>
                                        <span className={`badge ${statusBadge(m.subscription?.status)}`}>
                                            {m.subscription?.status || 'NONE'}
                                        </span>
                                    </td>
                                    <td>
                                        {m.subscription?.end_date ? new Date(m.subscription.end_date).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="text-right pr-6">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openView(m)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs text-emerald-400 hover:text-emerald-300"
                                                title="View Profile"
                                            >
                                                <Eye size={14} /> View
                                            </button>
                                            <button
                                                onClick={() => openManage(m)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs"
                                                title="Manage Subscription"
                                            >
                                                <Shield size={14} /> Sub
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

                <div className="md:hidden divide-y divide-border">
                    {filtered.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No members found</div>
                    )}
                    {filtered.map((m) => (
                        <div key={m.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                        {m.profile_picture_url ? (
                                            <Image src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${m.profile_picture_url}`} alt={m.full_name} fill className="object-cover" unoptimized />
                                        ) : (
                                            m.full_name.charAt(0)
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground truncate">{m.full_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                                    </div>
                                </div>
                                <span className={`badge ${statusBadge(m.subscription?.status)}`}>
                                    {m.subscription?.status || 'NONE'}
                                </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Expires</span>
                                <span className="text-foreground font-medium">
                                    {m.subscription?.end_date ? new Date(m.subscription.end_date).toLocaleDateString() : '--'}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => openView(m)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs text-emerald-400 hover:text-emerald-300 justify-center"
                                    title="View Profile"
                                >
                                    <Eye size={14} /> View
                                </button>
                                <button
                                    onClick={() => openManage(m)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs justify-center"
                                    title="Manage Subscription"
                                >
                                    <Shield size={14} /> Sub
                                </button>
                                <button
                                    onClick={() => openEdit(m)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs text-blue-400 hover:text-blue-300 justify-center"
                                    title="Edit Details"
                                >
                                    <Pencil size={14} /> Edit
                                </button>
                                <button
                                    onClick={() => handleDeleteMember(m.id, m.full_name)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs text-destructive hover:text-destructive/80 justify-center"
                                    title="Deactivate Member"
                                >
                                    <Trash2 size={14} /> Deactivate
                                </button>
                            </div>
                        </div>
                    ))}
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

            {/* VIEW PROFILE MODAL */}
            <Modal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} title="Member Profile">
                {viewMember && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-border pb-6">
                            <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center text-primary text-xl font-bold overflow-hidden relative flex-shrink-0">
                                {viewMember.profile_picture_url ? (
                                    <Image src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${viewMember.profile_picture_url}`} alt={viewMember.full_name} fill className="object-cover" unoptimized />
                                ) : (
                                    viewMember.full_name.charAt(0)
                                )}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-foreground">{viewMember.full_name}</h3>
                                <p className="text-sm text-muted-foreground">{viewMember.email}</p>
                                <span className="inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold tracking-wider bg-zinc-800 text-zinc-300">
                                    {viewMember.role}
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Phone</p>
                                <p className="font-medium text-foreground">{viewMember.phone_number || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Date of Birth</p>
                                <p className="font-medium text-foreground">{viewMember.date_of_birth ? new Date(viewMember.date_of_birth).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Emergency Contact</p>
                                <p className="font-medium text-foreground">{viewMember.emergency_contact || 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Bio / Notes</p>
                                <p className="font-medium text-foreground whitespace-pre-wrap">{viewMember.bio || 'No bio provided.'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
