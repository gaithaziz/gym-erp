export interface MemberPlanExercise {
    id?: string;
    exercise_id?: string;
    exercise_name?: string;
    section_name?: string;
    name?: string;
    sets: number;
    reps: number;
    duration_minutes?: number | null;
    order?: number;
    video_type?: string | null;
    video_url?: string | null;
    uploaded_video_url?: string | null;
    video_provider?: string | null;
    video_id?: string | null;
    embed_url?: string | null;
    playback_type?: string | null;
    exercise?: { name: string };
}

export interface MemberPlan {
    id: string;
    name: string;
    description?: string;
    member_id?: string | null;
    exercises?: MemberPlanExercise[];
}

export interface MemberDiet {
    id: string;
    name: string;
    description?: string;
    content: string;
    content_structured?: {
        days?: Array<{
            id?: string;
            name?: string;
            meals?: Array<{
                id?: string;
                name?: string;
                time_label?: string | null;
                instructions?: string | null;
                items?: Array<{
                    id?: string;
                    label?: string;
                    quantity?: string | null;
                    notes?: string | null;
                }>;
            }>;
        }>;
    } | Array<unknown> | null;
    member_id?: string | null;
}

export interface MemberBadge {
    id: string;
    badge_type: string;
    badge_name: string;
    badge_description: string;
    earned_at: string;
}

export interface GamificationStats {
    total_visits: number;
    streak: {
        current_streak: number;
        best_streak: number;
        last_visit_date: string | null;
    };
    badges: MemberBadge[];
    weekly_progress?: {
        current: number;
        goal: number;
    };
}

export interface BiometricLogResponse {
    id: string;
    date: string;
    weight_kg?: number;
    height_cm?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
}

export interface WorkoutSetDetail {
    set: number;
    reps: number;
    weightKg?: number | null;
}

export type WorkoutEffortFeedback = 'TOO_EASY' | 'JUST_RIGHT' | 'TOO_HARD';

export interface WorkoutSessionEntry {
    id?: string;
    exercise_id?: string | null;
    exercise_name?: string | null;
    target_sets?: number | null;
    target_reps?: number | null;
    sets_completed: number;
    reps_completed: number;
    weight_kg?: number | null;
    notes?: string | null;
    is_pr?: boolean;
    pr_type?: string | null;
    pr_value?: string | null;
    pr_notes?: string | null;
    skipped?: boolean;
    set_details?: WorkoutSetDetail[];
    order: number;
}

export interface WorkoutSessionLog {
    id: string;
    member_id: string;
    plan_id: string;
    performed_at: string;
    duration_minutes?: number | null;
    notes?: string | null;
    rpe?: number | null;
    pain_level?: number | null;
    effort_feedback?: WorkoutEffortFeedback | null;
    attachment_url?: string | null;
    attachment_mime?: string | null;
    attachment_size_bytes?: number | null;
    review_status?: string;
    reviewed_at?: string | null;
    reviewed_by_user_id?: string | null;
    reviewer_note?: string | null;
    entries: WorkoutSessionEntry[];
}

export interface WorkoutSessionDraftEntry extends WorkoutSessionEntry {
    id: string;
    workout_exercise_id?: string | null;
    section_name?: string | null;
    target_duration_minutes?: number | null;
    video_type?: string | null;
    video_url?: string | null;
    uploaded_video_url?: string | null;
    video_provider?: string | null;
    video_id?: string | null;
    embed_url?: string | null;
    playback_type?: string | null;
    skipped: boolean;
    completed_at?: string | null;
}

export interface WorkoutSessionDraft {
    id: string;
    member_id: string;
    plan_id: string;
    section_name?: string | null;
    current_exercise_index: number;
    started_at: string;
    updated_at: string;
    notes?: string | null;
    entries: WorkoutSessionDraftEntry[];
}

export interface MemberDietTrackingMeal {
    id: string;
    name: string;
    completed: boolean;
    note?: string | null;
}

export interface MemberDietTrackingDay {
    id: string;
    tracked_for: string;
    adherence_rating?: number | null;
    notes?: string | null;
    meals: MemberDietTrackingMeal[];
}

export interface MemberDietTrackerMeal {
    id: string;
    name: string;
    completed: boolean;
    note?: string | null;
    time_label?: string | null;
    instructions?: string | null;
    items: Array<{
        id: string;
        label: string;
        quantity?: string | null;
        notes?: string | null;
    }>;
}

export interface MemberDietTrackerDay {
    id: string;
    name: string;
    meals: MemberDietTrackerMeal[];
}

export interface MemberDietTracker {
    plan_id: string;
    plan_name: string;
    description?: string | null;
    has_structured_content: boolean;
    legacy_content?: string | null;
    days: MemberDietTrackerDay[];
    tracking_day?: MemberDietTrackingDay | null;
}
