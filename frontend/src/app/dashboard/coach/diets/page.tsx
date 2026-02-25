'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Utensils, Trash2, Pencil, Save, X, Send, Archive, RefreshCw, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';

interface DietPlan {
    id: string;
    name: string;
    description: string | null;
    content: string;
    content_structured?: Record<string, unknown> | unknown[] | null;
    creator_id: string;
    member_id: string | null;
    is_template: boolean;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    version: number;
    parent_plan_id?: string | null;
    published_at?: string | null;
    archived_at?: string | null;
}

interface Member {
    id: string;
    full_name: string;
    email: string;
}

type PlanStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

const getErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

const statusBadgeClass = (status: DietPlan['status']) => {
    if (status === 'PUBLISHED') return 'badge-green';
    if (status === 'ARCHIVED') return 'badge-gray';
    return 'badge-orange';
};

export default function DietPlansPage() {
    const { showToast, confirm: confirmAction } = useFeedback();
    const [plans, setPlans] = useState<DietPlan[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<DietPlan | null>(null);

    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [planContent, setPlanContent] = useState('');
    const [planStructuredJson, setPlanStructuredJson] = useState('');
    const [planStatus, setPlanStatus] = useState<DietPlan['status']>('DRAFT');
    const [isTemplate, setIsTemplate] = useState(true);
    const [assignedMemberId, setAssignedMemberId] = useState('');

    const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>('ALL');

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningPlan, setAssigningPlan] = useState<DietPlan | null>(null);
    const [bulkAssignMemberIds, setBulkAssignMemberIds] = useState<string[]>([]);
    const [memberSearch, setMemberSearch] = useState('');

    const fetchData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [plansRes, membersRes] = await Promise.all([
                api.get('/fitness/diets', { params: { include_archived: true } }),
                api.get('/hr/members').catch(() => ({ data: { data: [] } })),
            ]);
            setPlans(plansRes.data.data || []);
            setMembers(membersRes.data.data || []);
        } catch {
            showToast('Failed to load diet plans.', 'error');
        }
        setLoading(false);
        setRefreshing(false);
    }, [showToast]);

    useEffect(() => {
        setTimeout(() => fetchData(), 0);
    }, [fetchData]);

    const resetForm = () => {
        setEditingPlan(null);
        setPlanName('');
        setPlanDesc('');
        setPlanContent('');
        setPlanStructuredJson('');
        setPlanStatus('DRAFT');
        setIsTemplate(true);
        setAssignedMemberId('');
    };

    const filteredTemplatePlans = useMemo(() => {
        const templates = plans.filter(plan => !plan.member_id);
        if (statusFilter === 'ALL') return templates;
        return templates.filter(plan => plan.status === statusFilter);
    }, [plans, statusFilter]);

    const assignedPlans = useMemo(() => {
        return plans.filter(plan => !!plan.member_id && plan.status !== 'ARCHIVED');
    }, [plans]);

    const filteredMembers = useMemo(() => {
        const q = memberSearch.trim().toLowerCase();
        if (!q) return members;
        return members.filter(m => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }, [memberSearch, members]);

    const handleOpenCreate = () => {
        resetForm();
        setShowModal(true);
    };

    const handleEditClick = async (plan: DietPlan) => {
        if (plan.status === 'PUBLISHED') {
            const confirmed = await confirmAction({
                title: 'Published Plan',
                description: 'Published diet plans are read-only. Create a draft copy to edit?',
                confirmText: 'Create Draft',
            });
            if (!confirmed) return;
            try {
                await api.post(`/fitness/diets/${plan.id}/fork-draft`);
                showToast('Draft created from published diet plan.', 'success');
                fetchData();
            } catch (error) {
                showToast(getErrorMessage(error, 'Failed to create draft.'), 'error');
            }
            return;
        }
        if (plan.status === 'ARCHIVED') {
            showToast('Archived diet plans cannot be edited.', 'error');
            return;
        }

        setEditingPlan(plan);
        setPlanName(plan.name);
        setPlanDesc(plan.description || '');
        setPlanContent(plan.content || '');
        setPlanStructuredJson(plan.content_structured ? JSON.stringify(plan.content_structured, null, 2) : '');
        setPlanStatus(plan.status || 'DRAFT');
        setIsTemplate(Boolean(plan.is_template));
        setAssignedMemberId(plan.member_id || '');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let structuredPayload: Record<string, unknown> | unknown[] | null = null;
        const trimmedJson = planStructuredJson.trim();
        if (trimmedJson) {
            try {
                const parsed = JSON.parse(trimmedJson) as unknown;
                if (!Array.isArray(parsed) && (typeof parsed !== 'object' || parsed === null)) {
                    showToast('Structured content must be a JSON object or array.', 'error');
                    return;
                }
                structuredPayload = parsed as Record<string, unknown> | unknown[];
            } catch {
                showToast('Structured content is not valid JSON.', 'error');
                return;
            }
        }

        const payload = {
            name: planName,
            description: planDesc,
            content: planContent,
            content_structured: structuredPayload,
            member_id: assignedMemberId || undefined,
            is_template: isTemplate,
            status: planStatus,
        };

        try {
            if (editingPlan) {
                await api.put(`/fitness/diets/${editingPlan.id}`, {
                    ...payload,
                    status: undefined,
                });
            } else {
                await api.post('/fitness/diets', payload);
            }
            setShowModal(false);
            resetForm();
            fetchData();
            showToast(`Diet plan ${editingPlan ? 'updated' : 'created'}.`, 'success');
        } catch (error) {
            showToast(getErrorMessage(error, `Failed to ${editingPlan ? 'update' : 'create'} diet plan.`), 'error');
        }
    };

    const handleDelete = async (dietId: string) => {
        const confirmed = await confirmAction({
            title: 'Delete Diet Plan',
            description: 'Are you sure you want to delete this diet plan?',
            confirmText: 'Delete',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await api.delete(`/fitness/diets/${dietId}`);
            showToast('Diet plan deleted.', 'success');
            fetchData();
        } catch (error) {
            showToast(getErrorMessage(error, 'Failed to delete diet plan.'), 'error');
        }
    };

    const handlePublish = async (dietId: string) => {
        try {
            await api.post(`/fitness/diets/${dietId}/publish`);
            showToast('Diet plan published.', 'success');
            fetchData();
        } catch (error) {
            showToast(getErrorMessage(error, 'Failed to publish diet plan.'), 'error');
        }
    };

    const handleArchive = async (dietId: string) => {
        try {
            await api.post(`/fitness/diets/${dietId}/archive`);
            showToast('Diet plan archived.', 'success');
            fetchData();
        } catch (error) {
            showToast(getErrorMessage(error, 'Failed to archive diet plan.'), 'error');
        }
    };

    const handleForkDraft = async (dietId: string) => {
        try {
            await api.post(`/fitness/diets/${dietId}/fork-draft`);
            showToast('Draft fork created.', 'success');
            fetchData();
        } catch (error) {
            showToast(getErrorMessage(error, 'Failed to fork draft.'), 'error');
        }
    };

    const openAssign = (plan: DietPlan) => {
        if (plan.status === 'ARCHIVED') {
            showToast('Cannot assign archived diet plan.', 'error');
            return;
        }
        setAssigningPlan(plan);
        setBulkAssignMemberIds([]);
        setMemberSearch('');
        setAssignModalOpen(true);
    };

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigningPlan) return;
        if (bulkAssignMemberIds.length === 0) {
            showToast('Select at least one member.', 'error');
            return;
        }
        try {
            await api.post(`/fitness/diets/${assigningPlan.id}/bulk-assign`, {
                member_ids: bulkAssignMemberIds,
                replace_active: true,
            });
            setAssignModalOpen(false);
            showToast('Diet plan assigned successfully.', 'success');
            fetchData();
        } catch (error) {
            showToast(getErrorMessage(error, 'Failed to assign diet plan.'), 'error');
        }
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Diet Plans</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">{refreshing ? 'Refreshing...' : 'Create and manage nutrition programs'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/coach/library" className="btn-ghost min-h-11">
                        Open Library
                    </Link>
                    <button onClick={() => fetchData()} className="btn-ghost min-h-11"><RefreshCw size={16} /> Refresh</button>
                    <button onClick={handleOpenCreate} className="btn-primary">
                        <Plus size={18} /> Create Plan
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as PlanStatusFilter[]).map(status => {
                    const count = status === 'ALL' ? plans.filter(plan => !plan.member_id).length : plans.filter(plan => !plan.member_id && plan.status === status).length;
                    return (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setStatusFilter(status)}
                            className={`px-3 py-2 min-h-11 text-xs rounded-sm border transition-colors ${
                                statusFilter === status
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }`}
                        >
                            {status === 'ALL' ? 'All' : status} ({count})
                        </button>
                    );
                })}
            </div>

            <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Templates</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredTemplatePlans.map(plan => (
                        <div key={plan.id} className="kpi-card group">
                            <div className="flex justify-between items-start gap-2 mb-3">
                                <div className="h-11 w-11 rounded-sm bg-green-500/10 flex items-center justify-center border border-green-500/20">
                                    <Utensils size={20} className="text-green-500" />
                                </div>
                                <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                            </div>
                            <h3 className="font-bold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                                {plan.name} <span className="text-xs text-muted-foreground">v{plan.version}</span>
                            </h3>
                            <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{plan.description || 'No description'}</p>
                            <div className="rounded-sm p-3 text-sm text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap bg-muted/30 border border-border">
                                {plan.content}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-2">Structured: {plan.content_structured ? 'Yes' : 'No'}</p>
                            <div className="flex flex-wrap gap-2 mt-4">
                                <button onClick={() => handleEditClick(plan)} className="btn-ghost text-xs min-h-11"><Pencil size={14} /> Edit</button>
                                <button onClick={() => openAssign(plan)} disabled={plan.status === 'ARCHIVED'} className="btn-ghost text-xs min-h-11 disabled:opacity-40"><UserPlus size={14} /> Assign</button>
                                {plan.status !== 'PUBLISHED' && <button onClick={() => handlePublish(plan.id)} className="btn-ghost text-xs min-h-11"><Send size={14} /> Publish</button>}
                                {plan.status !== 'ARCHIVED' && <button onClick={() => handleArchive(plan.id)} className="btn-ghost text-xs min-h-11"><Archive size={14} /> Archive</button>}
                                {plan.status !== 'DRAFT' && <button onClick={() => handleForkDraft(plan.id)} className="btn-ghost text-xs min-h-11">Fork Draft</button>}
                                <button onClick={() => handleDelete(plan.id)} className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive/80"><Trash2 size={14} /> Delete</button>
                            </div>
                        </div>
                    ))}
                    {filteredTemplatePlans.length === 0 && (
                        <div className="text-center py-16 chart-card border-dashed border-border col-span-full">
                            <Utensils size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">No diet templates found for this status.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assigned Plans</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {assignedPlans.map(plan => (
                        <div key={plan.id} className="border border-border rounded-sm p-4 bg-muted/10">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                                    <p className="text-xs text-muted-foreground">Member ID: {plan.member_id}</p>
                                </div>
                                <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {plan.status !== 'ARCHIVED' && <button onClick={() => handleArchive(plan.id)} className="btn-ghost text-xs min-h-11">Archive</button>}
                                <button onClick={() => handleDelete(plan.id)} className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive/80">Unassign</button>
                            </div>
                        </div>
                    ))}
                    {assignedPlans.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm col-span-full">No active diet plans assigned to members.</div>}
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm border border-border bg-card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold text-foreground">{editingPlan ? 'Edit Diet Plan' : 'Create Diet Plan'}</h2>
                            <button onClick={() => setShowModal(false)}><X size={20} className="text-muted-foreground" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Plan Name" />
                            <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Description" />
                            <textarea rows={6} required className="input-dark resize-none" value={planContent} onChange={e => setPlanContent(e.target.value)} placeholder={'Breakfast: ...\nLunch: ...\nDinner: ...'} />
                            <textarea rows={6} className="input-dark resize-none font-mono text-xs" value={planStructuredJson} onChange={e => setPlanStructuredJson(e.target.value)} placeholder={'Optional JSON structured content\n{\n  "days": []\n}'} />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <select className="input-dark" value={planStatus} onChange={e => setPlanStatus(e.target.value as DietPlan['status'])}>
                                    <option value="DRAFT">Draft</option>
                                    <option value="PUBLISHED">Published</option>
                                    <option value="ARCHIVED">Archived</option>
                                </select>
                                <label className="flex items-center gap-2 px-3 border border-border rounded-sm text-sm text-muted-foreground">
                                    <input type="checkbox" checked={isTemplate} onChange={e => setIsTemplate(e.target.checked)} />
                                    Template
                                </label>
                                {!editingPlan && (
                                    <select className="input-dark" value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}>
                                        <option value="">Unassigned (template)</option>
                                        {members.map(member => (
                                            <option key={member.id} value={member.id}>{member.full_name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                                <button type="submit" className="btn-primary"><Save size={16} /> {editingPlan ? 'Update Plan' : 'Save Plan'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <Modal
                isOpen={assignModalOpen}
                onClose={() => setAssignModalOpen(false)}
                title={`Assign: ${assigningPlan?.name || ''}`}
                maxWidthClassName="max-w-2xl"
            >
                <form onSubmit={handleAssignSubmit} className="space-y-4">
                    {assigningPlan && (
                        <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-foreground">{assigningPlan.name}</p>
                                <span className={`badge ${statusBadgeClass(assigningPlan.status)}`}>{assigningPlan.status}</span>
                            </div>
                            {assigningPlan.status === 'DRAFT' && <p className="text-xs text-yellow-400">Warning: assigning a draft diet plan.</p>}
                            {assigningPlan.status === 'ARCHIVED' && <p className="text-xs text-destructive">Archived plans cannot be assigned.</p>}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-muted-foreground">Members (bulk assign supported)</label>
                        <input
                            type="text"
                            className="input-dark"
                            placeholder="Search member by name/email..."
                            value={memberSearch}
                            onChange={e => setMemberSearch(e.target.value)}
                        />
                        <div className="max-h-56 overflow-y-auto border border-border rounded-sm divide-y divide-border">
                            {filteredMembers.map(member => {
                                const checked = bulkAssignMemberIds.includes(member.id);
                                return (
                                    <label key={member.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <p className="text-foreground truncate">{member.full_name}</p>
                                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => setBulkAssignMemberIds(prev => checked ? prev.filter(id => id !== member.id) : [...prev, member.id])}
                                        />
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-xs text-muted-foreground">Replace-active mode is enabled: existing active diet plans for selected members will be archived.</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setAssignModalOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" disabled={assigningPlan?.status === 'ARCHIVED'} className="btn-primary disabled:opacity-40">
                            <UserPlus size={16} /> Assign Plan
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
