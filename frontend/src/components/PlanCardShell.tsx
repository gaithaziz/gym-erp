'use client';

interface PlanCardShellProps {
    header: React.ReactNode;
    body: React.ReactNode;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
}

export default function PlanCardShell({ header, body, actions, footer, className = '' }: PlanCardShellProps) {
    return (
        <div className={`kpi-card group ${className}`}>
            <div>{header}</div>
            <div className="mt-3">{body}</div>
            {actions && <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>}
            {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
        </div>
    );
}
