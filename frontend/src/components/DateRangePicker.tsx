'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

interface DateRangePickerProps {
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
    className?: string; // Add className prop
}

export function DateRangePicker({
    date,
    setDate,
    className, // Destructure className
}: DateRangePickerProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div className={`relative inline-block text-left ${className || ''}`}> {/* Ensure className is applied */}
            <div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex justify-between w-full rounded-none border border-border shadow-sm px-4 py-2 bg-card text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                    id="date-picker-menu"
                    aria-expanded="true"
                    aria-haspopup="true"
                >
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, 'LLL dd, y')} -{' '}
                                    {format(date.to, 'LLL dd, y')}
                                </>
                            ) : (
                                format(date.from, 'LLL dd, y')
                            )
                        ) : (
                            <span>Pick a date range</span>
                        )}
                    </span>
                </button>
            </div>

            {isOpen && (
                <div
                    className="origin-top-right absolute z-50 mt-2 w-auto rounded-none shadow-lg bg-card ring-1 ring-black ring-opacity-5 focus:outline-none border border-border p-2"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="date-picker-menu"
                >
                    <DayPicker
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                        styles={{
                            caption: { color: 'var(--foreground)', fontFamily: 'var(--font-serif)' },
                            head_cell: { color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' },
                            day: { color: 'var(--foreground)', fontFamily: 'var(--font-sans)', borderRadius: '0px' },
                            nav_button: { color: 'var(--foreground)' },
                        }}
                        modifiersClassNames={{
                            selected: 'bg-primary text-primary-foreground rounded-none',
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
