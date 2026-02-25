'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Utensils, Trash2, Pencil, Save, X, Send, Archive, RefreshCw, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
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

interface DietLibraryItem {
    id: string;
    name: string;
    description?: string | null;
    content: string;
    is_global: boolean;
    owner_coach_id?: string | null;
}

interface MealItemDraft {
    id: string;
    name: string;
}

interface MealGroupDraft {
    id: string;
    name: string;
    meals: MealItemDraft[];
}

type PlanStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

const makeId = () => Math.random().toString(36).slice(2, 10);

const newMealItem = (name = ''): MealItemDraft => ({ id: makeId(), name });

const newMealGroup = (name = 'Meal Group', meals?: MealItemDraft[]): MealGroupDraft => ({
    id: makeId(),
    name,
    meals: meals && meals.length > 0 ? meals : [newMealItem('Meal 1')],
});

const getErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

const statusBadgeClass = (status: DietPlan['status']) => {
    if (status === 'PUBLISHED') return 'badge-green';
    if (status === 'ARCHIVED') return 'badge-gray';
    return 'badge-orange';
};

const normalizeMealGroups = (groups: MealGroupDraft[]): MealGroupDraft[] => {
    const cleaned = groups
        .map(group => ({
            ...group,
            name: group.name.trim(),
            meals: group.meals
                .map(meal => ({ ...meal, name: meal.name.trim() }))
                .filter(meal => meal.name.length > 0),
        }))
        .filter(group => group.name.length > 0);

    if (cleaned.length === 0) {
        return [newMealGroup('Meal Group 1', [newMealItem('Meal 1')])];
    }

    return cleaned.map((group, idx) => ({
        ...group,
        name: group.name || `Meal Group ${idx + 1}`,
        meals: group.meals.length > 0 ? group.meals : [newMealItem('Meal 1')],
    }));
};

const buildContentFromMealGroups = (groups: MealGroupDraft[]): string => {
    return groups
        .map(group => {
            const meals = group.meals.map(meal => `- ${meal.name}`).join('\n');
            return `${group.name}:\n${meals}`;
        })
        .join('\n\n');
};

const buildStructuredFromMealGroups = (groups: MealGroupDraft[]) => {
    return {
        meal_groups: groups.map(group => ({
            name: group.name,
            meals: group.meals.map(meal => ({ name: meal.name })),
        })),
    };
};

const parseStructuredMealGroups = (structured: DietPlan['content_structured']): MealGroupDraft[] | null => {
    if (!structured || Array.isArray(structured) || typeof structured !== 'object') return null;
    const rawGroups = (structured as { meal_groups?: unknown }).meal_groups;
    if (!Array.isArray(rawGroups)) return null;

    const parsed: MealGroupDraft[] = [];
    rawGroups.forEach((rawGroup, groupIdx) => {
        if (!rawGroup || typeof rawGroup !== 'object') return;
        const groupName = String((rawGroup as { name?: unknown }).name || `Meal Group ${groupIdx + 1}`).trim();
        const rawMeals = (rawGroup as { meals?: unknown }).meals;
        const meals: MealItemDraft[] = [];
        if (Array.isArray(rawMeals)) {
            rawMeals.forEach((rawMeal, mealIdx) => {
                if (typeof rawMeal === 'string') {
                    const mealName = rawMeal.trim();
                    if (mealName) meals.push(newMealItem(mealName));
                    return;
                }
                if (rawMeal && typeof rawMeal === 'object') {
                    const mealName = String((rawMeal as { name?: unknown }).name || `Meal ${mealIdx + 1}`).trim();
                    if (mealName) meals.push(newMealItem(mealName));
                }
            });
        }
        parsed.push(newMealGroup(groupName || `Meal Group ${groupIdx + 1}`, meals));
    });

    return parsed.length > 0 ? parsed : null;
};

const parseContentMealGroups = (content: string): MealGroupDraft[] => {
    const lines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return [newMealGroup('Meal Group 1', [newMealItem('Meal 1')])];

    const groups: MealGroupDraft[] = [];
    let currentGroup = newMealGroup('Meal Group 1', []);

    lines.forEach((line) => {
        const groupMatch = line.match(/^(.*):$/);
        if (groupMatch && !line.startsWith('-')) {
            if (currentGroup.meals.length > 0) {
                groups.push(currentGroup);
            }
            const name = groupMatch[1].trim() || `Meal Group ${groups.length + 1}`;
            currentGroup = newMealGroup(name, []);
            return;
        }

        const mealName = line.replace(/^[-*]\s*/, '').trim();
        if (!mealName) return;
        currentGroup.meals.push(newMealItem(mealName));
    });

    if (currentGroup.meals.length > 0) {
        groups.push(currentGroup);
    }

    if (groups.length === 0) {
        return [newMealGroup('Meal Group 1', lines.map((line) => newMealItem(line.replace(/^[-*]\s*/, '').trim())).filter(meal => meal.name))];
    }

    return groups.map((group, idx) => ({
        ...group,
        name: group.name || `Meal Group ${idx + 1}`,
        meals: group.meals.length > 0 ? group.meals : [newMealItem('Meal 1')],
    }));
};

