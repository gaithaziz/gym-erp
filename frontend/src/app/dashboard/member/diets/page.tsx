'use client';

import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';

import { fetchMemberDiets } from '../_shared/customerData';
import type { MemberDiet } from '../_shared/types';

export default function MemberDietsPage() {
    const [diets, setDiets] = useState<MemberDiet[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setDiets(await fetchMemberDiets());
            setLoading(false);
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">My Diet Plans</h1>
                <p className="text-sm text-muted-foreground mt-1">Nutrition plans assigned by your coach.</p>
            </div>

            <div className="kpi-card p-6">
                <p className="section-chip mb-4">Assigned Diets</p>
                {diets.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {diets.map((diet) => (
                            <div key={diet.id} className="p-4 border border-border bg-muted/10 hover:border-primary transition-colors">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-muted/30 border border-border text-primary">
                                        <Utensils size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-foreground font-bold text-sm uppercase">{diet.name}</h3>
                                        <p className="text-muted-foreground text-xs">{diet.description || 'No description'}</p>
                                    </div>
                                </div>
                                <div className="bg-muted/20 p-3 text-xs text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                                    {diet.content}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                        <Utensils size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">No diet plans assigned yet.</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">Your coach will create a nutrition program for you.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
