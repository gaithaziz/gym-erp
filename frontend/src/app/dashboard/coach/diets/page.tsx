'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Utensils, Trash2 } from 'lucide-react';

interface DietPlan {
    id: string;
    name: string;
    description: string | null;
    content: string;
    creator_id: string;
    member_id: string | null;
}

export default function DietPlansPage() {
    const [plans, setPlans] = useState<DietPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [planContent, setPlanContent] = useState('');

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const res = await api.get('/fitness/diets');
            setPlans(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/fitness/diets', {
                name: planName,
                description: planDesc,
                content: planContent,
            });
            setShowModal(false);
            setPlanName(''); setPlanDesc(''); setPlanContent('');
            fetchData();
        } catch (err) { alert('Failed to create diet plan'); }
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
                    <h1 className="text-2xl font-bold text-slate-800">Diet Plans</h1>
                    <p className="text-sm text-slate-400 mt-1">Create and manage nutrition programs</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-5 py-2.5 rounded-xl hover:shadow-lg hover:shadow-emerald-200 transition-all text-sm font-medium"
                >
                    <Plus size={18} />
                    <span>Create Plan</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {plans.map(plan => (
                    <div key={plan.id} className="kpi-card">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-gradient-to-br from-emerald-400 to-teal-500 h-11 w-11 rounded-xl flex items-center justify-center shadow-lg">
                                <Utensils size={20} className="text-white" />
                            </div>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">{plan.name}</h3>
                        <p className="text-slate-400 text-sm mb-4 line-clamp-2">{plan.description}</p>
                        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 max-h-24 overflow-y-auto whitespace-pre-wrap">
                            {plan.content}
                        </div>
                    </div>
                ))}

                {plans.length === 0 && (
                    <div className="col-span-full text-center py-16 chart-card border-dashed !border-slate-200">
                        <Utensils size={40} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-slate-400 text-sm">No diet plans yet. Create your first one!</p>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-800 mb-5">Create Diet Plan</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Plan Name</label>
                                <input type="text" required className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Lean Muscle Diet" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                                <input type="text" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Brief overview..." />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Plan Content (meals, macros, etc.)</label>
                                <textarea rows={6} required className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none resize-none" value={planContent} onChange={e => setPlanContent(e.target.value)} placeholder="Breakfast: ...&#10;Lunch: ...&#10;Dinner: ..." />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-sm">Cancel</button>
                                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-200 transition-all text-sm font-medium">Save Plan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
