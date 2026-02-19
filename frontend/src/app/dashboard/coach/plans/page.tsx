'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Dumbbell, Trash2, Video, ChevronDown, ChevronUp } from 'lucide-react';

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
    exercises: any[];
}

export default function WorkoutPlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [assignedMemberId, setAssignedMemberId] = useState('');
    const [selectedExercises, setSelectedExercises] = useState<WorkoutExercise[]>([]);
    const [currentExId, setCurrentExId] = useState('');
    const [currentSets, setCurrentSets] = useState(3);
    const [currentReps, setCurrentReps] = useState(10);

    useEffect(() => { fetchData(); }, []);

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
        } catch (err) { console.error(err); setLoading(false); }
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/fitness/plans', {
                name: planName,
                description: planDesc,
                member_id: assignedMemberId || undefined,
                exercises: selectedExercises
            });
            setShowModal(false);
            setPlanName(''); setPlanDesc(''); setAssignedMemberId(''); setSelectedExercises([]);
            fetchData();
        } catch (err) { alert("Failed to create plan"); }
    };

    const handleDelete = async (planId: string) => {
        if (!confirm('Are you sure you want to delete this plan?')) return;
        try {
            await api.delete(`/fitness/plans/${planId}`);
            fetchData();
        } catch (err) { alert("Failed to delete plan"); }
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
                <button onClick={() => setShowModal(true)} className="btn-primary">
                    <Plus size={18} /> Create Plan
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {plans.map(plan => (
                    <div key={plan.id} className="kpi-card">
                        <div className="flex justify-between items-start mb-4">
                            <div className="icon-blue h-11 w-11 rounded-xl flex items-center justify-center">
                                <Dumbbell size={20} className="text-white" />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-[#6B6B6B] px-2.5 py-1 rounded-full" style={{ background: '#2a2a2a' }}>
                                    {plan.exercises?.length || 0} Exercises
                                </span>
                                <button
                                    onClick={() => handleDelete(plan.id)}
                                    className="text-[#555] hover:text-[#f87171] transition-colors p-1"
                                    title="Delete plan"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        <h3 className="font-bold text-lg text-white mb-1">{plan.name}</h3>
                        <p className="text-[#6B6B6B] text-sm mb-4 line-clamp-2">{plan.description}</p>

                        {plan.exercises?.length > 0 && (
                            <div className="space-y-1.5 mb-4">
                                {(expandedPlan === plan.id ? plan.exercises : plan.exercises.slice(0, 3)).map((ex: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-xs px-3 py-1.5 rounded-lg" style={{ background: '#2a2a2a' }}>
                                        <span className="text-[#A3A3A3]">{ex.exercise?.name || ex.exercise_name || ex.name || `Exercise ${i + 1}`}</span>
                                        <div className="flex items-center gap-2">
                                            {ex.exercise?.video_url && (
                                                <a href={ex.exercise.video_url} target="_blank" rel="noopener" className="text-[#FF6B00] hover:text-[#FF8533]">
                                                    <Video size={14} />
                                                </a>
                                            )}
                                            <span className="text-[#6B6B6B]">{ex.sets}×{ex.reps}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

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

                {plans.length === 0 && (
                    <div className="col-span-full text-center py-16 chart-card border-dashed !border-[#333]">
                        <Dumbbell size={40} className="mx-auto text-[#333] mb-3" />
                        <p className="text-[#6B6B6B] text-sm">No workout plans yet. Create your first one!</p>
                    </div>
                )}
            </div>

            {/* Create Plan Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" style={{ background: '#1e1e1e', border: '1px solid #333' }}>
                        <h2 className="text-lg font-bold text-white mb-5">Create New Workout Plan</h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Plan Name</label>
                                    <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Beginner Chest" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Description</label>
                                    <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Goal of this plan..." />
                                </div>
                            </div>
                            {members.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Assign to Member (optional)</label>
                                    <select className="input-dark" value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}>
                                        <option value="">Unassigned (template)</option>
                                        {members.map(m => (
                                            <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Exercise Builder */}
                            <div className="p-4 rounded-xl border border-[#333]" style={{ background: '#2a2a2a' }}>
                                <h3 className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider mb-3">Add Exercises</h3>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-[#555] mb-1">Exercise</label>
                                        <select className="input-dark" value={currentExId} onChange={e => setCurrentExId(e.target.value)}>
                                            <option value="">Select Exercise...</option>
                                            {exercises.map(ex => (
                                                <option key={ex.id} value={ex.id}>{ex.name} ({ex.category})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-xs font-medium text-[#555] mb-1">Sets</label>
                                        <input type="number" className="input-dark text-center" value={currentSets} onChange={e => setCurrentSets(parseInt(e.target.value))} />
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-xs font-medium text-[#555] mb-1">Reps</label>
                                        <input type="number" className="input-dark text-center" value={currentReps} onChange={e => setCurrentReps(parseInt(e.target.value))} />
                                    </div>
                                    <button type="button" onClick={addExerciseToPlan} className="p-2.5 rounded-xl transition-colors" style={{ background: '#FF6B00' }}>
                                        <Plus size={18} className="text-white" />
                                    </button>
                                </div>
                            </div>

                            {selectedExercises.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider mb-2">Plan Content</h3>
                                    <ul className="space-y-2">
                                        {selectedExercises.map((ex, idx) => (
                                            <li key={idx} className="flex justify-between items-center border border-[#333] p-3 rounded-xl text-sm" style={{ background: '#2a2a2a' }}>
                                                <div className="flex items-center gap-3">
                                                    <span className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold" style={{ background: 'rgba(255,107,0,0.15)', color: '#FF6B00' }}>{idx + 1}</span>
                                                    <span className="font-medium text-white">{ex.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-[#6B6B6B] text-sm">{ex.sets} × {ex.reps}</span>
                                                    <button type="button" onClick={() => setSelectedExercises(prev => prev.filter((_, i) => i !== idx))} className="text-[#555] hover:text-[#f87171] transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                                <button type="submit" className="btn-primary">Save Plan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
