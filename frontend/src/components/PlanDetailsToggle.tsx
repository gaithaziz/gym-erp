'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';

interface PlanDetailsToggleProps {
    expanded: boolean;
    onClick: () => void;
    size?: 'sm' | 'md';
}

export default function PlanDetailsToggle({ expanded, onClick, size = 'md' }: PlanDetailsToggleProps) {
    const iconSize = size === 'sm' ? 14 : 16;
    const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-primary ${textSize} font-medium hover:text-primary/80 transition-colors flex items-center gap-1`}
        >
            {expanded ? <ChevronUp size={iconSize} /> : <ChevronDown size={iconSize} />}
            {expanded ? 'Collapse' : 'View Details'}
        </button>
    );
}
