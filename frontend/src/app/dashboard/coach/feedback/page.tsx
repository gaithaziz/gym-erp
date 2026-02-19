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
        if (!rating) return <span className="text-[#333] text-xs">No rating</span>;
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={14} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-[#333]'} />
                ))}
            </div>
        );
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Trainee Feedback</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">View workout feedback from your trainees</p>
            </div>

            <div className="max-w-sm">
                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">Select Workout Plan</label>
                <select
                    className="input-dark"
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
                            <MessageSquare size={40} className="mx-auto text-[#333] mb-3" />
                            <p className="text-[#6B6B6B] text-sm">No feedback yet for this plan</p>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className="kpi-card">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-3 w-3 rounded-full ${log.completed ? 'bg-[#34d399]' : 'bg-amber-400'}`} />
                                        <span className="text-sm font-medium text-white">
                                            {log.completed ? 'Completed' : 'Partial'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-[#6B6B6B]">
                                        {new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-[#6B6B6B]">Difficulty:</span>
                                    {renderStars(log.difficulty_rating)}
                                </div>
                                {log.comment && (
                                    <div className="rounded-lg p-3 text-sm text-[#A3A3A3] mt-2" style={{ background: '#2a2a2a' }}>
                                        &quot;{log.comment}&quot;
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
