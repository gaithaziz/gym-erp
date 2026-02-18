'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, Star } from 'lucide-react';

interface Plan {
    id: string;
    name: string;
}

interface WorkoutLog {
    id: string;
    member_id: string;
    plan_id: string;
    date: string;
    completed: boolean;
    difficulty_rating: number | null;
    comment: string | null;
}

export default function FeedbackPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [selectedPlan, setSelectedPlan] = useState('');
    const [logs, setLogs] = useState<WorkoutLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const res = await api.get('/fitness/plans');
                setPlans(res.data.data);
            } catch (err) { console.error(err); }
            setLoading(false);
        };
        fetchPlans();
    }, []);

    const fetchLogs = async (planId: string) => {
        try {
            const res = await api.get(`/fitness/logs/${planId}`);
            setLogs(res.data.data);
        } catch (err) { console.error(err); setLogs([]); }
    };

    const handlePlanChange = (planId: string) => {
        setSelectedPlan(planId);
        if (planId) fetchLogs(planId);
        else setLogs([]);
    };

    const renderStars = (rating: number | null) => {
        if (!rating) return <span className="text-slate-300 text-xs">No rating</span>;
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={14} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                ))}
            </div>
        );
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Trainee Feedback</h1>
                <p className="text-sm text-slate-400 mt-1">View workout feedback from your trainees</p>
            </div>

            <div className="max-w-sm">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Select Workout Plan</label>
                <select
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                    value={selectedPlan}
                    onChange={e => handlePlanChange(e.target.value)}
                >
                    <option value="">Choose a plan...</option>
                    {plans.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            </div>

            {selectedPlan && (
                <div className="space-y-4">
                    {logs.length === 0 ? (
                        <div className="chart-card text-center py-12">
                            <MessageSquare size={40} className="mx-auto text-slate-200 mb-3" />
                            <p className="text-slate-400 text-sm">No feedback yet for this plan</p>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className="kpi-card">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-3 w-3 rounded-full ${log.completed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                        <span className="text-sm font-medium text-slate-700">
                                            {log.completed ? 'Completed' : 'Partial'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-slate-400">
                                        {new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-slate-500">Difficulty:</span>
                                    {renderStars(log.difficulty_rating)}
                                </div>
                                {log.comment && (
                                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 mt-2">
                                        "{log.comment}"
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
