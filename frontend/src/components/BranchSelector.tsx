'use client';

import * as React from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

interface Branch {
    id: string;
    name: string;
    gym_id?: string;
    display_name?: string | null;
    gym_name?: string;
}

interface BranchSelectorProps {
    branches: Branch[];
    selectedBranchId: string;
    onSelect: (id: string) => void;
    className?: string;
}

export function BranchSelector({
    branches,
    selectedBranchId,
    onSelect,
    className,
}: BranchSelectorProps) {
    const { direction, locale } = useLocale();
    const [isOpen, setIsOpen] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const selectorId = React.useId();
    const buttonId = `${selectorId}-button`;
    const popupId = `${selectorId}-popup`;

    const selectedBranch = branches.find(b => b.id === selectedBranchId);
    const selectedBranchLabel = selectedBranch
        ? [selectedBranch.display_name || selectedBranch.name, selectedBranch.gym_name].filter(Boolean).join(' - ')
        : null;
    const label = selectedBranchId === 'all' 
        ? (locale === 'ar' ? 'جميع الفروع' : 'All Branches')
        : (selectedBranchLabel || (locale === 'ar' ? 'فرع غير معروف' : 'Unknown Branch'));

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncViewport = () => setIsMobile(window.innerWidth < 768);
        syncViewport();
        window.addEventListener('resize', syncViewport);
        return () => window.removeEventListener('resize', syncViewport);
    }, []);

    React.useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    return (
        <div className={`relative block md:inline-block ${direction === 'rtl' ? 'text-end' : 'text-start'} ${className || ''}`}>
            <button
                type="button"
                id={buttonId}
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex w-full md:w-auto items-center justify-between gap-3 rounded-none border border-border shadow-sm px-4 py-2 bg-card text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono h-[42px] min-w-[160px]"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-controls={popupId}
            >
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-orange-500" />
                    <span className="truncate max-w-[180px] md:max-w-[120px]">{label}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div
                        id={popupId}
                        className={[
                            'z-50 rounded-none shadow-xl bg-card ring-1 ring-black ring-opacity-5 focus:outline-none border border-border overflow-hidden',
                            isMobile
                                ? 'fixed inset-x-4 bottom-4 max-h-[70vh] overflow-y-auto'
                                : `absolute mt-2 w-56 ${direction === 'rtl' ? 'left-0' : 'right-0'}`,
                        ].join(' ')}
                        role="listbox"
                    >
                        {isMobile && (
                            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                    {locale === 'ar' ? 'اختيار الفرع' : 'Select Branch'}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="text-xs font-mono uppercase tracking-tight text-muted-foreground hover:text-foreground"
                                >
                                    {locale === 'ar' ? 'إغلاق' : 'Close'}
                                </button>
                            </div>
                        )}
                        <div className="py-1">
                            <button
                                type="button"
                                onClick={() => { onSelect('all'); setIsOpen(false); }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono uppercase tracking-tight transition-colors ${selectedBranchId === 'all' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}
                                role="option"
                                aria-selected={selectedBranchId === 'all'}
                            >
                                <span>{locale === 'ar' ? 'جميع الفروع' : 'All Branches'}</span>
                                {selectedBranchId === 'all' && <Check className="w-3.5 h-3.5" />}
                            </button>
                            
                            {branches.map((branch) => {
                                const branchLabel = [branch.display_name || branch.name, branch.gym_name].filter(Boolean).join(' - ');
                                return (
                                <button
                                    type="button"
                                    key={branch.id}
                                    onClick={() => { onSelect(branch.id); setIsOpen(false); }}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono uppercase tracking-tight transition-colors ${selectedBranchId === branch.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}
                                    role="option"
                                    aria-selected={selectedBranchId === branch.id}
                                >
                                    <span className="truncate">{branchLabel}</span>
                                    {selectedBranchId === branch.id && <Check className="w-3.5 h-3.5" />}
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
