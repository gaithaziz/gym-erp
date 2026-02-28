'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';

interface MemberOption {
    id: string;
    full_name: string;
    email?: string;
}

interface MemberSearchSelectProps {
    members: MemberOption[];
    value: string;
    onChange: (memberId: string) => void;
    placeholder?: string;
    allowClear?: boolean;
    clearLabel?: string;
    noClientsLabel?: string;
    noMatchesLabel?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
}

export default function MemberSearchSelect({
    members,
    value,
    onChange,
    placeholder = 'Search clients...',
    allowClear = false,
    clearLabel = 'Clear selection',
    noClientsLabel = 'No clients',
    noMatchesLabel = 'No matches found',
    disabled = false,
    required = false,
    className = '',
}: MemberSearchSelectProps) {
    const listboxId = useId();
    const selectedMember = useMemo(() => members.find((member) => member.id === value) || null, [members, value]);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const ariaAutocompleteList = 'list';

    const normalizedQuery = query.trim().toLowerCase();
    const filteredMembers = useMemo(() => {
        if (!normalizedQuery) return members;
        return members.filter((member) => {
            const name = member.full_name.toLowerCase();
            const email = (member.email || '').toLowerCase();
            return name.includes(normalizedQuery) || email.includes(normalizedQuery);
        });
    }, [members, normalizedQuery]);

    const optionCount = filteredMembers.length + (allowClear ? 1 : 0);

    const selectMember = (memberId: string) => {
        onChange(memberId);
        setOpen(false);
        setActiveIndex(-1);
    };

    const selectByIndex = (index: number) => {
        if (allowClear && index === 0) {
            selectMember('');
            return;
        }
        const memberIndex = allowClear ? index - 1 : index;
        const member = filteredMembers[memberIndex];
        if (member) selectMember(member.id);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) {
                setOpen(true);
                if (optionCount > 0) setActiveIndex(0);
                return;
            }
            if (optionCount > 0) setActiveIndex((prev) => Math.min(prev + 1, optionCount - 1));
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
                setOpen(true);
                if (optionCount > 0) setActiveIndex(0);
                return;
            }
            if (optionCount > 0) setActiveIndex((prev) => Math.max(prev - 1, 0));
            return;
        }
        if (event.key === 'Enter') {
            if (open && activeIndex >= 0) {
                event.preventDefault();
                selectByIndex(activeIndex);
            }
            return;
        }
        if (event.key === 'Escape') {
            if (open) {
                event.preventDefault();
                setOpen(false);
                setActiveIndex(-1);
            }
        }
    };

    const showNoClients = members.length === 0;
    const showNoMatches = members.length > 0 && filteredMembers.length === 0;
    const inputValue = open ? query : (selectedMember?.full_name || '');

    return (
        <div className={`relative ${className}`}>
            <input
                type="text"
                className="input-dark w-full"
                placeholder={placeholder}
                value={inputValue}
                disabled={disabled}
                required={required}
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                aria-required={required}
                aria-autocomplete={ariaAutocompleteList}
                onFocus={() => {
                    setOpen(true);
                    setQuery(selectedMember?.full_name || '');
                    if (optionCount > 0) setActiveIndex(0);
                }}
                onBlur={() => {
                    window.setTimeout(() => {
                        setOpen(false);
                        setActiveIndex(-1);
                    }, 100);
                }}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setOpen(true);
                    setActiveIndex(-1);
                }}
                onKeyDown={handleKeyDown}
            />

            {open && (
                <ul
                    id={listboxId}
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-sm border border-border bg-card shadow-lg"
                >
                    {allowClear && (
                        <li
                            id={`${listboxId}-option-0`}
                            role="option"
                            aria-selected={value === ''}
                            className={`cursor-pointer px-3 py-2 text-sm transition-colors ${activeIndex === 0 ? 'bg-muted/50 text-primary' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                            onMouseEnter={() => setActiveIndex(0)}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                selectMember('');
                            }}
                        >
                            {clearLabel}
                        </li>
                    )}

                    {showNoClients && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">{noClientsLabel}</li>
                    )}

                    {showNoMatches && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">{noMatchesLabel}</li>
                    )}

                    {!showNoClients && filteredMembers.map((member, idx) => {
                        const visualIndex = allowClear ? idx + 1 : idx;
                        const selected = member.id === value;
                        return (
                            <li
                                key={member.id}
                                id={`${listboxId}-option-${visualIndex}`}
                                role="option"
                                aria-selected={selected}
                                className={`cursor-pointer px-3 py-2 text-sm transition-colors ${activeIndex === visualIndex ? 'bg-muted/50 text-primary' : 'hover:bg-muted/40'} ${selected ? 'text-primary' : 'text-foreground'}`}
                                onMouseEnter={() => setActiveIndex(visualIndex)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectMember(member.id);
                                }}
                            >
                                <div className="font-medium">{member.full_name}</div>
                                {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
