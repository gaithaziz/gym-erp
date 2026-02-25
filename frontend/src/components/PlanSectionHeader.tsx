'use client';

interface PlanSectionHeaderProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
}

export default function PlanSectionHeader({ title, subtitle, actions }: PlanSectionHeaderProps) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
                {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}