const getPlanMealGroups = (plan: DietPlan): MealGroupDraft[] => {
    const structured = parseStructuredMealGroups(plan.content_structured);
    if (structured && structured.length > 0) return structured;
    return parseContentMealGroups(plan.content || '');
};

export default function DietPlansPage() {
    const { showToast, confirm: confirmAction } = useFeedback();
    const [plans, setPlans] = useState<DietPlan[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<DietPlan | null>(null);
    const [expandedTemplatePlanId, setExpandedTemplatePlanId] = useState<string | null>(null);
    const [expandedAssignedPlanId, setExpandedAssignedPlanId] = useState<string | null>(null);

    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [planStatus, setPlanStatus] = useState<DietPlan['status']>('DRAFT');
    const [isTemplate, setIsTemplate] = useState(true);
    const [assignedMemberId, setAssignedMemberId] = useState('');
    const [mealGroups, setMealGroups] = useState<MealGroupDraft[]>([newMealGroup('Meal Group 1', [newMealItem('Meal 1')])]);
    const [newGroupName, setNewGroupName] = useState('');
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryQuery, setLibraryQuery] = useState('');
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [dietLibraryItems, setDietLibraryItems] = useState<DietLibraryItem[]>([]);

    const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>('ALL');

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningPlan, setAssigningPlan] = useState<DietPlan | null>(null);
    const [bulkAssignMemberIds, setBulkAssignMemberIds] = useState<string[]>([]);
    const [memberSearch, setMemberSearch] = useState('');

    const generatedContentPreview = useMemo(() => {
        const cleaned = normalizeMealGroups(mealGroups);
        return buildContentFromMealGroups(cleaned);
    }, [mealGroups]);

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

    const fetchDietLibrary = useCallback(async (query?: string) => {
        setLibraryLoading(true);
        try {
            const response = await api.get('/fitness/diet-library', {
                params: {
                    scope: 'all',
                    query: query?.trim() || undefined,
                },
            });
            setDietLibraryItems(response.data?.data || []);
        } catch {
            setDietLibraryItems([]);
            showToast('Failed to load diet library items.', 'error');
        }
        setLibraryLoading(false);
    }, [showToast]);

    useEffect(() => {
        setTimeout(() => fetchData(), 0);
    }, [fetchData]);

    const resetForm = () => {
        setEditingPlan(null);
        setPlanName('');
        setPlanDesc('');
        setPlanStatus('DRAFT');
        setIsTemplate(true);
        setAssignedMemberId('');
        setMealGroups([newMealGroup('Meal Group 1', [newMealItem('Meal 1')])]);
        setNewGroupName('');
        setLibraryOpen(false);
        setLibraryQuery('');
        setDietLibraryItems([]);
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

    const memberNameById = useMemo(() => {
        const lookup: Record<string, string> = {};
        members.forEach(member => {
            lookup[member.id] = member.full_name;
        });
        return lookup;
    }, [members]);

    const assignedPlanGroups = useMemo(() => {
        const grouped: Record<string, DietPlan[]> = {};
        assignedPlans.forEach(plan => {
            const rootId = plan.parent_plan_id || plan.id;
            if (!grouped[rootId]) grouped[rootId] = [];
            grouped[rootId].push(plan);
        });

        return Object.entries(grouped)
            .map(([rootId, memberPlans]) => {
                const rootPlan = plans.find(plan => plan.id === rootId) || memberPlans[0];
                return {
                    rootId,
                    rootPlanName: rootPlan?.name || 'Assigned Diet Plan',
                    members: [...memberPlans].sort((a, b) => {
                        const aName = a.member_id ? (memberNameById[a.member_id] || '') : '';
                        const bName = b.member_id ? (memberNameById[b.member_id] || '') : '';
                        return aName.localeCompare(bName);
                    }),
                };
            })
            .sort((a, b) => b.members.length - a.members.length || a.rootPlanName.localeCompare(b.rootPlanName));
    }, [assignedPlans, memberNameById, plans]);

    const handleOpenCreate = () => {
        resetForm();
        setShowModal(true);
        fetchDietLibrary();
    };

    const addGroup = () => {
        const explicitName = newGroupName.trim();
        const autoName = `Meal Group ${mealGroups.length + 1}`;
        setMealGroups(prev => [...prev, newMealGroup(explicitName || autoName, [newMealItem('Meal 1')])]);
        setNewGroupName('');
    };

    const removeGroup = (groupId: string) => {
        if (mealGroups.length === 1) {
            showToast('At least one meal group is required.', 'error');
            return;
        }
        setMealGroups(prev => prev.filter(group => group.id !== groupId));
    };

    const renameGroup = (groupId: string, value: string) => {
        setMealGroups(prev => prev.map(group => (group.id === groupId ? { ...group, name: value } : group)));
    };

    const addMealToGroup = (groupId: string) => {
        setMealGroups(prev => prev.map(group => (
            group.id === groupId
                ? { ...group, meals: [...group.meals, newMealItem(`Meal ${group.meals.length + 1}`)] }
                : group
        )));
    };

    const renameMeal = (groupId: string, mealId: string, value: string) => {
        setMealGroups(prev => prev.map(group => (
            group.id === groupId
                ? {
                    ...group,
                    meals: group.meals.map(meal => (meal.id === mealId ? { ...meal, name: value } : meal)),
                }
                : group
        )));
    };

    const removeMeal = (groupId: string, mealId: string) => {
        setMealGroups(prev => prev.map(group => {
            if (group.id !== groupId) return group;
            if (group.meals.length === 1) {
                showToast('A meal group needs at least one meal.', 'error');
                return group;
            }
            return {
                ...group,
                meals: group.meals.filter(meal => meal.id !== mealId),
            };
        }));
    };

    const applyLibraryItemToPlanner = (item: DietLibraryItem) => {
        const parsedGroups = parseContentMealGroups(item.content || '');
        setMealGroups(parsedGroups);
        if (!editingPlan && !planName.trim()) setPlanName(item.name);
        if (!planDesc.trim() && item.description) setPlanDesc(item.description);
        setLibraryOpen(false);
        showToast(`Loaded "${item.name}" into planner.`, 'success');
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
        setPlanStatus(plan.status || 'DRAFT');
        setIsTemplate(Boolean(plan.is_template));
        setAssignedMemberId(plan.member_id || '');
        const structuredGroups = parseStructuredMealGroups(plan.content_structured);
        const parsedGroups = structuredGroups || parseContentMealGroups(plan.content || '');
        setMealGroups(parsedGroups);
        setLibraryOpen(false);
        setLibraryQuery('');
        setDietLibraryItems([]);
        setShowModal(true);
        fetchDietLibrary();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanedGroups = normalizeMealGroups(mealGroups);
        const hasAnyMeal = cleanedGroups.some(group => group.meals.some(meal => meal.name.trim().length > 0));
        if (!hasAnyMeal) {
            showToast('Add at least one meal before saving.', 'error');
            return;
        }

        const payload = {
            name: planName,
            description: planDesc,
            content: buildContentFromMealGroups(cleanedGroups),
            content_structured: buildStructuredFromMealGroups(cleanedGroups),
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
                            <div className="rounded-sm p-3 text-sm text-muted-foreground max-h-28 overflow-y-auto bg-muted/30 border border-border space-y-2">
                                {(
                                    expandedTemplatePlanId === plan.id
                                        ? getPlanMealGroups(plan)
                                        : getPlanMealGroups(plan).slice(0, 2)
                                ).map(group => (
                                    <div key={group.id || group.name}>
                                        <p className="text-foreground text-xs font-semibold">{group.name}</p>
                                        {expandedTemplatePlanId === plan.id && (
                                            <p className="text-xs text-muted-foreground">
                                                {group.meals.map(meal => meal.name).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                ))}
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
                            <div className="border-t border-border pt-3 mt-3">
                                <button
                                    type="button"
                                    onClick={() => setExpandedTemplatePlanId(prev => prev === plan.id ? null : plan.id)}
                                    className="text-primary text-sm font-medium hover:text-primary/80 transition-colors flex items-center gap-1"
                                >
                                    {expandedTemplatePlanId === plan.id ? <><ChevronUp size={16} /> Collapse</> : <><ChevronDown size={16} /> View Details</>}
                                </button>
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
                <div className="space-y-4">
                    {assignedPlanGroups.map(group => (
                        <div key={group.rootId} className="kpi-card">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div>
                                    <p className="text-base font-semibold text-foreground">{group.rootPlanName}</p>
                                    <p className="text-xs text-muted-foreground">{group.members.length} assigned member{group.members.length > 1 ? 's' : ''}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {group.members.map(plan => (
                                    <div key={plan.id} className="rounded-sm border border-border p-3 bg-muted/15">
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{plan.member_id ? (memberNameById[plan.member_id] || 'Unknown member') : 'Unknown member'}</p>
                                                <p className="text-[11px] text-muted-foreground">{plan.name}</p>
                                            </div>
                                            <span className={`badge ${statusBadgeClass(plan.status)} rounded-sm`}>{plan.status}</span>
                                        </div>

                                        <div className="rounded-sm p-2 text-sm text-muted-foreground max-h-24 overflow-y-auto bg-muted/30 border border-border space-y-1.5">
                                            {(
                                                expandedAssignedPlanId === plan.id
                                                    ? getPlanMealGroups(plan)
                                                    : getPlanMealGroups(plan).slice(0, 2)
                                            ).map(mealGroup => (
                                                <div key={mealGroup.id || mealGroup.name}>
                                                    <p className="text-foreground text-[11px] font-semibold">{mealGroup.name}</p>
                                                    {expandedAssignedPlanId === plan.id && (
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {mealGroup.meals.map(meal => meal.name).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border">
                                            {plan.status !== 'ARCHIVED' && <button onClick={() => handleArchive(plan.id)} className="btn-ghost text-xs min-h-11"><Archive size={14} /> Archive</button>}
                                            <button onClick={() => handleDelete(plan.id)} className="btn-ghost text-xs min-h-11 text-destructive hover:text-destructive/80"><Trash2 size={14} /> Unassign</button>
                                        </div>
                                        <div className="border-t border-border pt-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedAssignedPlanId(prev => prev === plan.id ? null : plan.id)}
                                                className="text-primary text-xs font-medium hover:text-primary/80 transition-colors flex items-center gap-1"
                                            >
                                                {expandedAssignedPlanId === plan.id ? <><ChevronUp size={14} /> Collapse</> : <><ChevronDown size={14} /> View Details</>}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {assignedPlanGroups.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">No active diet plans assigned to members.</div>}
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

                            <div className="rounded-sm border border-border p-4 space-y-4 bg-muted/10">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Meal Planner</h3>
                                    <button
                                        type="button"
                                        className="btn-ghost text-xs min-h-11"
                                        onClick={() => {
                                            const next = !libraryOpen;
                                            setLibraryOpen(next);
                                            if (next && dietLibraryItems.length === 0) {
                                                fetchDietLibrary(libraryQuery);
                                            }
                                        }}
                                    >
                                        {libraryOpen ? 'Hide Library' : 'Choose from Library'}
                                    </button>
                                </div>

                                {libraryOpen && (
                                    <div className="rounded-sm border border-border p-3 bg-card space-y-2">
                                        <input
                                            type="text"
                                            className="input-dark"
                                            placeholder="Search library templates..."
                                            value={libraryQuery}
                                            onChange={e => setLibraryQuery(e.target.value)}
                                        />
                                        <div className="flex gap-2">
                                            <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => fetchDietLibrary(libraryQuery)}>Search</button>
                                            <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => { setLibraryQuery(''); fetchDietLibrary(''); }}>Clear</button>
                                        </div>
                                        <div className="max-h-52 overflow-y-auto divide-y divide-border border border-border rounded-sm">
                                            {libraryLoading && <p className="px-3 py-3 text-xs text-muted-foreground">Loading library...</p>}
                                            {!libraryLoading && dietLibraryItems.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No library items found.</p>}
                                            {dietLibraryItems.map(item => (
                                                <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-foreground truncate">{item.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{item.description || 'No description'}</p>
                                                    </div>
                                                    <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => applyLibraryItemToPlanner(item)}>Use</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {mealGroups.map((group, groupIndex) => (
                                        <div key={group.id} className="border border-border rounded-sm p-3 space-y-3 bg-card/50">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    className="input-dark"
                                                    value={group.name}
                                                    onChange={e => renameGroup(group.id, e.target.value)}
                                                    placeholder={`Meal Group ${groupIndex + 1}`}
                                                />
                                                <button type="button" className="btn-ghost text-xs min-h-11 text-destructive" onClick={() => removeGroup(group.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            <div className="space-y-2">
                                                {group.meals.map((meal, mealIndex) => (
                                                    <div key={meal.id} className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            className="input-dark"
                                                            value={meal.name}
                                                            onChange={e => renameMeal(group.id, meal.id, e.target.value)}
                                                            placeholder={`Meal ${mealIndex + 1}`}
                                                        />
                                                        <button type="button" className="btn-ghost text-xs min-h-11 text-destructive" onClick={() => removeMeal(group.id, meal.id)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <button type="button" className="btn-ghost text-xs min-h-11" onClick={() => addMealToGroup(group.id)}>
                                                <Plus size={14} /> Add Meal
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        className="input-dark"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        placeholder="New meal group name (optional)"
                                    />
                                    <button type="button" className="btn-ghost min-h-11" onClick={addGroup}>
                                        <Plus size={14} /> Add Meal Group
                                    </button>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Generated Content Preview</p>
                                    <textarea rows={6} readOnly className="input-dark resize-none font-mono text-xs" value={generatedContentPreview} />
                                </div>
                            </div>
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
