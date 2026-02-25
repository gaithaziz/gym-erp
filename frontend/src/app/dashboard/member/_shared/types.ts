export interface MemberPlanExercise {
    id?: string;
    exercise_id?: string;
    exercise_name?: string;
    section_name?: string;
    name: string;
    sets: number;
    reps: number;
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
    order: number;
}

export interface WorkoutSessionLog {
    id: string;
    member_id: string;
    plan_id: string;
    performed_at: string;
    duration_minutes?: number | null;
    notes?: string | null;
    entries: WorkoutSessionEntry[];
}
