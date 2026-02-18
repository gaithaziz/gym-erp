'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Dumbbell, Trash2, Video } from 'lucide-react';

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
            // Try to fetch members for assignment (may fail if not admin)
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

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Workout Plans</h1>
                    <p className="text-sm text-slate-400 mt-1">Create and manage training programs</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-5 py-2.5 rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all text-sm font-medium"
                >
                    <Plus size={18} />
                    <span>Create Plan</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {plans.map(plan => (
                    <div key={plan.id} className="kpi-card">
                        <div className="flex justify-between items-start mb-4">
                            <div className="icon-blue h-11 w-11 rounded-xl flex items-center justify-center shadow-lg">
                                <Dumbbell size={20} className="text-white" />
                            </div>
                            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                                {plan.exercises?.length || 0} Exercises
                            </span>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">{plan.name}</h3>
                        <p className="text-slate-400 text-sm mb-4 line-clamp-2">{plan.description}</p>

                        {/* Exercise preview */}
                        {plan.exercises?.length > 0 && (
                            <div className="space-y-1.5 mb-4">
                                {plan.exercises.slice(0, 3).map((ex: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-xs bg-slate-50 px-3 py-1.5 rounded-lg">
                                        <span className="text-slate-600">{ex.exercise?.name || ex.exercise_name || ex.name || `Exercise ${i + 1}`}</span>
                                        <div className="flex items-center gap-2">
                                            {ex.exercise?.video_url && (
                                                <a href={ex.exercise.video_url} target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-600">
                                                    <Video size={14} />
                                                </a>
                                            )}
                                            <span className="text-slate-400">{ex.sets}×{ex.reps}</span>
                                        </div>
                                    </div>
                                ))}
                                {plan.exercises.length > 3 && (
                                    <p className="text-xs text-slate-300 pl-3">+{plan.exercises.length - 3} more</p>
                                )}
                            </div>
                        )}

                        <div className="border-t border-slate-100 pt-3">
                            <button className="text-blue-500 text-sm font-medium hover:text-blue-700 transition-colors">
                                View Details →
                            </button>
                        </div>
                    </div>
                ))}

                {plans.length === 0 && (
                    <div className="col-span-full text-center py-16 chart-card border-dashed !border-slate-200">
                        <Dumbbell size={40} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-slate-400 text-sm">No workout plans yet. Create your first one!</p>
                    </div>
                )}
            </div>

            {/* Create Plan Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-800 mb-5">Create New Workout Plan</h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Plan Name</label>
                                    <input type="text" required className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Beginner Chest" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                                    <input type="text" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Goal of this plan..." />
                                </div>
                            </div>
                            {members.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Assign to Member (optional)</label>
                                    <select className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}>
                                        <option value="">Unassigned (template)</option>
                                        {members.map(m => (
                                            <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Exercise Builder */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Add Exercises</h3>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Exercise</label>
                                        <select className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none" value={currentExId} onChange={e => setCurrentExId(e.target.value)}>
                                            <option value="">Select Exercise...</option>
                                            {exercises.map(ex => (
                                                <option key={ex.id} value={ex.id}>{ex.name} ({ex.category})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Sets</label>
                                        <input type="number" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-center outline-none" value={currentSets} onChange={e => setCurrentSets(parseInt(e.target.value))} />
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Reps</label>
                                        <input type="number" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-center outline-none" value={currentReps} onChange={e => setCurrentReps(parseInt(e.target.value))} />
                                    </div>
                                    <button type="button" onClick={addExerciseToPlan} className="bg-slate-800 text-white p-2.5 rounded-xl hover:bg-slate-700 transition-colors">
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>

                            {selectedExercises.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Plan Content</h3>
                                    <ul className="space-y-2">
                                        {selectedExercises.map((ex, idx) => (
                                            <li key={idx} className="flex justify-between items-center bg-white border border-slate-100 p-3 rounded-xl text-sm">
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-blue-50 text-blue-600 w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold">{idx + 1}</span>
                                                    <span className="font-medium text-slate-700">{ex.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-slate-400 text-sm">{ex.sets} × {ex.reps}</span>
                                                    <button type="button" onClick={() => setSelectedExercises(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-sm">Cancel</button>
                                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all text-sm font-medium">Save Plan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
