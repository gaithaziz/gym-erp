'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Plus, Utensils, Trash2 } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';

interface DietPlan {
    id: string;
    name: string;
    description: string | null;
    content: string;
    creator_id: string;
    member_id: string | null;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
};

export default function DietPlansPage() {
    const { showToast, confirm: confirmAction } = useFeedback();
    const [plans, setPlans] = useState<DietPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [planName, setPlanName] = useState('');
    const [planDesc, setPlanDesc] = useState('');
    const [planContent, setPlanContent] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const res = await api.get('/fitness/diets');
            setPlans(res.data.data);
        } catch {
            showToast('Failed to load diet plans.', 'error');
        }
        setLoading(false);
    }, [showToast]);

    useEffect(() => {
        setTimeout(() => fetchData(), 0);
        const intervalId = window.setInterval(() => { fetchData(); }, 15000);
        return () => window.clearInterval(intervalId);
    }, [fetchData]);

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
            showToast('Diet plan created.', 'success');
        } catch {
            showToast('Failed to create diet plan.', 'error');
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
                    <p className="text-sm text-[#6B6B6B] mt-1">Create and manage nutrition programs</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/coach/library" className="btn-ghost min-h-11">
                        Open Library
                    </Link>
                    <button onClick={() => setShowModal(true)} className="btn-primary">
                        <Plus size={18} /> Create Plan
                    </button>
                </div>
            </div>

            <div className="columns-1 md:columns-2 xl:columns-3 gap-5 space-y-5">
                {plans.map(plan => (
                    <div key={plan.id} className="kpi-card group break-inside-avoid mb-5">
                        <div className="flex justify-between items-start mb-4 gap-2">
                            <div className="h-11 w-11 rounded-sm bg-green-500/10 flex items-center justify-center border border-green-500/20">
                                <Utensils size={20} className="text-green-500" />
                            </div>
                            <button
                                onClick={() => handleDelete(plan.id)}
                                className="btn-ghost !px-2 !py-1 h-auto text-xs text-destructive hover:text-destructive/80"
                                title="Delete Diet Plan"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        <h3 className="font-bold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">{plan.name}</h3>
                        <p className="text-muted-foreground text-sm mb-4 line-clamp-2">{plan.description}</p>
                        <div className="rounded-sm p-3 text-sm text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap bg-muted/30 border border-border">
                            {plan.content}
                        </div>
                    </div>
                ))}

                {plans.length === 0 && (
                    <div className="text-center py-16 chart-card border-dashed border-border break-inside-avoid mb-5">
                        <Utensils size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">No diet plans yet. Create your first one!</p>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="rounded-sm border border-border bg-card p-6 w-full max-w-lg shadow-2xl">
                        <h2 className="text-lg font-bold text-foreground mb-5">Create Diet Plan</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Plan Name</label>
                                <input type="text" required className="input-dark" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Lean Muscle Diet" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                                <input type="text" className="input-dark" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="Brief overview..." />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Plan Content (meals, macros, etc.)</label>
                                <textarea rows={6} required className="input-dark resize-none" value={planContent} onChange={e => setPlanContent(e.target.value)} placeholder={"Breakfast: ...\nLunch: ...\nDinner: ..."} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
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
