'use client';

import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker, DateRange } from 'react-day-picker';
import { arSA, enUS } from 'react-day-picker/locale';
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
    const dialogRole = 'dialog';
    const rangeMode = 'range' as const;
    const dateRangePlaceholder = locale === 'ar' ? '\u0627\u062e\u062a\u0631 \u0646\u0637\u0627\u0642 \u0627\u0644\u062a\u0627\u0631\u064a\u062e' : 'Pick a date range';
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const popupRef = React.useRef<HTMLDivElement | null>(null);
    const calendarLocale = locale === 'ar' ? arSA : enUS;
    const displayMonths = 2;

    const handleClose = React.useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleSelect = React.useCallback((nextDate: DateRange | undefined) => {
        setDate(nextDate);

        if (nextDate?.from && nextDate?.to) {
            setIsOpen(false);
        }
    }, [setDate]);

    React.useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [handleClose, isOpen]);

    React.useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node | null;
            if (!target) return;

            if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) {
                return;
            }

            handleClose();
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
        };
    }, [handleClose, isOpen]);

    const fromLabel = date?.from ? formatDate(date.from, { month: 'short', day: '2-digit', year: 'numeric' }) : '';
    const toLabel = date?.to ? formatDate(date.to, { month: 'short', day: '2-digit', year: 'numeric' }) : '';
    const pickerStyle = {
        '--rdp-accent-color': 'var(--primary)',
        '--rdp-accent-background-color': 'rgba(255, 107, 0, 0.14)',
        '--rdp-day-width': '2.7rem',
        '--rdp-day-height': '2.7rem',
        '--rdp-day_button-width': '2.45rem',
        '--rdp-day_button-height': '2.45rem',
        '--rdp-day_button-border': '0px solid transparent',
        '--rdp-day_button-border-radius': '0.75rem',
        '--rdp-selected-border': '0px solid transparent',
        '--rdp-nav_button-width': '2rem',
        '--rdp-nav_button-height': '2rem',
        '--rdp-nav-height': '2.5rem',
        '--rdp-months-gap': '1.5rem',
        '--rdp-disabled-opacity': '0.28',
        '--rdp-outside-opacity': '0.25',
        '--rdp-today-color': 'var(--foreground)',
        width: '100%',
        color: 'var(--foreground)',
    } as React.CSSProperties;

    return (
        <div className={`relative inline-block ${direction === 'rtl' ? 'text-end' : 'text-start'} ${className || ''}`}>
            <div>
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    className="inline-flex min-w-[17rem] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition hover:border-primary/40 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-haspopup={dialogRole}
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
                            <span>{dateRangePlaceholder}</span>
                        )}
                    </span>
                </button>
            </div>

            {isOpen && (
                <div
                    ref={popupRef}
                    id={popupId}
                    className={`absolute top-[calc(100%+0.75rem)] z-[90] w-[21rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] overflow-x-hidden overflow-y-auto rounded-[1.25rem] border border-white/10 bg-card p-3 shadow-[0_24px_64px_rgba(0,0,0,0.5)] focus:outline-none ${direction === 'rtl' ? 'right-0' : 'left-0'}`}
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={buttonId}
                >
                    <DayPicker
                        mode={rangeMode}
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={handleSelect}
                        numberOfMonths={displayMonths}
                        navLayout="after"
                        autoFocus
                        dir={direction}
                        locale={calendarLocale}
                        style={pickerStyle}
                        styles={{
                            root: { width: '100%' },
                            months: {
                                display: 'flex',
                                flexDirection: 'column',
                                flexWrap: 'nowrap',
                                gap: '1.75rem',
                                width: '100%',
                            },
                            month: { width: '100%' },
                            month_grid: {
                                width: '100%',
                                borderCollapse: 'separate',
                                borderSpacing: '0 0.25rem',
                            },
                            month_caption: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                minHeight: '2.5rem',
                                marginBottom: '0.5rem',
                                paddingInlineStart: '3.3rem',
                                paddingInlineEnd: '0.2rem',
                            },
                            caption_label: {
                                color: 'var(--foreground)',
                                fontFamily: 'var(--font-serif)',
                                fontSize: '1.05rem',
                                fontWeight: '700',
                            },
                            nav: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                height: '2.5rem',
                            },
                            button_previous: {
                                color: '#1d4ed8',
                                borderRadius: '9999px',
                            },
                            button_next: {
                                color: '#1d4ed8',
                                borderRadius: '9999px',
                            },
                            chevron: {
                                fill: 'currentColor',
                            },
                            weekdays: {
                                marginBottom: '0.15rem',
                            },
                            weekday: {
                                color: 'var(--muted-foreground)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                letterSpacing: '0.16em',
                                opacity: 0.9,
                                padding: '0.35rem 0',
                                textTransform: 'uppercase',
                            },
                            day: { fontFamily: 'var(--font-sans)' },
                            day_button: {
                                fontFamily: 'var(--font-sans)',
                                fontSize: '0.95rem',
                                fontWeight: '600',
                                transition: 'background-color 160ms ease, color 160ms ease, transform 160ms ease',
                            },
                        }}
                        modifiersClassNames={{
                            selected: '!bg-primary !text-[#121416] rounded-xl font-bold',
                            range_start: '!bg-primary !text-[#121416] rounded-xl font-bold',
                            range_middle: '!bg-[#6b4223]/78 !text-[#23150d] rounded-none',
                            range_end: '!bg-primary !text-[#121416] rounded-xl font-bold',
                            today: 'font-bold text-foreground',
                        }}
                    />
                </div>
            )}
        </div>
    );
}

