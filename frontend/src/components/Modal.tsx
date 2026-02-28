'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidthClassName?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidthClassName = 'max-w-md' }: ModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const closeLabel = 'Close modal';

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return;

        const modalEl = modalRef.current;
        if (!modalEl) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        if (previouslyFocused && typeof previouslyFocused.blur === 'function') {
            previouslyFocused.blur();
        }
        modalEl.focus({ preventScroll: true });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
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
    }, [isOpen]);

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
                className={`w-full ${maxWidthClassName} flex flex-col max-h-[90vh] overflow-hidden border border-border bg-card shadow-lg focus:outline-none`}
            >
                <div className="flex-none flex items-center justify-between p-4 md:p-6 border-b border-border bg-muted/20">
                    <h2 id={titleId} className="text-lg font-bold text-foreground font-serif tracking-tight">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        onMouseDown={(e) => e.preventDefault()}
                        tabIndex={-1}
                        aria-label={closeLabel}
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
