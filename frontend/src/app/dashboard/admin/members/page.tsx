'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { Search, UserPlus, Save, Shield, Snowflake, RefreshCw, Pencil, Trash2, Eye, Dumbbell, Utensils } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

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

interface WorkoutPlan {
    id: string;
    name: string;
    description?: string | null;
    member_id?: string | null;
    is_template?: boolean;
}

interface DietPlan {
    id: string;
    name: string;
    description?: string | null;
    member_id?: string | null;
}

interface BiometricLog {
    id: string;
    date: string;
    weight_kg?: number;
    height_cm?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
}

const FIXED_SUBSCRIPTION_PLANS = [
    { value: 'Monthly', label: 'Monthly (30d)', days: 30 },
    { value: 'Quarterly', label: 'Quarterly (90d)', days: 90 },
    { value: 'Annual', label: 'Annual (365d)', days: 365 },
] as const;

type FixedPlan = (typeof FIXED_SUBSCRIPTION_PLANS)[number]['value'];
type RenewalMode = 'fixed' | 'custom';
type AssignableType = 'WORKOUT' | 'DIET';
type MemberStatusFilter = 'ALL' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'NONE';

export default function MembersPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    const { showToast, confirm: confirmAction } = useFeedback();
    const [members, setMembers] = useState<Member[]>([]);
    const [plans, setPlans] = useState<WorkoutPlan[]>([]);
    const [dietPlans, setDietPlans] = useState<DietPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('ALL');
    const [failedImageUrls, setFailedImageUrls] = useState<Record<string, true>>({});

    // Add Modal
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ full_name: '', email: '', password: 'password123', role: 'CUSTOMER' });

    // Edit Modal
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ id: '', full_name: '', email: '' });

    // Subscription Modal
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [manageMember, setManageMember] = useState<Member | null>(null);
    const [renewalMode, setRenewalMode] = useState<RenewalMode>('fixed');
    const [subPlan, setSubPlan] = useState<FixedPlan>('Monthly');
    const [subDays, setSubDays] = useState(30);

    // View Profile Modal
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [viewMember, setViewMember] = useState<Member | null>(null);
    const [viewBiometrics, setViewBiometrics] = useState<BiometricLog[]>([]);
    // Assign Plan Modal
    const [isAssignPlanOpen, setIsAssignPlanOpen] = useState(false);
    const [assignMember, setAssignMember] = useState<Member | null>(null);
    const [assignPlanId, setAssignPlanId] = useState('');
    const [assignType, setAssignType] = useState<AssignableType>('WORKOUT');

    const openView = (member: Member) => {
        setViewMember(member);
        api.get(`/fitness/biometrics/member/${member.id}`)
            .then(res => setViewBiometrics(res.data?.data ?? []))
            .catch(() => setViewBiometrics([]));
        setIsViewOpen(true);
    };

    const markImageFailed = (url?: string) => {
        if (!url) return;
        setFailedImageUrls(prev => ({ ...prev, [url]: true }));
    };

    const canRenderImage = (url?: string) => !!url && !failedImageUrls[url];
    const getAgeFromDob = (dob?: string) => {
        if (!dob) return null;
        const birthDate = new Date(dob);
        if (Number.isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        return age >= 0 ? age : null;
    };

    const fetchMembers = async () => {
        try {
            const res = await api.get('/hr/members');
            setMembers(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const fetchPlans = async () => {
        try {
            const res = await api.get('/fitness/plans');
            const allPlans = res.data?.data ?? [];
            setPlans(allPlans.filter((plan: WorkoutPlan) => !plan.member_id));
        } catch (err) {
            console.error(err);
            showToast('Failed to load workout plans.', 'error');
        }
    };

    const fetchDietPlans = async () => {
        try {
            const res = await api.get('/fitness/diets');
            const allPlans = res.data?.data ?? [];
            setDietPlans(allPlans.filter((plan: DietPlan) => !plan.member_id));
        } catch (err) {
            console.error(err);
            showToast('Failed to load diet plans.', 'error');
        }
    };

    useEffect(() => {
        setTimeout(() => fetchMembers(), 0);
        const intervalId = window.setInterval(() => { fetchMembers(); }, 15000);
        return () => window.clearInterval(intervalId);
    }, []);

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
        setRenewalMode('fixed');
        setSubPlan('Monthly');
        setSubDays(30);
        setIsManageOpen(true);
    };

    const handleCreateSub = async () => {
        if (!manageMember) return;
        const normalizedDays = Math.floor(Number(subDays));
        if (!Number.isFinite(normalizedDays) || normalizedDays <= 0) {
            showToast('Duration must be a positive number of days.', 'error');
            return;
        }
        try {
            await api.post('/hr/subscriptions', {
                user_id: manageMember.id,
                plan_name: renewalMode === 'fixed' ? subPlan : 'Custom',
                duration_days: normalizedDays
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

    const openAssignPlan = async (member: Member) => {
        setAssignMember(member);
        if (plans.length === 0) await fetchPlans();
        if (dietPlans.length === 0) await fetchDietPlans();
        setAssignType('WORKOUT');
        setAssignPlanId('');
        setIsAssignPlanOpen(true);
    };

    const handleAssignPlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignMember || !assignPlanId) {
            showToast('Select a plan first.', 'error');
            return;
        }
        try {
            if (assignType === 'WORKOUT') {
                const selectedPlan = plans.find(plan => plan.id === assignPlanId);
                await api.post(`/fitness/plans/${assignPlanId}/clone`, {
                    name: selectedPlan?.name ? `${selectedPlan.name} - ${assignMember.full_name}` : undefined,
                    member_id: assignMember.id,
                });
            } else {
                const selectedPlan = dietPlans.find(plan => plan.id === assignPlanId);
                await api.post(`/fitness/diets/${assignPlanId}/clone`, {
                    name: selectedPlan?.name ? `${selectedPlan.name} - ${assignMember.full_name}` : undefined,
                    member_id: assignMember.id,
                });
            }
            setIsAssignPlanOpen(false);
            showToast(`${assignType === 'WORKOUT' ? 'Workout' : 'Diet'} plan assigned to ${assignMember.full_name}.`, 'success');
        } catch (err) {
            console.error(err);
            showToast(`Failed to assign ${assignType === 'WORKOUT' ? 'workout' : 'diet'} plan.`, 'error');
        }
    };
    const manageMemberStatus = manageMember?.subscription?.status;

    const filtered = useMemo(() => {
        return members.filter(m => {
            const matchesSearch = !debouncedSearch ||
                m.full_name.toLowerCase().includes(debouncedSearch) ||
                m.email.toLowerCase().includes(debouncedSearch);
            const memberStatus = m.subscription?.status || 'NONE';
            const matchesStatus = statusFilter === 'ALL' || memberStatus === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [members, debouncedSearch, statusFilter]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{isAdmin ? 'Members' : 'Clients'}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{members.length} registered {isAdmin ? 'members' : 'clients'}</p>
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
                    {isAdmin && (
                        <button onClick={() => setIsAddOpen(true)} className="btn-primary">
                            <UserPlus size={18} /> Add Member
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {[
                    { value: 'ALL', label: 'All' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'FROZEN', label: 'Frozen' },
                    { value: 'EXPIRED', label: 'Expired' },
                    { value: 'NONE', label: 'No Subscription' },
                ].map(filter => (
                    <button
                        key={filter.value}
                        type="button"
                        onClick={() => setStatusFilter(filter.value as MemberStatusFilter)}
                        className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${statusFilter === filter.value
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }`}
                    >
                        {filter.label}
                    </button>
                ))}
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
                                        {(() => {
                                            const imageUrl = resolveProfileImageUrl(m.profile_picture_url);
                                            return (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                                {canRenderImage(imageUrl) ? (
                                                    <Image src={imageUrl as string} alt={m.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                                ) : (
                                                    m.full_name.charAt(0)
                                                )}
                                            </div>
                                            <span className="!text-foreground font-medium">{m.full_name}</span>
                                        </div>
                                            );
                                        })()}
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
                                                onClick={() => openAssignPlan(m)}
                                                className="btn-ghost py-1 px-2 h-auto text-xs text-orange-400 hover:text-orange-300"
                                                title="Assign Plan"
                                            >
                                                <Dumbbell size={14} /> Assign
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => openManage(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs"
                                                    title="Manage Subscription"
                                                >
                                                    <Shield size={14} /> Sub
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    onClick={() => openEdit(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-blue-400 hover:text-blue-300"
                                                    title="Edit Details"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleDeleteMember(m.id, m.full_name)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-destructive hover:text-destructive/80"
                                                    title="Deactivate Member"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
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
                                    {(() => {
                                        const imageUrl = resolveProfileImageUrl(m.profile_picture_url);
                                        return (
                                    <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative flex-shrink-0">
                                        {canRenderImage(imageUrl) ? (
                                            <Image src={imageUrl as string} alt={m.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                        ) : (
                                            m.full_name.charAt(0)
                                        )}
                                    </div>
                                        );
                                    })()}
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
                                    onClick={() => openAssignPlan(m)}
                                    className="btn-ghost !px-2 !py-2 h-auto text-xs text-orange-400 hover:text-orange-300 justify-center"
                                    title="Assign Plan"
                                >
                                    <Dumbbell size={14} /> Assign
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={() => openManage(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs justify-center"
                                        title="Manage Subscription"
                                    >
                                        <Shield size={14} /> Sub
                                    </button>
                                )}
                                {isAdmin && (
                                    <button
                                        onClick={() => openEdit(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-blue-400 hover:text-blue-300 justify-center"
                                        title="Edit Details"
                                    >
                                        <Pencil size={14} /> Edit
                                    </button>
                                )}
                                {isAdmin && (
                                    <button
                                        onClick={() => handleDeleteMember(m.id, m.full_name)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-destructive hover:text-destructive/80 justify-center"
                                        title="Deactivate Member"
                                    >
                                        <Trash2 size={14} /> Deactivate
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ===== ADD MEMBER MODAL ===== */}
            <Modal isOpen={isAddOpen && isAdmin} onClose={() => setIsAddOpen(false)} title="Register New Member">
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
            <Modal isOpen={isEditOpen && isAdmin} onClose={() => setIsEditOpen(false)} title="Edit Member Details">
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
            <Modal isOpen={isManageOpen && isAdmin} onClose={() => setIsManageOpen(false)} title={`Manage - ${manageMember?.full_name}`}>
                <div className="space-y-5">
                    {/* Current status */}
                    <div className="flex items-center justify-between rounded-sm p-4 bg-card border border-border">
                        <div>
                            <p className="text-xs text-muted-foreground">Current Status</p>
                            <span className={`badge mt-1 ${statusBadge(manageMemberStatus)}`}>
                                {manageMemberStatus || 'NO SUBSCRIPTION'}
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
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">Renewal Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRenewalMode('fixed');
                                        const selectedPlan = FIXED_SUBSCRIPTION_PLANS.find(plan => plan.value === subPlan) ?? FIXED_SUBSCRIPTION_PLANS[0];
                                        setSubDays(selectedPlan.days);
                                    }}
                                    className={`py-2 px-3 text-sm rounded-sm border transition-colors ${renewalMode === 'fixed'
                                        ? 'border-primary text-primary bg-primary/10'
                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                        }`}
                                >
                                    Fixed Plan
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRenewalMode('custom')}
                                    className={`py-2 px-3 text-sm rounded-sm border transition-colors ${renewalMode === 'custom'
                                        ? 'border-primary text-primary bg-primary/10'
                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                        }`}
                                >
                                    Custom Days
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {renewalMode === 'fixed' ? (
                                <>
                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1">Plan</label>
                                        <select
                                            className="input-dark"
                                            value={subPlan}
                                            onChange={e => {
                                                const nextPlan = e.target.value as FixedPlan;
                                                const selectedPlan = FIXED_SUBSCRIPTION_PLANS.find(plan => plan.value === nextPlan) ?? FIXED_SUBSCRIPTION_PLANS[0];
                                                setSubPlan(nextPlan);
                                                setSubDays(selectedPlan.days);
                                            }}
                                        >
                                            {FIXED_SUBSCRIPTION_PLANS.map(plan => (
                                                <option key={plan.value} value={plan.value}>{plan.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1">Duration (days)</label>
                                        <input type="number" className="input-dark" value={subDays} disabled readOnly />
                                    </div>
                                </>
                            ) : (
                                <div className="sm:col-span-2">
                                    <label className="block text-xs text-muted-foreground mb-1">Custom Duration (days)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className="input-dark"
                                        value={subDays}
                                        onChange={e => setSubDays(Number(e.target.value))}
                                    />
                                </div>
                            )}
                        </div>
                        <button onClick={handleCreateSub} className="btn-primary w-full justify-center">
                            <RefreshCw size={15} /> {manageMember?.subscription ? 'Renew Subscription' : 'Activate Subscription'}
                        </button>
                    </div>

                    {/* Quick actions */}
                    {manageMember?.subscription && (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleSubAction('ACTIVE')}
                                disabled={manageMemberStatus !== 'FROZEN'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-emerald-500/30 text-emerald-400 rounded-sm text-sm font-medium hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <RefreshCw size={15} /> Unfreeze
                            </button>
                            <button
                                onClick={() => handleSubAction('FROZEN')}
                                disabled={manageMemberStatus !== 'ACTIVE'}
                                className="flex items-center justify-center gap-2 py-2.5 border border-blue-500/30 text-blue-400 rounded-sm text-sm font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Snowflake size={15} /> Freeze
                            </button>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ASSIGN PLAN MODAL */}
            <Modal isOpen={isAssignPlanOpen} onClose={() => setIsAssignPlanOpen(false)} title={`Assign Plan - ${assignMember?.full_name || ''}`}>
                <form onSubmit={handleAssignPlan} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Plan Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                className={`py-2 px-3 text-sm rounded-sm border transition-colors ${assignType === 'WORKOUT'
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                onClick={() => { setAssignType('WORKOUT'); setAssignPlanId(''); }}
                            >
                                Workout
                            </button>
                            <button
                                type="button"
                                className={`py-2 px-3 text-sm rounded-sm border transition-colors ${assignType === 'DIET'
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                                onClick={() => { setAssignType('DIET'); setAssignPlanId(''); }}
                            >
                                Diet
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                            {assignType === 'WORKOUT' ? 'Workout Plan' : 'Diet Plan'}
                        </label>
                        <select
                            required
                            className="input-dark"
                            value={assignPlanId}
                            onChange={e => setAssignPlanId(e.target.value)}
                        >
                            <option value="">Select Plan...</option>
                            {(assignType === 'WORKOUT' ? plans : dietPlans).map(plan => (
                                <option key={plan.id} value={plan.id}>
                                    {plan.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {(assignType === 'WORKOUT' ? plans.length === 0 : dietPlans.length === 0) && (
                        <p className="text-xs text-muted-foreground">
                            {assignType === 'WORKOUT'
                                ? 'No unassigned workout plans found. Create a template/unassigned plan in Workout Plans first.'
                                : 'No unassigned diet plans found. Create one in Diet Plans first.'}
                        </p>
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsAssignPlanOpen(false)} className="btn-ghost">Cancel</button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={assignType === 'WORKOUT' ? plans.length === 0 : dietPlans.length === 0}
                        >
                            {assignType === 'WORKOUT' ? <Dumbbell size={16} /> : <Utensils size={16} />}
                            Assign Plan
                        </button>
                    </div>
                </form>
            </Modal>

            {/* VIEW PROFILE MODAL */}
            <Modal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} title="Member Profile">
                {viewMember && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-border pb-6">
                            {(() => {
                                const imageUrl = resolveProfileImageUrl(viewMember.profile_picture_url);
                                return (
                            <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center text-primary text-xl font-bold overflow-hidden relative flex-shrink-0">
                                {canRenderImage(imageUrl) ? (
                                    <Image src={imageUrl as string} alt={viewMember.full_name} fill className="object-cover" unoptimized onError={() => markImageFailed(imageUrl)} />
                                ) : (
                                    viewMember.full_name.charAt(0)
                                )}
                            </div>
                                );
                            })()}
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
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Age</p>
                                <p className="font-medium text-foreground">{getAgeFromDob(viewMember.date_of_birth) ?? 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Emergency Contact</p>
                                <p className="font-medium text-foreground">{viewMember.emergency_contact || 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Bio / Notes</p>
                                <p className="font-medium text-foreground whitespace-pre-wrap">{viewMember.bio || 'No bio provided.'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Latest Height</p>
                                <p className="font-medium text-foreground">
                                    {viewBiometrics.length > 0 && viewBiometrics[viewBiometrics.length - 1].height_cm
                                        ? `${viewBiometrics[viewBiometrics.length - 1].height_cm} cm`
                                        : 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Latest Weight</p>
                                <p className="font-medium text-foreground">
                                    {viewBiometrics.length > 0 && viewBiometrics[viewBiometrics.length - 1].weight_kg
                                        ? `${viewBiometrics[viewBiometrics.length - 1].weight_kg} kg`
                                        : 'N/A'}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Progress Visualization</p>
                                <div className="h-52 border border-border bg-muted/10 p-2 rounded-sm">
                                    {viewBiometrics.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={viewBiometrics}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={(val) => new Date(val).toLocaleDateString()}
                                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                                                <Tooltip labelFormatter={(label) => new Date(label as string).toLocaleDateString()} />
                                                <Line type="monotone" dataKey="weight_kg" stroke="var(--primary)" strokeWidth={2} name="Weight (kg)" dot={{ r: 2 }} />
                                                <Line type="monotone" dataKey="body_fat_pct" stroke="#f97316" strokeWidth={2} name="Body Fat (%)" dot={{ r: 2 }} />
                                                <Line type="monotone" dataKey="muscle_mass_kg" stroke="#22c55e" strokeWidth={2} name="Muscle (kg)" dot={{ r: 2 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No biometric progress data logged yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
