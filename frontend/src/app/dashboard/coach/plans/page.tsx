'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Dumbbell, Trash2, ChevronDown, ChevronUp, UserPlus, Pencil, Save, X } from 'lucide-react';
import Modal from '@/components/Modal';

interface Exercise {
    id: string;
    name: string;
    category: string;
    video_url?: string;
}

interface Member {
    id: string;
    full_name: string;
    email: string;
}

interface WorkoutExercise {
    exercise_id: string;
    sets: number;
    reps: number;
    order: number;
    name?: string;
}

interface Plan {
    id: string;
    name: string;
    description: string;
    exercises: {
        name: string;
        sets: number;
        reps: number;
        exercise?: { name: string; id: string };
        exercise_id?: string;
    }[];
    member_id?: string | null;
}

export default function WorkoutPlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    // Create / Edit Modal
    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

    // Assign Modal
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningPlan, setAssigningPlan] = useState<Plan | null>(null);
    const [assignMemberId, setAssignMemberId] = useState('');

    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [assignedMemberId, setAssignedMemberId] = useState('');
    const [selectedExercises, setSelectedExercises] = useState<WorkoutExercise[]>([]);
    const [currentExId, setCurrentExId] = useState('');
    const [currentSets, setCurrentSets] = useState(3);
    const [currentReps, setCurrentReps] = useState(10);

    const fetchData = async () => {
        try {
            const [plansRes, exRes] = await Promise.all([
                api.get('/fitness/plans'),
                api.get('/fitness/exercises')
            ]);
            setPlans(plansRes.data.data);
            setExercises(exRes.data.data);
            try {
                const membersRes = await api.get('/hr/members');
                setMembers(membersRes.data.data || []);
            } catch { /* non-admin, skip */ }
            setLoading(false);
        } catch { setLoading(false); }
    };

    useEffect(() => { setTimeout(() => fetchData(), 0); }, []);

    // Reset form when modal opens
    const handleOpenCreateModal = () => {
        setEditingPlan(null);
        setPlanName('');
        setPlanDesc('');
        setAssignedMemberId('');
        setSelectedExercises([]);
        setShowModal(true);
    };

    const addExerciseToPlan = () => {
        if (!currentExId) return;
        const exDef = exercises.find(e => e.id === currentExId);
        if (!exDef) return;
        setSelectedExercises([
            ...selectedExercises,
            { exercise_id: currentExId, sets: currentSets, reps: currentReps, order: selectedExercises.length + 1, name: exDef.name }
        ]);
    };

    const handleEditClick = (plan: Plan) => {
        setEditingPlan(plan);
        setPlanName(plan.name);
        setPlanDesc(plan.description);
        // Map existing exercises to form format
        // Note: The backend response structure for exercises might need careful mapping.
        // Assuming plan.exercises has exercise details nested.
        const mappedEx = plan.exercises.map((ex, i) => ({
            exercise_id: ex.exercise?.id || ex.exercise_id || '', // Fallback if ID is missing in one place
            sets: ex.sets,
            reps: ex.reps,
            order: i + 1,
            name: ex.exercise?.name || ex.name
        })).filter(e => e.exercise_id); // Filter out any malformed ones

        setSelectedExercises(mappedEx);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: planName,
                description: planDesc,
                member_id: assignedMemberId || undefined,
                exercises: selectedExercises
            };

            if (editingPlan) {
                await api.put(`/fitness/plans/${editingPlan.id}`, payload);
            } else {
                await api.post('/fitness/plans', payload);
            }

            setShowModal(false);
            fetchData();
        } catch { alert(`Failed to ${editingPlan ? 'update' : 'create'} plan`); }
    };

    const openAssign = (plan: Plan) => {
        setAssigningPlan(plan);
        setAssignMemberId('');
        setAssignModalOpen(true);
    };

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigningPlan || !assignMemberId) return;

        try {
            // Clone the plan for the user
            // We need to fetch the full plan details first? We have them in `assigningPlan` mostly.
            // But let's construct the payload from `assigningPlan`.

            const payload = {
                name: assigningPlan.name, // Keep same name
                description: assigningPlan.description,
                member_id: assignMemberId,
                exercises: assigningPlan.exercises.map((ex, i) => ({
                    exercise_id: ex.exercise?.id || ex.exercise_id || '',
                    sets: ex.sets,
                    reps: ex.reps,
                    order: i + 1
                }))
            };

            await api.post('/fitness/plans', payload);
            setAssignModalOpen(false);
            alert(`Plan assigned to ${members.find(m => m.id === assignMemberId)?.full_name}`);
            fetchData();
        } catch {
            alert("Failed to assign plan.");
        }
    };

    const handleDelete = async (planId: string) => {
        if (!confirm('Are you sure you want to delete this plan?')) return;
        try {
            await api.delete(`/fitness/plans/${planId}`);
            fetchData();
        } catch { alert("Failed to delete plan"); }
    };

    const toggleExpand = (planId: string) => {
        setExpandedPlan(expandedPlan === planId ? null : planId);
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Workout Plans</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">Create and manage training programs</p>
                </div>
                <button onClick={handleOpenCreateModal} className="btn-primary">
                    <Plus size={18} /> Create Plan
                </button>
            </div>

            <div className="flex justify-between items-center mt-8 mb-4">
                <h2 className="text-xl font-bold text-foreground">Workout Templates</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.filter(p => !p.member_id).map((plan) => (
                    <div key={plan.id} className="kpi-card group relative">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{plan.name}</h3>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                            </div>
                            <span className="badge badge-orange rounded-sm">
                                {plan.exercises?.length || 0} Ex
                            </span>
                        </div>

                        <div className="space-y-2 mb-4">
                            {plan.exercises?.slice(0, 3).map((ex, i: number) => (
                                <div key={i} className="flex justify-between items-center text-xs px-3 py-1.5 rounded-sm bg-muted/30 border border-border">
                                    <span className="text-foreground font-medium">{ex.exercise?.name || ex.name || 'Exercise'}</span>
                                    <span className="text-muted-foreground font-mono">{ex.sets}x{ex.reps}</span>
                                </div>
                            ))}
                            {plan.exercises?.length > 3 && (
                                <p className="text-[10px] text-center text-muted-foreground font-mono uppercase tracking-wider">+{plan.exercises.length - 3} more</p>
                            )}
                        </div>

                        {expandedPlan === plan.id && (
                            <div className="mb-4 space-y-2 border-t border-border pt-3">
                                {plan.exercises?.slice(3).map((ex, i: number) => (
                                    <div key={i + 3} className="flex justify-between items-center text-xs px-3 py-1.5 rounded-sm bg-muted/30 border border-border">
                                        <span className="text-foreground font-medium">{ex.exercise?.name || ex.name || 'Exercise'}</span>
                                        <span className="text-muted-foreground font-mono">{ex.sets}x{ex.reps}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                            <button onClick={() => handleEditClick(plan)} className="flex-1 btn-ghost text-xs py-1.5 h-8 hover:text-blue-400">
                                <Pencil size={14} /> Edit
                            </button>
                            <button onClick={() => openAssign(plan)} className="flex-1 btn-ghost text-xs py-1.5 h-8 hover:text-green-400">
                                <UserPlus size={14} /> Assign
                            </button>
                            <button
                                onClick={() => handleDelete(plan.id)}
                                className="flex-1 btn-ghost text-xs py-1.5 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 size={14} /> Del
                            </button>
                        </div>
                        <div className="border-t border-white/5 pt-3">
                            <button
                                onClick={() => toggleExpand(plan.id)}
                                className="text-[#FF6B00] text-sm font-medium hover:text-[#FF8533] transition-colors flex items-center gap-1"
                            >
                                {expandedPlan === plan.id ? (
                                    <><ChevronUp size={16} /> Collapse</>
                                ) : (
                                    <><ChevronDown size={16} /> View Details</>
                                )}
                            </button>
                        </div>
                    </div>
                ))}

                {plans.filter(p => !p.member_id).length === 0 && (
                    <div className="col-span-full text-center py-16 chart-card border-dashed !border-[#333]">
                        <Dumbbell size={40} className="mx-auto text-[#333] mb-3" />
                        <p className="text-[#6B6B6B] text-sm">No workout templates yet. Create your first one!</p>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-12 mb-4 border-t border-border pt-8">
                <h2 className="text-xl font-bold text-foreground">Active Assigned Plans</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.filter(p => p.member_id).map((plan) => (
                    <div key={plan.id} className="kpi-card group relative border-l-4 border-l-emerald-500">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                    <span className="text-emerald-500 font-medium">Assigned to:</span>
                                    {members.find(m => m.id === plan.member_id)?.full_name || 'Unknown Member'}
                                </div>
                            </div>
                            <span className="badge badge-gray rounded-sm">
                                {plan.exercises?.length || 0} Ex
                            </span>
                        </div>

                        <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                            <button onClick={() => handleEditClick(plan)} className="flex-1 btn-ghost text-xs py-1.5 h-8 hover:text-blue-400">
                                <Pencil size={14} /> Edit
                            </button>
                            <button
                                onClick={() => handleDelete(plan.id)}
                                className="flex-1 btn-ghost text-xs py-1.5 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 size={14} /> Unassign
                            </button>
                        </div>
                    </div>
                ))}

                {plans.filter(p => p.member_id).length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                        No active plans assigned to members.
                    </div>
                )}
            </div>

            {/* Create/Edit Plan Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm border border-border bg-card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold text-foreground">{editingPlan ? 'Edit Workout Plan' : 'Create New Workout Plan'}</h2>
                            <button onClick={() => setShowModal(false)}><X size={20} className="text-muted-foreground" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Plan Name</label>
                                    <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Beginner Chest" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                                    <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Goal of this plan..." />
                                </div>
                            </div>

                            {/* Only show assignment on Create. On Edit, we might not want to change assignment easily here, or keep it optional. */}
                            {!editingPlan && members.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Assign to Member (optional)</label>
                                    <select className="input-dark" value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}>
                                        <option value="">Unassigned (template)</option>
                                        {members.map(m => (
                                            <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Exercise Builder */}
                            <div className="p-4 rounded-sm border border-border bg-muted/20">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Add Exercises</h3>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">Exercise</label>
                                        <select className="input-dark" value={currentExId} onChange={e => setCurrentExId(e.target.value)}>
                                            <option value="">Select Exercise...</option>
                                            {exercises.map(ex => (
                                                <option key={ex.id} value={ex.id}>{ex.name} ({ex.category})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">Sets</label>
                                        <input type="number" className="input-dark text-center" value={currentSets} onChange={e => setCurrentSets(parseInt(e.target.value))} />
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">Reps</label>
                                        <input type="number" className="input-dark text-center" value={currentReps} onChange={e => setCurrentReps(parseInt(e.target.value))} />
                                    </div>
                                    <button type="button" onClick={addExerciseToPlan} className="p-2.5 rounded-sm transition-colors btn-primary">
                                        <Plus size={18} className="text-primary-foreground" />
                                    </button>
                                </div>
                            </div>

                            {selectedExercises.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Plan Content</h3>
                                    <ul className="space-y-2">
                                        {selectedExercises.map((ex, idx) => (
                                            <li key={idx} className="flex justify-between items-center border border-border p-3 rounded-sm text-sm bg-muted/10">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-7 h-7 flex items-center justify-center rounded-sm text-xs font-bold bg-primary/10 text-primary">{idx + 1}</span>
                                                    <span className="font-medium text-foreground">{ex.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-muted-foreground text-sm">{ex.sets} × {ex.reps}</span>
                                                    <button type="button" onClick={() => setSelectedExercises(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                                <button type="submit" className="btn-primary"><Save size={16} /> {editingPlan ? 'Update Plan' : 'Save Plan'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assign Modal */}
            <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title={`Assign: ${assigningPlan?.name}`}>
                <form onSubmit={handleAssignSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Select a member to assign this workout plan to. A copy of the plan will be created for them.
                    </p>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Member</label>
                        <select
                            required
                            className="input-dark w-full"
                            value={assignMemberId}
                            onChange={e => setAssignMemberId(e.target.value)}
                        >
                            <option value="">Select Member...</option>
                            {members.map(m => (
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={() => setAssignModalOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary"><UserPlus size={16} /> Assign Plan</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
