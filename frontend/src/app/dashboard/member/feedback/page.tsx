'use client';

import { FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useFeedback } from '@/components/FeedbackProvider';

export default function MemberFeedbackPage() {
    const { showToast } = useFeedback();
    const [dietPlanId, setDietPlanId] = useState('');
    const [dietRating, setDietRating] = useState(5);
    const [dietComment, setDietComment] = useState('');
    const [gymCategory, setGymCategory] = useState('GENERAL');
    const [gymRating, setGymRating] = useState(5);
    const [gymComment, setGymComment] = useState('');
    const [submittingDiet, setSubmittingDiet] = useState(false);
    const [submittingGym, setSubmittingGym] = useState(false);

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
            showToast('Diet feedback submitted', 'success');
        } catch {
            showToast('Failed to submit diet feedback', 'error');
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
            showToast('Gym feedback submitted', 'success');
        } catch {
            showToast('Failed to submit gym feedback', 'error');
        } finally {
            setSubmittingGym(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">My Feedback</h1>
                <p className="text-sm text-muted-foreground mt-1">Submit feedback for diet and overall gym experience.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form className="kpi-card p-5 space-y-3" onSubmit={submitDietFeedback}>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Diet Feedback</h2>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Diet Plan ID</label>
                        <input value={dietPlanId} onChange={(e) => setDietPlanId(e.target.value)} className="input-dark" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rating (1-5)</label>
                        <input type="number" min={1} max={5} value={dietRating} onChange={(e) => setDietRating(Number(e.target.value))} className="input-dark" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Comment</label>
                        <textarea value={dietComment} onChange={(e) => setDietComment(e.target.value)} className="input-dark min-h-20" />
                    </div>
                    <button type="submit" className="btn-primary" disabled={submittingDiet}>{submittingDiet ? 'Submitting...' : 'Submit Diet Feedback'}</button>
                </form>

                <form className="kpi-card p-5 space-y-3" onSubmit={submitGymFeedback}>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Gym Feedback</h2>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                        <select value={gymCategory} onChange={(e) => setGymCategory(e.target.value)} className="input-dark">
                            <option value="GENERAL">General</option>
                            <option value="EQUIPMENT">Equipment</option>
                            <option value="CLEANLINESS">Cleanliness</option>
                            <option value="STAFF">Staff</option>
                            <option value="CLASSES">Classes</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rating (1-5)</label>
                        <input type="number" min={1} max={5} value={gymRating} onChange={(e) => setGymRating(Number(e.target.value))} className="input-dark" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Comment</label>
                        <textarea value={gymComment} onChange={(e) => setGymComment(e.target.value)} className="input-dark min-h-20" />
                    </div>
                    <button type="submit" className="btn-primary" disabled={submittingGym}>{submittingGym ? 'Submitting...' : 'Submit Gym Feedback'}</button>
                </form>
            </div>
        </div>
    );
}
