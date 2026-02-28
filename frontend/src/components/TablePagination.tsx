'use client';

import { useLocale } from '@/context/LocaleContext';

interface TablePaginationProps {
    page: number;
    totalPages: number;
    onPrevious: () => void;
    onNext: () => void;
    className?: string;
}

export default function TablePagination({
    page,
    totalPages,
    onPrevious,
    onNext,
    className = '',
}: TablePaginationProps) {
    const { locale } = useLocale();
    const txt = locale === 'ar'
        ? {
            page: 'الصفحة',
            of: 'من',
            previous: 'السابق',
            next: 'التالي',
        }
        : {
            page: 'Page',
            of: 'of',
            previous: 'Back',
            next: 'Next',
        };

    if (totalPages <= 1) return null;

    return (
        <div className={`flex items-center justify-between gap-3 px-4 py-3 border-t border-border ${className}`}>
            <span className="text-xs text-muted-foreground">
                {txt.page} {page} {txt.of} {totalPages}
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="btn-ghost !py-1.5 !px-3 text-xs disabled:opacity-40"
                    onClick={onPrevious}
                    disabled={page <= 1}
                >
                    {txt.previous}
                </button>
                <button
                    type="button"
                    className="btn-ghost !py-1.5 !px-3 text-xs disabled:opacity-40"
                    onClick={onNext}
                    disabled={page >= totalPages}
                >
                    {txt.next}
                </button>
            </div>
        </div>
    );
}
