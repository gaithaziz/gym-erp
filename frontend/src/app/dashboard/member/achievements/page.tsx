'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Trophy, Flame, Star, Calendar, TrendingUp } from 'lucide-react';

interface Badge {
    id: string;
    badge_type: string;
    badge_name: string;
    badge_description: string;
    earned_at: string;
}

interface GamificationStats {
    total_visits: number;
    streak: {
        current_streak: number;
        best_streak: number;
        last_visit_date: string | null;
    };
    badges: Badge[];
}

// All possible badges the user can earn — used to show locked ones
const ALL_BADGES = [
    { type: 'STREAK_3', name: '🔥 3-Day Streak', desc: 'Visit 3 days in a row' },
    { type: 'STREAK_7', name: '🔥 Weekly Warrior', desc: 'Visit 7 days in a row' },
    { type: 'STREAK_14', name: '🔥 Fortnight Force', desc: 'Visit 14 days in a row' },
    { type: 'STREAK_30', name: '🔥 Monthly Machine', desc: 'Visit 30 days in a row' },
    { type: 'VISITS_10', name: '🏅 10 Club Visits', desc: 'Check in 10 times' },
    { type: 'VISITS_25', name: '🏅 25 Club Visits', desc: 'Check in 25 times' },
    { type: 'VISITS_50', name: '🏅 50 Club Visits', desc: 'Check in 50 times' },
    { type: 'VISITS_100', name: '🏅 100 Club', desc: 'Check in 100 times' },
    { type: 'VISITS_250', name: '🏅 250 Club Legend', desc: 'Check in 250 times' },
    { type: 'EARLY_BIRD', name: '🌅 Early Bird', desc: 'Check in before 7 AM' },
    { type: 'NIGHT_OWL', name: '🦉 Night Owl', desc: 'Check in after 9 PM' },
];

export default function AchievementsPage() {
    const [stats, setStats] = useState<GamificationStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await api.get('/gamification/stats');
                setStats(res.data.data);
            } catch {
                console.error('Failed to fetch gamification stats');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-muted/50 w-48" />
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/50" />)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-muted/50" />)}
                    </div>
                </div>
            </div>
        );
    }

    const earnedTypes = new Set(stats?.badges.map(b => b.badge_type) || []);

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Achievements</h1>
                <p className="text-sm text-muted-foreground mt-1">Your gym milestones and badges</p>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="kpi-card p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 border border-primary/20">
                            <Flame size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Current Streak</p>
                            <p className="text-2xl font-bold text-foreground font-mono">{stats?.streak.current_streak || 0} <span className="text-sm text-muted-foreground">days</span></p>
                        </div>
                    </div>
                </div>
                <div className="kpi-card p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20">
                            <TrendingUp size={20} className="text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Best Streak</p>
                            <p className="text-2xl font-bold text-foreground font-mono">{stats?.streak.best_streak || 0} <span className="text-sm text-muted-foreground">days</span></p>
                        </div>
                    </div>
                </div>
                <div className="kpi-card p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 border border-blue-500/20">
                            <Calendar size={20} className="text-blue-500" />
                        </div>
                        <div>
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Visits</p>
                            <p className="text-2xl font-bold text-foreground font-mono">{stats?.total_visits || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Badges Grid */}
            <div>
                <h2 className="text-lg font-bold text-foreground font-serif mb-4 flex items-center gap-2">
                    <Trophy size={18} className="text-primary" /> Badges
                    <span className="text-xs font-mono text-muted-foreground ml-2">
                        {earnedTypes.size}/{ALL_BADGES.length} unlocked
                    </span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {ALL_BADGES.map(badge => {
                        const earned = earnedTypes.has(badge.type);
                        const earnedBadge = stats?.badges.find(b => b.badge_type === badge.type);
                        return (
                            <div
                                key={badge.type}
                                className={`kpi-card p-4 text-center transition-all ${earned
                                        ? 'border-primary/50 bg-primary/5'
                                        : 'opacity-40 grayscale'
                                    }`}
                            >
                                <div className="text-3xl mb-2">{badge.name.split(' ')[0]}</div>
                                <p className="text-sm font-bold text-foreground font-mono">
                                    {badge.name.split(' ').slice(1).join(' ')}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">{badge.desc}</p>
                                {earned && earnedBadge && (
                                    <p className="text-[0.6rem] text-primary font-mono mt-2 flex items-center justify-center gap-1">
                                        <Star size={10} />
                                        {new Date(earnedBadge.earned_at).toLocaleDateString()}
                                    </p>
                                )}
                                {!earned && (
                                    <p className="text-[0.6rem] text-muted-foreground font-mono mt-2 uppercase">Locked</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
