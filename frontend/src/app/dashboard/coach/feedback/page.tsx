'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, Star } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

interface Plan {
    id: string;
    name: string;
}

interface DietPlanSummary {
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

interface DietFeedbackRow {
    id: string;
    member_id: string;
    diet_plan_id: string;
    diet_plan_name?: string | null;
    rating: number;
    comment: string | null;
    created_at: string;
}

interface GymFeedbackRow {
    id: string;
    member_id: string;
    category: string;
    rating: number;
    comment: string | null;
    created_at: string;
}

export default function FeedbackPage() {
    const { locale, formatDate } = useLocale();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [dietPlans, setDietPlans] = useState<DietPlanSummary[]>([]);
    const [selectedPlan, setSelectedPlan] = useState('');
    const [logs, setLogs] = useState<WorkoutLog[]>([]);
    const [dietFeedback, setDietFeedback] = useState<DietFeedbackRow[]>([]);
    const [gymFeedback, setGymFeedback] = useState<GymFeedbackRow[]>([]);
    const [tab, setTab] = useState<'WORKOUT' | 'DIET' | 'GYM'>('WORKOUT');
    const [minRating, setMinRating] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const [workoutRes, dietRes] = await Promise.all([
                    api.get('/fitness/plans'),
                    api.get('/fitness/diet-summaries').catch(() => api.get('/fitness/diets')),
                ]);
                setPlans(workoutRes.data.data || []);
                setDietPlans(dietRes.data.data || []);
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        };
        fetchPlans();
    }, []);

    useEffect(() => {
        api.get('/fitness/diet-feedback', { params: { min_rating: minRating } })
            .then((res) => setDietFeedback(res.data.data || []))
            .catch(() => setDietFeedback([]));

        api.get('/fitness/gym-feedback', { params: { min_rating: minRating } })
            .then((res) => setGymFeedback(res.data.data || []))
            .catch(() => setGymFeedback([]));
    }, [minRating]);

    const fetchLogs = async (planId: string) => {
        try {
            const res = await api.get(`/fitness/logs/${planId}`);
            setLogs(res.data.data);
        } catch (err) {
            console.error(err);
            setLogs([]);
        }
    };

    const handlePlanChange = (planId: string) => {
        setSelectedPlan(planId);
        if (planId) fetchLogs(planId);
        else setLogs([]);
    };

    const workoutRows = useMemo(() => logs.filter((row) => !minRating || (row.difficulty_rating || 0) >= minRating), [logs, minRating]);

    const gymCategoryLabel = (category: string) => {
        const normalized = category.trim().toUpperCase();
        if (locale === 'ar') {
            if (normalized === 'GENERAL') return 'عام';
            if (normalized === 'EQUIPMENT') return 'المعدات';
            if (normalized === 'CLEANLINESS') return 'النظافة';
            if (normalized === 'STAFF') return 'الطاقم';
            if (normalized === 'CLASSES') return 'الحصص';
        } else {
            if (normalized === 'GENERAL') return 'General';
            if (normalized === 'EQUIPMENT') return 'Equipment';
            if (normalized === 'CLEANLINESS') return 'Cleanliness';
            if (normalized === 'STAFF') return 'Staff';
            if (normalized === 'CLASSES') return 'Classes';
        }
        return category;
    };

    const dietPlanNameById = useMemo(() => {
        const map = new Map<string, string>();
        dietPlans.forEach((plan) => map.set(plan.id, plan.name));
        return map;
    }, [dietPlans]);

    const renderStars = (rating: number | null) => {
        if (!rating) return <span className="text-[#333] text-xs">{locale === 'ar' ? 'بدون تقييم' : 'No rating'}</span>;
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={14} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-[#333]'} />
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">{locale === 'ar' ? 'ملاحظات المتدربين' : 'Trainee Feedback'}</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">{locale === 'ar' ? 'نظرة عامة على ملاحظات التدريب والتغذية وتجربة النادي' : 'Workout, diet, and full gym feedback overview'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setTab('WORKOUT')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'WORKOUT' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{locale === 'ar' ? 'تمارين' : 'Workout'}</button>
                <button type="button" onClick={() => setTab('DIET')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'DIET' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{locale === 'ar' ? 'تغذية' : 'Diet'}</button>
                <button type="button" onClick={() => setTab('GYM')} className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${tab === 'GYM' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{locale === 'ar' ? 'النادي' : 'Gym'}</button>
            </div>

            <div className="max-w-sm">
                <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">{locale === 'ar' ? 'مرشح المشرف: الحد الأدنى للتقييم' : 'Admin Overview Filter: Min Rating'}</label>
                <select className="input-dark" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                    <option value={1}>1+</option>
                    <option value={2}>2+</option>
                    <option value={3}>3+</option>
                    <option value={4}>4+</option>
                    <option value={5}>{locale === 'ar' ? '5 فقط' : '5 only'}</option>
                </select>
            </div>

            {tab === 'WORKOUT' && (
                <>
                    <div className="max-w-sm">
                        <label className="block text-xs font-medium text-[#6B6B6B] mb-1.5">{locale === 'ar' ? 'اختر خطة التدريب' : 'Select Workout Plan'}</label>
                        <select className="input-dark" value={selectedPlan} onChange={e => handlePlanChange(e.target.value)}>
                            <option value="">{locale === 'ar' ? 'اختر خطة...' : 'Choose a plan...'}</option>
                            {plans.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    {selectedPlan && (
                        <div className="space-y-4">
                            {workoutRows.length === 0 ? (
                                <div className="chart-card text-center py-12 border border-dashed border-border">
                                    <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                                    <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد ملاحظات تدريب لهذا المرشح' : 'No workout feedback for this filter'}</p>
                                </div>
                            ) : (
                                workoutRows.map(log => (
                                    <div key={log.id} className="kpi-card">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-3 w-3 rounded-full ${log.completed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                <span className="text-sm font-medium text-foreground">
                                                    {log.completed ? (locale === 'ar' ? 'مكتمل' : 'Completed') : (locale === 'ar' ? 'جزئي' : 'Partial')}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDate(log.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-muted-foreground">{locale === 'ar' ? 'الصعوبة:' : 'Difficulty:'}</span>
                                            {renderStars(log.difficulty_rating)}
                                        </div>
                                        {log.comment && (
                                            <div className="rounded-sm p-3 text-sm text-muted-foreground mt-2 bg-muted/40 border border-border">
                                                {log.comment}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </>
            )}

            {tab === 'DIET' && (
                <div className="space-y-4">
                    {dietFeedback.length === 0 ? (
                        <div className="chart-card text-center py-12 border border-dashed border-border">
                            <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد ملاحظات تغذية لهذا المرشح' : 'No diet feedback yet for this filter'}</p>
                        </div>
                    ) : (
                        dietFeedback.map((row) => (
                            <div key={row.id} className="kpi-card">
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-xs text-muted-foreground font-mono">
                                        {locale === 'ar' ? 'الخطة:' : 'Plan:'} {row.diet_plan_name || dietPlanNameById.get(row.diet_plan_id) || row.diet_plan_id}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDate(row.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-muted-foreground">{locale === 'ar' ? 'التقييم:' : 'Rating:'}</span>
                                    {renderStars(row.rating)}
                                </div>
                                {row.comment && (
                                    <div className="rounded-sm p-3 text-sm text-muted-foreground mt-2 bg-muted/40 border border-border">
                                        {row.comment}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {tab === 'GYM' && (
                <div className="space-y-4">
                    {gymFeedback.length === 0 ? (
                        <div className="chart-card text-center py-12 border border-dashed border-border">
                            <MessageSquare size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا توجد ملاحظات للنادي لهذا المرشح' : 'No gym feedback yet for this filter'}</p>
                        </div>
                    ) : (
                        gymFeedback.map((row) => (
                            <div key={row.id} className="kpi-card">
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-xs text-muted-foreground font-mono">{locale === 'ar' ? 'الفئة:' : 'Category:'} {gymCategoryLabel(row.category)}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDate(row.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-muted-foreground">{locale === 'ar' ? 'التقييم:' : 'Rating:'}</span>
                                    {renderStars(row.rating)}
                                </div>
                                {row.comment && (
                                    <div className="rounded-sm p-3 text-sm text-muted-foreground mt-2 bg-muted/40 border border-border">
                                        {row.comment}
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
