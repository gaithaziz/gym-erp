'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { useLocale } from '@/context/LocaleContext';

type MonthDay = {
    date: Date;
    inMonth: boolean;
};

function normalizeDate(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addMonths(value: Date, delta: number) {
    return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function startOfMonth(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
    return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function startOfWeek(value: Date) {
    const next = new Date(value);
    next.setDate(next.getDate() - next.getDay());
    return normalizeDate(next);
}

function endOfWeek(value: Date) {
    const next = new Date(value);
    next.setDate(next.getDate() + (6 - next.getDay()));
    return normalizeDate(next);
}

function sameDay(left: Date, right: Date) {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function isInRange(day: Date, from: Date, to: Date) {
    const current = normalizeDate(day).getTime();
    return current >= normalizeDate(from).getTime() && current <= normalizeDate(to).getTime();
}

function buildMonthWeeks(month: Date, direction: 'ltr' | 'rtl') {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    const days: Date[] = [];

    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
        days.push(new Date(cursor));
    }

    const weeks: MonthDay[][] = [];
    for (let index = 0; index < days.length; index += 7) {
        const slice = days.slice(index, index + 7).map((date) => ({
            date,
            inMonth: date.getMonth() === month.getMonth(),
        }));

        weeks.push(direction === 'rtl' ? slice.reverse() : slice);
    }

    return weeks;
}

function compareDates(left: Date, right: Date) {
    return normalizeDate(left).getTime() - normalizeDate(right).getTime();
}

function resolveNextRange(current: DateRange | undefined, selectedDay: Date): DateRange {
    const day = normalizeDate(selectedDay);

    if (!current?.from || current.to) {
        return { from: day, to: undefined };
    }

    const from = normalizeDate(current.from);
    const comparison = compareDates(day, from);

    if (comparison < 0) {
        return { from: day, to: from };
    }

    if (comparison === 0) {
        return { from, to: from };
    }

    return { from, to: day };
}

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
    const [displayMonth, setDisplayMonth] = React.useState(() => startOfMonth(date?.from ?? new Date()));
    const pickerId = React.useId();
    const buttonId = `${pickerId}-button`;
    const popupId = `${pickerId}-popup`;
    const dialogRole = 'dialog';
    const dateRangePlaceholder = locale === 'ar' ? '\u0627\u062e\u062a\u0631 \u0646\u0637\u0627\u0642 \u0627\u0644\u062a\u0627\u0631\u064a\u062e' : 'Pick a date range';
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const popupRef = React.useRef<HTMLDivElement | null>(null);
    const monthTitleFormatter = React.useMemo(
        () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
        [locale],
    );
    const weekdayFormatter = React.useMemo(
        () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
        [locale],
    );
    const today = React.useMemo(() => normalizeDate(new Date()), []);
    const months = React.useMemo(() => [displayMonth, addMonths(displayMonth, 1)], [displayMonth]);

    const handleClose = React.useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleSelect = React.useCallback((nextDate: DateRange | undefined) => {
        setDate(nextDate);

        if (nextDate?.from && nextDate?.to) {
            setIsOpen(false);
        }
    }, [setDate]);

    const handleDaySelect = React.useCallback((day: Date) => {
        const nextRange = resolveNextRange(date, day);
        setDate(nextRange);

        if (nextRange.from && nextRange.to) {
            setIsOpen(false);
        }
    }, [date, setDate]);

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

    React.useEffect(() => {
        if (!isOpen) return;
        setDisplayMonth(startOfMonth(date?.from ?? new Date()));
    }, [date?.from, isOpen]);

    const fromLabel = date?.from ? formatDate(date.from, { month: 'short', day: '2-digit', year: 'numeric' }) : '';
    const toLabel = date?.to ? formatDate(date.to, { month: 'short', day: '2-digit', year: 'numeric' }) : '';
    const weekdayBase = React.useMemo(() => {
        const referenceSunday = new Date(2026, 0, 4);
        const labels = Array.from({ length: 7 }, (_, index) => {
            const value = new Date(referenceSunday);
            value.setDate(referenceSunday.getDate() + index);
            const raw = weekdayFormatter.format(value);
            return locale === 'ar' ? raw : raw.slice(0, 2);
        });

        return direction === 'rtl' ? labels.reverse() : labels;
    }, [direction, locale, weekdayFormatter]);

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
                    className={`absolute top-[calc(100%+0.75rem)] z-[90] w-[21rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] overflow-x-hidden overflow-y-auto rounded-[1.25rem] border border-white/10 p-3 shadow-[0_24px_64px_rgba(0,0,0,0.5)] focus:outline-none ${direction === 'rtl' ? 'right-0' : 'left-0'}`}
                    style={{ backgroundColor: '#111820' }}
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={buttonId}
                >
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
                                className="flex h-8 w-8 items-center justify-center rounded-full"
                                aria-label={locale === 'ar' ? 'الشهر السابق' : 'Previous month'}
                            >
                                <ChevronLeft className="h-4 w-4 text-blue-700" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
                                className="flex h-8 w-8 items-center justify-center rounded-full"
                                aria-label={locale === 'ar' ? 'الشهر التالي' : 'Next month'}
                            >
                                <ChevronRight className="h-4 w-4 text-blue-700" />
                            </button>
                        </div>
                        <p className="text-xs" style={{ color: '#f4ece2', fontFamily: 'var(--font-sans)' }}>
                            {`${monthTitleFormatter.format(months[0])} • ${monthTitleFormatter.format(months[1])}`}
                        </p>
                    </div>

                    {months.map((month, index) => {
                        const weeks = buildMonthWeeks(month, direction);

                        return (
                            <div key={`${month.getFullYear()}-${month.getMonth()}`} style={{ marginTop: index === 0 ? 0 : '1.125rem' }}>
                                <p
                                    className="mb-3 text-[1.05rem] font-bold"
                                    style={{
                                        color: '#f4ece2',
                                        fontFamily: 'var(--font-serif)',
                                        textAlign: direction === 'rtl' ? 'right' : 'left',
                                    }}
                                >
                                    {monthTitleFormatter.format(month)}
                                </p>

                                <div className="mb-2 grid grid-cols-7 gap-0">
                                    {weekdayBase.map((label, labelIndex) => (
                                        <div key={`${label}-${labelIndex}`} className="flex items-center justify-center py-1">
                                            <span
                                                className="text-[0.72rem] font-bold"
                                                style={{
                                                    color: '#8fa0b2',
                                                    fontFamily: 'var(--font-mono)',
                                                }}
                                            >
                                                {label}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-0">
                                    {weeks.map((week, weekIndex) => (
                                        <div key={`${month.getMonth()}-${weekIndex}`} className="grid grid-cols-7 gap-0">
                                            {week.map(({ date: day, inMonth }) => {
                                                const selected = inMonth && (!!date?.from && sameDay(day, date.from) || !!date?.to && sameDay(day, date.to));
                                                const inRange = inMonth && !!date?.from && !!date?.to && !selected && isInRange(day, date.from, date.to);
                                                const isToday = inMonth && sameDay(day, today);
                                                const backgroundColor = selected
                                                    ? '#ff6b00'
                                                    : inRange
                                                        ? 'rgba(108, 66, 35, 0.86)'
                                                        : 'transparent';
                                                const textColor = selected
                                                    ? '#16110c'
                                                    : inRange
                                                        ? '#23150d'
                                                        : inMonth
                                                            ? '#f4ece2'
                                                            : 'transparent';

                                                return (
                                                    <button
                                                        key={day.toISOString()}
                                                        type="button"
                                                        onClick={() => inMonth && handleDaySelect(day)}
                                                        disabled={!inMonth}
                                                        className="h-[2.125rem] w-full border-0 p-0"
                                                        style={{
                                                            backgroundColor,
                                                            borderRadius: selected ? '4px' : 0,
                                                            boxShadow: !selected && isToday ? 'inset 0 0 0 1px rgba(255, 107, 0, 0.4)' : 'none',
                                                            cursor: inMonth ? 'pointer' : 'default',
                                                        }}
                                                    >
                                                        <span
                                                            className="flex h-full w-full items-center justify-center text-[0.95rem] font-semibold"
                                                            style={{ color: textColor, fontFamily: 'var(--font-sans)' }}
                                                        >
                                                            {day.getDate()}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

