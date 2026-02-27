'use client';

import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useLocale } from '@/context/LocaleContext';

interface DateRangePickerProps {
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
    className?: string;
}

export function DateRangePicker({
    date,
    setDate,
    className,
}: DateRangePickerProps) {
    const { direction, locale, formatDate } = useLocale();
    const [isOpen, setIsOpen] = React.useState(false);
    const pickerId = React.useId();
    const buttonId = `${pickerId}-button`;
    const popupId = `${pickerId}-popup`;

    React.useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    const fromLabel = date?.from ? formatDate(date.from, { month: 'short', day: '2-digit', year: 'numeric' }) : '';
    const toLabel = date?.to ? formatDate(date.to, { month: 'short', day: '2-digit', year: 'numeric' }) : '';

    return (
        <div className={`relative inline-block ${direction === 'rtl' ? 'text-right' : 'text-left'} ${className || ''}`}>
            <div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex justify-between w-full rounded-none border border-border shadow-sm px-4 py-2 bg-card text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-haspopup="dialog"
                    aria-controls={popupId}
                >
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {fromLabel} - {toLabel}
                                </>
                            ) : (
                                fromLabel
                            )
                        ) : (
                            <span>{locale === 'ar' ? 'اختر نطاق التاريخ' : 'Pick a date range'}</span>
                        )}
                    </span>
                </button>
            </div>

            {isOpen && (
                <div
                    id={popupId}
                    className={`absolute z-50 mt-2 w-auto rounded-none shadow-lg bg-card ring-1 ring-black ring-opacity-5 focus:outline-none border border-border p-2 ${direction === 'rtl' ? 'origin-top-left left-0' : 'origin-top-right right-0'}`}
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={buttonId}
                >
                    <DayPicker
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                        dir={direction}
                        styles={{
                            caption: { color: 'var(--foreground)', fontFamily: 'var(--font-serif)' },
                            head_cell: { color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' },
                            day: { fontFamily: 'var(--font-sans)', borderRadius: '0px' },
                            nav_button: { color: 'var(--foreground)' },
                        }}
                        modifiersClassNames={{
                            selected: 'bg-primary text-primary-foreground rounded-none',
                            range_start: 'bg-primary text-primary-foreground rounded-none',
                            range_middle: 'bg-primary/20 text-foreground rounded-none',
                            range_end: 'bg-primary text-primary-foreground rounded-none',
                            today: 'font-bold text-primary',
                        }}
                    />
                </div>
            )}
            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}
        </div>
    );
}
