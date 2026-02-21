'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    const getFocusableElements = (root: HTMLElement) => {
        const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(',');
        return Array.from(root.querySelectorAll<HTMLElement>(selector));
    };

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return;

        const modalEl = modalRef.current;
        if (!modalEl) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const focusables = getFocusableElements(modalEl);
        const initialFocus = closeButtonRef.current || focusables[0] || modalEl;

        initialFocus.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (e.key !== 'Tab') return;

            const nodes = getFocusableElements(modalEl);
            if (nodes.length === 0) {
                e.preventDefault();
                modalEl.focus();
                return;
            }

            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus();
        };
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden border border-border bg-card shadow-lg"
            >
                <div className="flex-none flex items-center justify-between p-4 md:p-6 border-b border-border bg-muted/20">
                    <h2 id={titleId} className="text-lg font-bold text-foreground font-serif tracking-tight">{title}</h2>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close modal"
                        className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors rounded-sm"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
