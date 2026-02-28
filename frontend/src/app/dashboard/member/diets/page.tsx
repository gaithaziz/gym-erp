'use client';

import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';

import PlanDetailsToggle from '@/components/PlanDetailsToggle';
import { useLocale } from '@/context/LocaleContext';

import { fetchMemberDiets } from '../_shared/customerData';
import type { MemberDiet } from '../_shared/types';

export default function MemberDietsPage() {
    const { locale } = useLocale();
    const [diets, setDiets] = useState<MemberDiet[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDietIds, setExpandedDietIds] = useState<Record<string, boolean>>({});

    const txt = locale === 'ar' ? {
        title: '\u062e\u0637\u0637\u064a \u0627\u0644\u063a\u0630\u0627\u0626\u064a\u0629',
        subtitle: '\u062e\u0637\u0637 \u063a\u0630\u0627\u0626\u064a\u0629 \u0645\u062e\u0635\u0635\u0629 \u0645\u0646 \u0645\u062f\u0631\u0628\u0643.',
        assignedDiets: '\u0627\u0644\u062e\u0637\u0637 \u0627\u0644\u0645\u0639\u064a\u0651\u0646\u0629',
        noDescription: '\u0628\u062f\u0648\u0646 \u0648\u0635\u0641',
        noAssignedTitle: '\u0644\u0627 \u062a\u0648\u062c\u062f \u062e\u0637\u0637 \u063a\u0630\u0627\u0626\u064a\u0629 \u0645\u062e\u0635\u0635\u0629 \u0628\u0639\u062f.',
        noAssignedHint: '\u0633\u064a\u0642\u0648\u0645 \u0645\u062f\u0631\u0628\u0643 \u0628\u0625\u0639\u062f\u0627\u062f \u0628\u0631\u0646\u0627\u0645\u062c \u063a\u0630\u0627\u0626\u064a \u0644\u0643.',
        viewDetails: '\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644',
        collapseDetails: '\u0637\u064a',
        previewLabel: '\u0645\u0639\u0627\u064a\u0646\u0629',
        moreLines: '\u0633\u0637\u0648\u0631 \u0625\u0636\u0627\u0641\u064a\u0629',
        emptyContent: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u062d\u062a\u0648\u0649 \u0644\u0647\u0630\u0647 \u0627\u0644\u062e\u0637\u0629 \u0628\u0639\u062f.',
    } : {
        title: 'My Diet Plans',
        subtitle: 'Nutrition plans assigned by your coach.',
        assignedDiets: 'Assigned Diets',
        noDescription: 'No description',
        noAssignedTitle: 'No diet plans assigned yet.',
        noAssignedHint: 'Your coach will create a nutrition program for you.',
        viewDetails: 'View Details',
        collapseDetails: 'Collapse',
        previewLabel: 'Preview',
        moreLines: 'more lines',
        emptyContent: 'No content added to this plan yet.',
    };

    const getDietContentLines = (content: string) => content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const renderCollapsedContent = (diet: MemberDiet) => {
        const lines = getDietContentLines(diet.content || '');
        if (lines.length === 0) {
            return (
                <div className="rounded-sm border border-dashed border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                    {txt.emptyContent}
                </div>
            );
        }

        const previewLines = lines.slice(0, 3);
        const remainingLineCount = Math.max(lines.length - previewLines.length, 0);

        return (
            <div className="relative rounded-sm border border-border bg-muted/20 px-3 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">{txt.previewLabel}</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                    {previewLines.map((line, index) => (
                        <p key={`${diet.id}-preview-${index}`} className="whitespace-pre-wrap break-words">
                            {line}
                        </p>
                    ))}
                </div>
                {remainingLineCount > 0 && (
                    <>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--card)] to-transparent" />
                        <p className="relative mt-3 text-xs text-muted-foreground">
                            +{remainingLineCount} {txt.moreLines}
                        </p>
                    </>
                )}
            </div>
        );
    };

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
                <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">
                    {txt.title}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {txt.subtitle}
                </p>
            </div>

            <div className="kpi-card p-6">
                <p className="section-chip mb-4">{txt.assignedDiets}</p>
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
                                        <p className="text-muted-foreground text-xs">{diet.description || txt.noDescription}</p>
                                    </div>
                                </div>

                                <div className="mt-3">
                                    {expandedDietIds[diet.id] ? (
                                        <div className="rounded-sm border border-border bg-muted/20 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                            {diet.content?.trim() || txt.emptyContent}
                                        </div>
                                    ) : renderCollapsedContent(diet)}
                                </div>

                                <div className="mt-3 border-t border-border pt-3">
                                    <PlanDetailsToggle
                                        expanded={!!expandedDietIds[diet.id]}
                                        onClick={() => setExpandedDietIds((prev) => ({
                                            ...prev,
                                            [diet.id]: !prev[diet.id],
                                        }))}
                                        expandLabel={txt.viewDetails}
                                        collapseLabel={txt.collapseDetails}
                                        size="sm"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                        <Utensils size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                        <p className="text-muted-foreground text-sm">{txt.noAssignedTitle}</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">{txt.noAssignedHint}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
