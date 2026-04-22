'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Utensils } from 'lucide-react';

import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

import {
    completeMemberDietMeal,
    fetchMemberDiets,
    fetchMemberDietTracker,
    previousMemberDietMeal,
    skipMemberDietMeal,
    startMemberDietTrackingDay,
    updateMemberDietTracker,
} from '../_shared/customerData';
import type { MemberDiet, MemberDietTracker } from '../_shared/types';

export default function MemberDietsPage() {
    const { locale } = useLocale();
    const { showToast } = useFeedback();
    const [diets, setDiets] = useState<MemberDiet[]>([]);
    const [selectedDietId, setSelectedDietId] = useState<string | null>(null);
    const [tracker, setTracker] = useState<MemberDietTracker | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
    const [dayNotes, setDayNotes] = useState('');
    const [adherenceRating, setAdherenceRating] = useState('3');

    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const txt = locale === 'ar' ? {
        title: 'متتبع النظام الغذائي',
        subtitle: 'سجّل اليوم وجبة بوجبة بترتيب واضح مثل جلسة التمرين.',
        diets: 'الخطط المعينة',
        noDiets: 'لا توجد خطط غذائية معينة بعد.',
        meals: 'الوجبات',
        adherence: 'التزام اليوم',
        notes: 'ملاحظات اليوم',
        saveDay: 'حفظ اليوم',
        legacy: 'محتوى الخطة',
        emptyStructured: 'هذه الخطة لا تحتوي على أيام ووجبات منظمة بعد.',
        saved: 'تم تحديث اليوم الغذائي.',
        startDay: 'ابدأ اليوم',
        completeMeal: 'إنهاء الوجبة',
        skipMeal: 'تخطي الوجبة',
        previousMeal: 'الوجبة السابقة',
        currentMeal: 'الوجبة الحالية',
        allMealsDone: 'اكتملت كل وجبات هذا اليوم.',
        progress: 'التقدم',
        done: 'مكتملة',
        skipped: 'متخطاة',
        idle: 'بانتظار التسجيل',
        startFirst: 'ابدأ يومًا أولًا قبل تسجيل الوجبات.',
        actionFailed: 'تعذر تنفيذ الإجراء.',
    } : {
        title: 'Diet Tracker',
        subtitle: 'Track your day meal-by-meal in a guided flow like workouts.',
        diets: 'Assigned diets',
        noDiets: 'No diet plans assigned yet.',
        meals: 'Meals',
        adherence: 'Daily adherence',
        notes: 'Day notes',
        saveDay: 'Save day',
        legacy: 'Plan content',
        emptyStructured: 'This plan does not have structured days and meals yet.',
        saved: 'Diet day updated.',
        startDay: 'Start day',
        completeMeal: 'Complete meal',
        skipMeal: 'Skip meal',
        previousMeal: 'Previous meal',
        currentMeal: 'Current meal',
        allMealsDone: 'All meals for this day are complete.',
        progress: 'Progress',
        done: 'Completed',
        skipped: 'Skipped',
        idle: 'Waiting',
        startFirst: 'Start a day before logging meals.',
        actionFailed: 'Failed to process action.',
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
        setSelectedDayId((current) => {
            if (tracker.active_day_id) return tracker.active_day_id;
            if (current && tracker.days.some((day) => day.id === current)) return current;
            return tracker.days[0]?.id ?? null;
        });
        setDayNotes(tracker.tracking_day?.notes || '');
        setAdherenceRating(String(tracker.tracking_day?.adherence_rating || 3));
    }, [tracker]);

    const activeDay = tracker?.days.find((day) => day.id === (tracker.active_day_id || selectedDayId)) ?? null;
    const activeDayId = activeDay?.id || null;
    const currentMealIndex = tracker?.current_meal_index || 0;
    const currentMeal = activeDay && currentMealIndex < activeDay.meals.length ? activeDay.meals[currentMealIndex] : null;
    const completedCount = activeDay?.meals.filter((meal) => meal.completed || meal.skipped).length || 0;

    const refreshTracker = async () => {
        if (!selectedDietId) return;
        const payload = await fetchMemberDietTracker(selectedDietId, today);
        setTracker(payload);
    };

    const handleStartDay = async (dayId: string) => {
        if (!selectedDietId) return;
        setBusy(true);
        try {
            const updated = await startMemberDietTrackingDay(selectedDietId, { tracked_for: today, day_id: dayId });
            setTracker(updated);
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.actionFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleCompleteMeal = async () => {
        if (!selectedDietId || !activeDayId || !currentMeal) {
            showToast(txt.startFirst, 'error');
            return;
        }
        setBusy(true);
        try {
            const updated = await completeMemberDietMeal(selectedDietId, activeDayId, currentMeal.id, { tracked_for: today, note: currentMeal.note || null });
            setTracker(updated);
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.actionFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleSkipMeal = async () => {
        if (!selectedDietId || !activeDayId || !currentMeal) {
            showToast(txt.startFirst, 'error');
            return;
        }
        setBusy(true);
        try {
            const updated = await skipMemberDietMeal(selectedDietId, activeDayId, currentMeal.id, { tracked_for: today, note: currentMeal.note || null });
            setTracker(updated);
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.actionFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handlePreviousMeal = async () => {
        if (!selectedDietId || !activeDayId) {
            showToast(txt.startFirst, 'error');
            return;
        }
        setBusy(true);
        try {
            const updated = await previousMemberDietMeal(selectedDietId, activeDayId, { tracked_for: today });
            setTracker(updated);
        } catch (error) {
            showToast(error instanceof Error ? error.message : txt.actionFailed, 'error');
        } finally {
            setBusy(false);
        }
    };

    const saveDay = async () => {
        if (!tracker) return;
        try {
            const updated = await updateMemberDietTracker(tracker.plan_id, {
                tracked_for: today,
                adherence_rating: Number(adherenceRating),
                notes: dayNotes || null,
                meals: [],
            });
            setTracker(updated);
            showToast(txt.saved, 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to save diet day', 'error');
            await refreshTracker();
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
                                                onClick={() => setSelectedDayId(day.id)}
                                                className={`border px-3 py-1 text-xs ${day.id === selectedDayId ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                                            >
                                                {day.name}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={busy || !selectedDayId}
                                            onClick={() => selectedDayId && void handleStartDay(selectedDayId)}
                                            className="btn-primary px-3 py-1.5 text-xs"
                                        >
                                            {txt.startDay}
                                        </button>
                                        <span className="text-xs text-muted-foreground self-center">
                                            {txt.progress}: {completedCount}/{activeDay?.meals.length || 0}
                                        </span>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                                        <div className="space-y-3">
                                            <p className="section-chip">{txt.meals}</p>
                                            {currentMeal ? (
                                                <div className="border border-border bg-muted/10 p-4 space-y-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-foreground">{txt.currentMeal}: {currentMeal.name}</p>
                                                            <p className="text-xs text-muted-foreground">{currentMeal.time_label || ''}</p>
                                                        </div>
                                                        <CheckCircle2 size={16} className="text-primary" />
                                                    </div>
                                                    {currentMeal.instructions ? <p className="text-xs text-muted-foreground">{currentMeal.instructions}</p> : null}
                                                    {currentMeal.items.length > 0 ? (
                                                        <ul className="space-y-1 text-sm text-foreground">
                                                            {currentMeal.items.map((item) => (
                                                                <li key={item.id}>{item.label}{item.quantity ? ` • ${item.quantity}` : ''}</li>
                                                            ))}
                                                        </ul>
                                                    ) : null}
                                                    <div className="flex flex-wrap gap-2">
                                                        <button type="button" disabled={busy} onClick={handleCompleteMeal} className="btn-primary px-3 py-1.5 text-xs">{txt.completeMeal}</button>
                                                        <button type="button" disabled={busy} onClick={handleSkipMeal} className="border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary">{txt.skipMeal}</button>
                                                        <button type="button" disabled={busy} onClick={handlePreviousMeal} className="border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary">{txt.previousMeal}</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="rounded-sm border border-border bg-muted/10 p-4 text-sm text-muted-foreground">{txt.allMealsDone}</div>
                                            )}

                                            {activeDay?.meals.map((meal) => (
                                                <div key={meal.id} className="border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
                                                    <span>{meal.name}</span>
                                                    <span>
                                                        {meal.completed ? txt.done : meal.skipped ? txt.skipped : txt.idle}
                                                    </span>
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
                    ) : null}
                </div>
            </div>
        </div>
    );
}
