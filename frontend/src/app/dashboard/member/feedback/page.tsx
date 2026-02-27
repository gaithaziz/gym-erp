'use client';

import { FormEvent, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useFeedback } from '@/components/FeedbackProvider';
import { fetchMemberDiets } from '../_shared/customerData';
import type { MemberDiet } from '../_shared/types';
import { useLocale } from '@/context/LocaleContext';

export default function MemberFeedbackPage() {
    const { locale } = useLocale();
    const { showToast } = useFeedback();
    const [diets, setDiets] = useState<MemberDiet[]>([]);
    const [loadingDiets, setLoadingDiets] = useState(true);
    const [dietPlanId, setDietPlanId] = useState('');
    const [dietRating, setDietRating] = useState(5);
    const [dietComment, setDietComment] = useState('');
    const [gymCategory, setGymCategory] = useState('GENERAL');
    const [gymRating, setGymRating] = useState(5);
    const [gymComment, setGymComment] = useState('');
    const [submittingDiet, setSubmittingDiet] = useState(false);
    const [submittingGym, setSubmittingGym] = useState(false);

    useEffect(() => {
        const loadDiets = async () => {
            setLoadingDiets(true);
            const data = await fetchMemberDiets();
            setDiets(data);
            setDietPlanId(data[0]?.id || '');
            setLoadingDiets(false);
        };
        loadDiets();
    }, []);

    const submitDietFeedback = async (e: FormEvent) => {
        e.preventDefault();
        setSubmittingDiet(true);
        try {
            await api.post('/fitness/diet-feedback', {
                diet_plan_id: dietPlanId,
                rating: dietRating,
                comment: dietComment || null,
            });
            setDietComment('');
            showToast(locale === 'ar' ? 'تم إرسال ملاحظات التغذية' : 'Diet feedback submitted', 'success');
        } catch {
            showToast(locale === 'ar' ? 'فشل إرسال ملاحظات التغذية' : 'Failed to submit diet feedback', 'error');
        } finally {
            setSubmittingDiet(false);
        }
    };

    const submitGymFeedback = async (e: FormEvent) => {
        e.preventDefault();
        setSubmittingGym(true);
        try {
            await api.post('/fitness/gym-feedback', {
                category: gymCategory,
                rating: gymRating,
                comment: gymComment || null,
            });
            setGymComment('');
            showToast(locale === 'ar' ? 'تم إرسال ملاحظات النادي' : 'Gym feedback submitted', 'success');
        } catch {
            showToast(locale === 'ar' ? 'فشل إرسال ملاحظات النادي' : 'Failed to submit gym feedback', 'error');
        } finally {
            setSubmittingGym(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">{locale === 'ar' ? 'ملاحظاتي' : 'My Feedback'}</h1>
                <p className="text-sm text-muted-foreground mt-1">{locale === 'ar' ? 'أرسل ملاحظاتك حول التغذية وتجربة النادي.' : 'Submit feedback for diet and overall gym experience.'}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form className="kpi-card p-5 space-y-3" onSubmit={submitDietFeedback}>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{locale === 'ar' ? 'ملاحظات التغذية' : 'Diet Feedback'}</h2>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{locale === 'ar' ? 'خطة التغذية' : 'Diet Plan'}</label>
                        <select
                            value={dietPlanId}
                            onChange={(e) => setDietPlanId(e.target.value)}
                            className="input-dark"
                            required
                            disabled={loadingDiets || diets.length === 0}
                        >
                            {loadingDiets && <option value="">{locale === 'ar' ? 'جارٍ تحميل الخطط الغذائية...' : 'Loading assigned diets...'}</option>}
                            {!loadingDiets && diets.length === 0 && <option value="">{locale === 'ar' ? 'لا توجد خطط غذائية مخصصة' : 'No assigned diet plans'}</option>}
                            {diets.map((diet) => (
                                <option key={diet.id} value={diet.id}>
                                    {diet.name}
                                </option>
                            ))}
                        </select>
                        {!loadingDiets && diets.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">{locale === 'ar' ? 'لا توجد خطط غذائية مخصصة. اطلب من مدربك تعيين خطة أولاً.' : 'No assigned diets found. Ask your coach to assign one first.'}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{locale === 'ar' ? 'التقييم (1-5)' : 'Rating (1-5)'}</label>
                        <input type="number" min={1} max={5} value={dietRating} onChange={(e) => setDietRating(Number(e.target.value))} className="input-dark" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{locale === 'ar' ? 'تعليق' : 'Comment'}</label>
                        <textarea value={dietComment} onChange={(e) => setDietComment(e.target.value)} className="input-dark min-h-20" />
                    </div>
                    <button type="submit" className="btn-primary" disabled={submittingDiet || loadingDiets || diets.length === 0}>{submittingDiet ? (locale === 'ar' ? 'جارٍ الإرسال...' : 'Submitting...') : (locale === 'ar' ? 'إرسال ملاحظات التغذية' : 'Submit Diet Feedback')}</button>
                </form>

                <form className="kpi-card p-5 space-y-3" onSubmit={submitGymFeedback}>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{locale === 'ar' ? 'ملاحظات النادي' : 'Gym Feedback'}</h2>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{locale === 'ar' ? 'الفئة' : 'Category'}</label>
                        <select value={gymCategory} onChange={(e) => setGymCategory(e.target.value)} className="input-dark">
                            <option value="GENERAL">{locale === 'ar' ? 'عام' : 'General'}</option>
                            <option value="EQUIPMENT">{locale === 'ar' ? 'المعدات' : 'Equipment'}</option>
                            <option value="CLEANLINESS">{locale === 'ar' ? 'النظافة' : 'Cleanliness'}</option>
                            <option value="STAFF">{locale === 'ar' ? 'الطاقم' : 'Staff'}</option>
                            <option value="CLASSES">{locale === 'ar' ? 'الحصص' : 'Classes'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{locale === 'ar' ? 'التقييم (1-5)' : 'Rating (1-5)'}</label>
                        <input type="number" min={1} max={5} value={gymRating} onChange={(e) => setGymRating(Number(e.target.value))} className="input-dark" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{locale === 'ar' ? 'تعليق' : 'Comment'}</label>
                        <textarea value={gymComment} onChange={(e) => setGymComment(e.target.value)} className="input-dark min-h-20" />
                    </div>
                    <button type="submit" className="btn-primary" disabled={submittingGym}>{submittingGym ? (locale === 'ar' ? 'جارٍ الإرسال...' : 'Submitting...') : (locale === 'ar' ? 'إرسال ملاحظات النادي' : 'Submit Gym Feedback')}</button>
                </form>
            </div>
        </div>
    );
}
