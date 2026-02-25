'use client';

interface PreviewSection {
    section_name: string;
    exercise_names: string[];
}

interface AssignPlanSummaryPanelProps {
    planName: string;
    status: string;
    statusBadgeClass: string;
    summaryLine: string;
    previewSections?: PreviewSection[];
    draftWarning?: string;
    archivedWarning?: string;
}

export default function AssignPlanSummaryPanel({
    planName,
    status,
    statusBadgeClass,
    summaryLine,
    previewSections = [],
    draftWarning,
    archivedWarning,
}: AssignPlanSummaryPanelProps) {
    return (
        <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{planName}</p>
                <span className={`badge ${statusBadgeClass}`}>{status}</span>
            </div>
            <p className="text-xs text-muted-foreground">{summaryLine}</p>
            {previewSections.length > 0 && (
                <div className="space-y-1">
                    {previewSections.map((section) => (
                        <p key={section.section_name} className="text-xs text-muted-foreground">
                            <span className="text-primary font-medium">{section.section_name}:</span> {section.exercise_names.join(', ')}
                        </p>
                    ))}
                </div>
            )}
            {draftWarning && <p className="text-xs text-yellow-400">{draftWarning}</p>}
            {archivedWarning && <p className="text-xs text-destructive">{archivedWarning}</p>}
        </div>
    );
}
