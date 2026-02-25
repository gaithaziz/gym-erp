'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Save, Shield, Snowflake, RefreshCw, Pencil, Trash2, Eye, Dumbbell, Utensils, MessageCircle } from 'lucide-react';
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
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    total_sections?: number;
    total_exercises?: number;
    total_videos?: number;
    preview_sections?: { section_name: string; exercise_names: string[] }[];
}

interface DietPlan {
    id: string;
    name: string;
    description?: string | null;
    member_id?: string | null;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    version?: number;
    content_length?: number;
    has_structured_content?: boolean;
    description_excerpt?: string | null;
}

interface BiometricLog {
    id: string;
    date: string;
    weight_kg?: number;
    height_cm?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
}

interface WorkoutSessionEntry {
    id: string;
    exercise_name?: string | null;
    sets_completed: number;
    reps_completed: number;
    weight_kg?: number | null;
}

interface WorkoutSession {
    id: string;
    plan_id: string;
    performed_at: string;
    duration_minutes?: number | null;
    notes?: string | null;
    entries: WorkoutSessionEntry[];
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
type WorkoutPlanStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
type DietPlanStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export default function MembersPage() {
    const router = useRouter();
    const { user } = useAuth();
    const canManageMembers = ['ADMIN', 'RECEPTION', 'FRONT_DESK'].includes(user?.role || '');
    const canAssignPlans = ['ADMIN', 'COACH'].includes(user?.role || '');
    const canMessageClient = ['ADMIN', 'COACH'].includes(user?.role || '');
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
    const [subAmountPaid, setSubAmountPaid] = useState('');
    const [subPaymentMethod, setSubPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');

    // View Profile Modal
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [viewMember, setViewMember] = useState<Member | null>(null);
    const [viewBiometrics, setViewBiometrics] = useState<BiometricLog[]>([]);
    const [viewSessions, setViewSessions] = useState<WorkoutSession[]>([]);
    // Assign Plan Modal
    const [isAssignPlanOpen, setIsAssignPlanOpen] = useState(false);
    const [assignMember, setAssignMember] = useState<Member | null>(null);
    const [assignPlanId, setAssignPlanId] = useState('');
    const [assignType, setAssignType] = useState<AssignableType>('WORKOUT');
    const [assignWorkoutStatusFilter, setAssignWorkoutStatusFilter] = useState<WorkoutPlanStatusFilter>('PUBLISHED');
    const [assignDietStatusFilter, setAssignDietStatusFilter] = useState<DietPlanStatusFilter>('PUBLISHED');

    const openView = (member: Member) => {
        setViewMember(member);
        Promise.all([
            api.get(`/fitness/biometrics/member/${member.id}`).catch(() => ({ data: { data: [] } })),
            api.get(`/fitness/session-logs/member/${member.id}`).catch(() => ({ data: { data: [] } })),
        ])
            .then(([bioRes, sessionsRes]) => {
                setViewBiometrics(bioRes.data?.data ?? []);
                setViewSessions(sessionsRes.data?.data ?? []);
            })
            .catch(() => {
                setViewBiometrics([]);
                setViewSessions([]);
            });
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
            const res = await api.get('/fitness/plan-summaries').catch(() => api.get('/fitness/plans'));
            const allPlans = res.data?.data ?? [];
            setPlans(allPlans.filter((plan: WorkoutPlan) => !plan.member_id));
        } catch (err) {
            console.error(err);
            showToast('Failed to load workout plans.', 'error');
        }
    };

    const fetchDietPlans = async () => {
        try {
            const res = await api.get('/fitness/diet-summaries', {
                params: {
                    include_archived: true,
                    include_all_creators: true,
                    templates_only: true,
                },
            }).catch(
                () => api.get('/fitness/diets', {
                    params: {
                        include_archived: true,
                        include_all_creators: true,
                        templates_only: true,
                    },
                }),
            );
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
        setSubAmountPaid('');
        setSubPaymentMethod('CASH');
        setIsManageOpen(true);
    };

    const handleCreateSub = async () => {
        if (!manageMember) return;
        const normalizedDays = Math.floor(Number(subDays));
        if (!Number.isFinite(normalizedDays) || normalizedDays <= 0) {
            showToast('Duration must be a positive number of days.', 'error');
            return;
        }
        const amountPaid = Number(subAmountPaid);
        if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
            showToast('Paid amount must be greater than zero.', 'error');
            return;
        }
        try {
            await api.post('/hr/subscriptions', {
                user_id: manageMember.id,
                plan_name: renewalMode === 'fixed' ? subPlan : 'Custom',
                duration_days: normalizedDays,
                amount_paid: amountPaid,
                payment_method: subPaymentMethod,
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
        if (!canAssignPlans) return;
        setAssignMember(member);
        if (plans.length === 0) await fetchPlans();
        if (dietPlans.length === 0) await fetchDietPlans();
        setAssignType('WORKOUT');
        setAssignWorkoutStatusFilter('PUBLISHED');
        setAssignDietStatusFilter('PUBLISHED');
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
                if (selectedPlan?.status === 'ARCHIVED') {
                    showToast('Cannot assign archived plan.', 'error');
                    return;
                }
                await api.post(`/fitness/plans/${assignPlanId}/bulk-assign`, {
                    member_ids: [assignMember.id],
                    replace_active: true,
                });
            } else {
                const selectedPlan = dietPlans.find(plan => plan.id === assignPlanId);
                if (selectedPlan?.status === 'ARCHIVED') {
                    showToast('Cannot assign archived plan.', 'error');
                    return;
                }
                await api.post(`/fitness/diets/${assignPlanId}/bulk-assign`, {
                    member_ids: [assignMember.id],
                    replace_active: true,
                });
            }
            setIsAssignPlanOpen(false);
            showToast(`${assignType === 'WORKOUT' ? 'Workout' : 'Diet'} plan assigned to ${assignMember.full_name}.`, 'success');
        } catch (err) {
            console.error(err);
            showToast(`Failed to assign ${assignType === 'WORKOUT' ? 'workout' : 'diet'} plan.`, 'error');
        }
    };

    const handleMessageClient = async (memberId: string) => {
        try {
            const response = await api.post('/chat/threads', { customer_id: memberId });
            const threadId = response.data?.data?.id as string | undefined;
            if (!threadId) {
                throw new Error('Missing thread id');
            }
            setIsViewOpen(false);
            router.push(`/dashboard/chat?thread=${threadId}`);
        } catch (err) {
            showToast(
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not open chat with this client.',
                'error'
            );
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

    const filteredAssignableWorkoutPlans = useMemo(() => {
        if (assignWorkoutStatusFilter === 'ALL') return plans;
        return plans.filter(plan => plan.status === assignWorkoutStatusFilter);
    }, [plans, assignWorkoutStatusFilter]);

    const filteredAssignableDietPlans = useMemo(() => {
        if (assignDietStatusFilter === 'ALL') return dietPlans;
        return dietPlans.filter(plan => plan.status === assignDietStatusFilter);
    }, [dietPlans, assignDietStatusFilter]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{canManageMembers ? 'Members' : 'Clients'}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{members.length} registered {canManageMembers ? 'members' : 'clients'}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="field-with-icon">
                        <Search size={16} className="field-icon" />
                        <input
                            type="text"
                            placeholder="Search members..."
                            className="input-dark input-with-icon w-full sm:w-64"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {canManageMembers && (
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
                                            {canMessageClient && (
                                                <button
                                                    onClick={() => handleMessageClient(m.id)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-primary hover:text-primary/80"
                                                    title="Message Client"
                                                >
                                                    <MessageCircle size={14} /> Message
                                                </button>
                                            )}
                                            {canAssignPlans && (
                                                <button
                                                    onClick={() => openAssignPlan(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-orange-400 hover:text-orange-300"
                                                    title="Assign Plan"
                                                >
                                                    <Dumbbell size={14} /> Assign
                                                </button>
                                            )}
                                            {canManageMembers && (
                                                <button
                                                    onClick={() => openManage(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs"
                                                    title="Manage Subscription"
                                                >
                                                    <Shield size={14} /> Sub
                                                </button>
                                            )}
                                            {canManageMembers && (
                                                <button
                                                    onClick={() => openEdit(m)}
                                                    className="btn-ghost py-1 px-2 h-auto text-xs text-blue-400 hover:text-blue-300"
                                                    title="Edit Details"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            {canManageMembers && (
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
                                {canAssignPlans && (
                                    <button
                                        onClick={() => openAssignPlan(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-orange-400 hover:text-orange-300 justify-center"
                                        title="Assign Plan"
                                    >
                                        <Dumbbell size={14} /> Assign
                                    </button>
                                )}
                                {canMessageClient && (
                                    <button
                                        onClick={() => handleMessageClient(m.id)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-primary hover:text-primary/80 justify-center"
                                        title="Message Client"
                                    >
                                        <MessageCircle size={14} /> Message
                                    </button>
                                )}
                                {canManageMembers && (
                                    <button
                                        onClick={() => openManage(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs justify-center"
                                        title="Manage Subscription"
                                    >
                                        <Shield size={14} /> Sub
                                    </button>
                                )}
                                {canManageMembers && (
                                    <button
                                        onClick={() => openEdit(m)}
                                        className="btn-ghost !px-2 !py-2 h-auto text-xs text-blue-400 hover:text-blue-300 justify-center"
                                        title="Edit Details"
                                    >
                                        <Pencil size={14} /> Edit
                                    </button>
                                )}
                                {canManageMembers && (
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
            <Modal isOpen={isAddOpen && canManageMembers} onClose={() => setIsAddOpen(false)} title="Register New Member">
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
            <Modal isOpen={isEditOpen && canManageMembers} onClose={() => setIsEditOpen(false)} title="Edit Member Details">
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
            <Modal isOpen={isManageOpen && canManageMembers} onClose={() => setIsManageOpen(false)} title={`Manage - ${manageMember?.full_name}`}>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Amount Paid (JOD)</label>
                                <input
                                    type="number"
                                    min={0.01}
                                    step={0.01}
                                    className="input-dark"
                                    value={subAmountPaid}
                                    onChange={e => setSubAmountPaid(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Payment Method</label>
                                <select className="input-dark" value={subPaymentMethod} onChange={(e) => setSubPaymentMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}>
                                    <option value="CASH">Cash</option>
                                    <option value="CARD">Card</option>
                                    <option value="TRANSFER">Bank Transfer</option>
                                </select>
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
            <Modal isOpen={isAssignPlanOpen && canAssignPlans} onClose={() => setIsAssignPlanOpen(false)} title={`Assign Plan - ${assignMember?.full_name || ''}`}>
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
                        {assignType === 'WORKOUT' && (
                            <div className="mb-3">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Workout Status Filter</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as WorkoutPlanStatusFilter[]).map(status => {
                                        const count = status === 'ALL' ? plans.length : plans.filter(plan => plan.status === status).length;
                                        return (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => {
                                                    setAssignWorkoutStatusFilter(status);
                                                    setAssignPlanId('');
                                                }}
                                                className={`px-3 py-2 min-h-11 text-xs rounded-sm border transition-colors ${
                                                    assignWorkoutStatusFilter === status
                                                        ? 'border-primary text-primary bg-primary/10'
                                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                {status === 'ALL' ? 'All' : status} ({count})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {assignType === 'DIET' && (
                            <div className="mb-3">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Diet Status Filter</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as DietPlanStatusFilter[]).map(status => {
                                        const count = status === 'ALL' ? dietPlans.length : dietPlans.filter(plan => plan.status === status).length;
                                        return (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => {
                                                    setAssignDietStatusFilter(status);
                                                    setAssignPlanId('');
                                                }}
                                                className={`px-3 py-2 min-h-11 text-xs rounded-sm border transition-colors ${
                                                    assignDietStatusFilter === status
                                                        ? 'border-primary text-primary bg-primary/10'
                                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                            >
                                                {status === 'ALL' ? 'All' : status} ({count})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
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
                            {assignType === 'WORKOUT'
                                ? filteredAssignableWorkoutPlans.map(plan => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} [{plan.status || 'DRAFT'}]
                                    </option>
                                ))
                                : filteredAssignableDietPlans.map(plan => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} [{plan.status || 'DRAFT'}]
                                    </option>
                                ))}
                        </select>
                    </div>
                    {assignType === 'WORKOUT' && assignPlanId && (() => {
                        const plan = plans.find(p => p.id === assignPlanId);
                        if (!plan) return null;
                        return (
                            <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                                    {plan.status && <span className={`badge ${plan.status === 'PUBLISHED' ? 'badge-green' : plan.status === 'ARCHIVED' ? 'badge-gray' : 'badge-orange'}`}>{plan.status}</span>}
                                </div>
                                {(plan.total_sections || plan.total_exercises || plan.total_videos) && (
                                    <p className="text-xs text-muted-foreground">
                                        {(plan.total_sections || 0)} sections | {(plan.total_exercises || 0)} exercises | {(plan.total_videos || 0)} videos
                                    </p>
                                )}
                                {plan.preview_sections && plan.preview_sections.length > 0 && (
                                    <div className="space-y-1">
                                        {plan.preview_sections.map(sec => (
                                            <p key={sec.section_name} className="text-xs text-muted-foreground">
                                                <span className="text-primary font-medium">{sec.section_name}:</span> {sec.exercise_names.join(', ')}
                                            </p>
                                        ))}
                                    </div>
                                )}
                                {plan.status === 'DRAFT' && <p className="text-xs text-yellow-400">Warning: assigning a draft plan.</p>}
                                {plan.status === 'ARCHIVED' && <p className="text-xs text-destructive">Archived plan cannot be assigned.</p>}
                            </div>
                        );
                    })()}
                    {assignType === 'DIET' && assignPlanId && (() => {
                        const plan = dietPlans.find(p => p.id === assignPlanId);
                        if (!plan) return null;
                        return (
                            <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                                    {plan.status && <span className={`badge ${plan.status === 'PUBLISHED' ? 'badge-green' : plan.status === 'ARCHIVED' ? 'badge-gray' : 'badge-orange'}`}>{plan.status}</span>}
                                </div>
                                {plan.description_excerpt && <p className="text-xs text-muted-foreground">{plan.description_excerpt}</p>}
                                {plan.content_length !== undefined && (
                                    <p className="text-xs text-muted-foreground">
                                        Content length: {plan.content_length} chars{plan.has_structured_content ? ' | Structured JSON' : ''}
                                    </p>
                                )}
                                {plan.status === 'DRAFT' && <p className="text-xs text-yellow-400">Warning: assigning a draft plan.</p>}
                                {plan.status === 'ARCHIVED' && <p className="text-xs text-destructive">Archived plan cannot be assigned.</p>}
                            </div>
                        );
                    })()}
                    {(assignType === 'WORKOUT' ? filteredAssignableWorkoutPlans.length === 0 : filteredAssignableDietPlans.length === 0) && (
                        <p className="text-xs text-muted-foreground">
                            {assignType === 'WORKOUT'
                                ? 'No workout templates match this status filter.'
                                : 'No diet templates match this status filter.'}
                        </p>
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsAssignPlanOpen(false)} className="btn-ghost">Cancel</button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={
                                assignType === 'WORKOUT'
                                    ? filteredAssignableWorkoutPlans.length === 0 || plans.find(p => p.id === assignPlanId)?.status === 'ARCHIVED'
                                    : filteredAssignableDietPlans.length === 0 || dietPlans.find(p => p.id === assignPlanId)?.status === 'ARCHIVED'
                            }
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
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Workout Session Logs</p>
                                <div className="border border-border bg-muted/10 rounded-sm p-3 space-y-3 max-h-72 overflow-y-auto">
                                    {viewSessions.length > 0 ? (
                                        viewSessions.slice(0, 10).map((session) => {
                                            const sessionVolume = (session.entries || []).reduce((sum, entry) => {
                                                const weight = entry.weight_kg || 0;
                                                return sum + (entry.sets_completed * entry.reps_completed * weight);
                                            }, 0);
                                            return (
                                                <div key={session.id} className="rounded-sm border border-border bg-card/60 p-3">
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <p className="text-sm font-semibold text-foreground">
                                                            {new Date(session.performed_at).toLocaleDateString()}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground font-mono">
                                                            {session.entries.length} exercises | {Math.round(sessionVolume)} kg vol
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        {session.entries.slice(0, 3).map((entry) => (
                                                            <div key={entry.id} className="flex justify-between text-xs">
                                                                <span className="text-muted-foreground">{entry.exercise_name || 'Exercise'}</span>
                                                                <span className="text-muted-foreground font-mono">{entry.sets_completed}x{entry.reps_completed} @ {entry.weight_kg ?? 0}kg</span>
                                                            </div>
                                                        ))}
                                                        {session.entries.length > 3 && (
                                                            <p className="text-[10px] text-primary font-mono">+{session.entries.length - 3} more exercises</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                                            No workout session logs yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {canMessageClient && (
                            <div className="border-t border-border pt-4">
                                <button
                                    type="button"
                                    className="btn-primary w-full justify-center"
                                    onClick={() => handleMessageClient(viewMember.id)}
                                >
                                    <MessageCircle size={16} /> Message Client
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}


