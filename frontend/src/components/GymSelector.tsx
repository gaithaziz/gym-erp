'use client';

import * as React from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

interface GymOption {
    id: string;
    name: string;
    slug: string;
}

interface GymSelectorProps {
    gyms: GymOption[];
    selectedGymId: string;
    onSelect: (id: string) => void;
    className?: string;
}

export function GymSelector({
    gyms,
    selectedGymId,
    onSelect,
    className,
}: GymSelectorProps) {
    const { direction, locale } = useLocale();
    const [isOpen, setIsOpen] = React.useState(false);
    const selectorId = React.useId();
    const buttonId = `${selectorId}-button`;
    const popupId = `${selectorId}-popup`;

    const selectedGym = gyms.find((gym) => gym.id === selectedGymId);
    const label = selectedGym
        ? `${selectedGym.name} - ${selectedGym.slug}`
        : (locale === 'ar' ? 'اختر النادي' : 'Select Gym');

    React.useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    return (
        <div className={`relative inline-block ${direction === 'rtl' ? 'text-end' : 'text-start'} ${className || ''}`}>
            <button
                id={buttonId}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex h-[42px] min-w-[210px] items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-controls={popupId}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 shrink-0 text-orange-500" />
                    <span className="truncate max-w-[150px]">{label}</span>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div
                        id={popupId}
                        className={`absolute z-50 mt-2 w-72 overflow-hidden rounded-none border border-border bg-card shadow-xl ring-1 ring-black ring-opacity-5 ${direction === 'rtl' ? 'left-0' : 'right-0'}`}
                        role="listbox"
                    >
                        <div className="py-1">
                            {gyms.map((gym) => {
                                const gymLabel = `${gym.name} - ${gym.slug}`;
                                return (
                                    <button
                                        key={gym.id}
                                        type="button"
                                        onClick={() => { onSelect(gym.id); setIsOpen(false); }}
                                        className={`flex w-full items-center justify-between px-4 py-2.5 text-xs font-mono uppercase tracking-tight transition-colors ${selectedGymId === gym.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}
                                        role="option"
                                        aria-selected={selectedGymId === gym.id}
                                    >
                                        <span className="truncate">{gymLabel}</span>
                                        {selectedGymId === gym.id ? <Check className="h-3.5 w-3.5" /> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                </>
            )}
        </div>
    );
}
