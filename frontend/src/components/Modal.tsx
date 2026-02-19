import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div
                ref={modalRef}
                className="w-full max-w-lg overflow-hidden border border-border bg-card shadow-lg"
            >
                <div className="flex items-center justify-between p-6 border-b border-border bg-muted/20">
                    <h2 className="text-lg font-bold text-foreground font-serif tracking-tight">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors rounded-sm"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
