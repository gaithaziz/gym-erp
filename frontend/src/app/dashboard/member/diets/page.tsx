'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Utensils } from 'lucide-react';

import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

import { fetchMemberDiets, fetchMemberDietTracker, updateMemberDietTracker } from '../_shared/customerData';
import type { MemberDiet, MemberDietTracker } from '../_shared/types';

export default function MemberDietsPage() {
    const { locale } = useLocale();
    const { showToast } = useFeedback();
    const [diets, setDiets] = useState<MemberDiet[]>([]);
    const [selectedDietId, setSelectedDietId] = useState<string | null>(null);
    const [tracker, setTracker] = useState<MemberDietTracker | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyMealId, setBusyMealId] = useState<string | null>(null);
    const [dayId, setDayId] = useState<string | null>(null);
    const [dayNotes, setDayNotes] = useState('');
    const [adherenceRating, setAdherenceRating] = useState('3');

    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const txt = locale === 'ar' ? {
        title: 'متتبع النظام الغذائي',
        subtitle: 'تابع أيامك ووجباتك بدل الاكتفاء بقراءة نص الخطة.',
        diets: 'الخطط المعينة',
        noDiets: 'لا توجد خطط غذائية معينة بعد.',
        meals: 'الوجبات',
        adherence: 'التزام اليوم',
        notes: 'ملاحظات اليوم',
        saveDay: 'حفظ اليوم',
        legacy: 'محتوى الخطة',
        emptyStructured: 'هذه الخطة لا تحتوي على أيام ووجبات منظمة بعد.',
        saved: 'تم تحديث اليوم الغذائي.',
    } : {
        title: 'Diet Tracker',
        subtitle: 'Track days and meals instead of reading diet plans as plain text.',
        diets: 'Assigned diets',
        noDiets: 'No diet plans assigned yet.',
        meals: 'Meals',
        adherence: 'Daily adherence',
        notes: 'Day notes',
        saveDay: 'Save day',
        legacy: 'Plan content',
        emptyStructured: 'This plan does not have structured days and meals yet.',
        saved: 'Diet day updated.',
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const rows = await fetchMemberDiets();
                setDiets(rows);
                setSelectedDietId((current) => current ?? rows[0]?.id ?? null);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Failed to load diet plans', 'error');
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [showToast]);

    useEffect(() => {
        if (!selectedDietId) {
            setTracker(null);
            return;
        }
        const loadTracker = async () => {
            try {
                const payload = await fetchMemberDietTracker(selectedDietId, today);
                setTracker(payload);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Failed to load diet tracker', 'error');
            }
        };
        void loadTracker();
    }, [selectedDietId, today, showToast]);

    useEffect(() => {
        if (!tracker) return;
        setDayId((current) => current && tracker.days.some((day) => day.id === current) ? current : tracker.days[0]?.id ?? null);
        setDayNotes(tracker.tracking_day?.notes || '');
        setAdherenceRating(String(tracker.tracking_day?.adherence_rating || 3));
    }, [tracker]);

    const selectedDay = tracker?.days.find((day) => day.id === dayId) ?? tracker?.days[0] ?? null;

    const updateMeal = async (mealId: string, completed: boolean, note?: string | null) => {
        if (!tracker) return;
        setBusyMealId(mealId);
        try {
            const meals = selectedDay?.meals.map((meal) => ({
                meal_id: meal.id,
                completed: meal.id === mealId ? completed : meal.completed,
                note: meal.id === mealId ? note || null : meal.note || null,
            })) || [];
            const updated = await updateMemberDietTracker(tracker.plan_id, {
                tracked_for: today,
                adherence_rating: Number(adherenceRating),
                notes: dayNotes || null,
                meals,
            });
            setTracker(updated);
            showToast(txt.saved, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to update meal', 'error');
        } finally {
            setBusyMealId(null);
        }
    };

    const saveDay = async () => {
        if (!tracker) return;
        try {
            const updated = await updateMemberDietTracker(tracker.plan_id, {
                tracked_for: today,
                adherence_rating: Number(adherenceRating),
                notes: dayNotes || null,
                meals: selectedDay?.meals.map((meal) => ({
                    meal_id: meal.id,
                    completed: meal.completed,
                    note: meal.note || null,
                })) || [],
            });
            setTracker(updated);
            showToast(txt.saved, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to save diet day', 'error');
        }
    };

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{txt.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{txt.subtitle}</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="kpi-card p-5 space-y-3">
                    <p className="section-chip">{txt.diets}</p>
                    {diets.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">{txt.noDiets}</div>
                    ) : (
                        diets.map((diet) => (
                            <button
                                key={diet.id}
                                type="button"
                                onClick={() => setSelectedDietId(diet.id)}
                                className={`w-full border p-4 text-left transition-colors ${selectedDietId === diet.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/10 hover:border-primary/50'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{diet.name}</p>
                                        <p className="text-xs text-muted-foreground">{diet.description || ' '}</p>
                                    </div>
                                    <Utensils size={16} className="text-primary" />
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div className="space-y-6">
                    {tracker ? (
                        <>
                            <div className="kpi-card p-5 space-y-4">
                                <div>
                                    <p className="section-chip">{tracker.plan_name}</p>
                                    <p className="mt-2 text-sm text-muted-foreground">{tracker.description || ''}</p>
                                </div>

                                {tracker.has_structured_content ? (
                                    <>
                                        <div className="flex flex-wrap gap-2">
                                            {tracker.days.map((day) => (
                                                <button
                                                    key={day.id}
                                                    type="button"
                                                    onClick={() => setDayId(day.id)}
                                                    className={`border px-3 py-1 text-xs ${day.id === dayId ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                                                >
                                                    {day.name}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                                            <div className="space-y-3">
                                                <p className="section-chip">{txt.meals}</p>
                                                {selectedDay?.meals.map((meal) => (
                                                    <div key={meal.id} className="border border-border bg-muted/10 p-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold text-foreground">{meal.name}</p>
                                                                <p className="text-xs text-muted-foreground">{meal.time_label || ''}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={busyMealId === meal.id}
                                                                onClick={() => updateMeal(meal.id, !meal.completed, meal.note)}
                                                                className={`inline-flex items-center gap-2 border px-3 py-1 text-xs ${meal.completed ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                                                            >
                                                                <CheckCircle2 size={14} />
                                                                {meal.completed ? 'Done' : 'Mark done'}
                                                            </button>
                                                        </div>
                                                        {meal.instructions ? <p className="mt-3 text-xs text-muted-foreground">{meal.instructions}</p> : null}
                                                        {meal.items.length > 0 ? (
                                                            <ul className="mt-3 space-y-1 text-sm text-foreground">
                                                                {meal.items.map((item) => (
                                                                    <li key={item.id}>
                                                                        {item.label}{item.quantity ? ` • ${item.quantity}` : ''}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="kpi-card p-4 space-y-3">
                                                <label className="space-y-1">
                                                    <span className="text-xs text-muted-foreground">{txt.adherence}</span>
                                                    <select value={adherenceRating} onChange={(event) => setAdherenceRating(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground">
                                                        {[1, 2, 3, 4, 5].map((value) => (
                                                            <option key={value} value={value}>{value}/5</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs text-muted-foreground">{txt.notes}</span>
                                                    <textarea value={dayNotes} onChange={(event) => setDayNotes(event.target.value)} className="min-h-32 w-full border border-border bg-background px-3 py-2 text-sm text-foreground" />
                                                </label>
                                                <button type="button" onClick={saveDay} className="btn-primary w-full px-4 py-2 text-sm">
                                                    {txt.saveDay}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="rounded-sm border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{txt.emptyStructured}</div>
                                        <div className="rounded-sm border border-border bg-muted/10 p-4">
                                            <p className="section-chip">{txt.legacy}</p>
                                            <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground">{tracker.legacy_content || ''}</pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
