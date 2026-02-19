'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Utensils } from 'lucide-react';

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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Diet Plans</h1>
                    <p className="text-sm text-[#6B6B6B] mt-1">Create and manage nutrition programs</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary">
                    <Plus size={18} /> Create Plan
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {plans.map(plan => (
                    <div key={plan.id} className="kpi-card">
                        <div className="flex justify-between items-start mb-4">
                            <div className="icon-green h-11 w-11 rounded-xl flex items-center justify-center">
                                <Utensils size={20} className="text-white" />
                            </div>
                        </div>
                        <h3 className="font-bold text-lg text-white mb-1">{plan.name}</h3>
                        <p className="text-[#6B6B6B] text-sm mb-4 line-clamp-2">{plan.description}</p>
                        <div className="rounded-lg p-3 text-sm text-[#A3A3A3] max-h-24 overflow-y-auto whitespace-pre-wrap" style={{ background: '#2a2a2a' }}>
                            {plan.content}
                        </div>
                    </div>
                ))}

                {plans.length === 0 && (
                    <div className="col-span-full text-center py-16 chart-card border-dashed !border-[#333]">
                        <Utensils size={40} className="mx-auto text-[#333] mb-3" />
                        <p className="text-[#6B6B6B] text-sm">No diet plans yet. Create your first one!</p>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-2xl p-6 w-full max-w-lg shadow-2xl" style={{ background: '#1e1e1e', border: '1px solid #333' }}>
                        <h2 className="text-lg font-bold text-white mb-5">Create Diet Plan</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Plan Name</label>
                                <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Lean Muscle Diet" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Description</label>
                                <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Brief overview..." />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Plan Content (meals, macros, etc.)</label>
                                <textarea rows={6} required className="input-dark resize-none" value={planContent} onChange={e => setPlanContent(e.target.value)} placeholder={"Breakfast: ...\nLunch: ...\nDinner: ..."} />
                            </div>
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
