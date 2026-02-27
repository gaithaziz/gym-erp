'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
    id: number;
    message: string;
    kind: ToastKind;
}

interface ConfirmOptions {
    title?: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
}

interface PendingConfirm extends Required<ConfirmOptions> {
    resolve: (value: boolean) => void;
}

interface FeedbackContextValue {
    showToast: (message: string, kind?: ToastKind) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((prev) => [...prev, { id, message, kind }].slice(-4));
        setTimeout(() => dismissToast(id), 3500);
    }, [dismissToast]);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setPendingConfirm({
                title: options.title ?? 'Confirm Action',
                description: options.description,
                confirmText: options.confirmText ?? 'Confirm',
                cancelText: options.cancelText ?? 'Cancel',
                destructive: options.destructive ?? false,
                resolve,
            });
        });
    }, []);

    const closeConfirm = useCallback((value: boolean) => {
        setPendingConfirm((prev) => {
            if (prev) {
                prev.resolve(value);
            }
            return null;
        });
    }, []);

    const contextValue = useMemo(() => ({ showToast, confirm }), [showToast, confirm]);

    return (
        <FeedbackContext.Provider value={contextValue}>
            {children}

            <div className="pointer-events-none fixed ltr:right-4 rtl:left-4 top-4 z-[120] flex w-full max-w-sm flex-col gap-2">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto border px-3 py-2 text-sm shadow-lg ${
                            toast.kind === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : toast.kind === 'error'
                                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                    : 'border-border bg-card text-foreground'
                        }`}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>

            {pendingConfirm && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md border border-border bg-card p-5">
                        <h2 className="text-lg font-bold text-foreground">{pendingConfirm.title}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">{pendingConfirm.description}</p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => closeConfirm(false)}
                                className="btn-ghost"
                            >
                                {pendingConfirm.cancelText}
                            </button>
                            <button
                                type="button"
                                onClick={() => closeConfirm(true)}
                                className={`btn-primary ${
                                    pendingConfirm.destructive
                                        ? '!bg-destructive !text-destructive-foreground'
                                        : ''
                                }`}
                            >
                                {pendingConfirm.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </FeedbackContext.Provider>
    );
}

export function useFeedback() {
    const context = useContext(FeedbackContext);
    if (!context) {
        throw new Error('useFeedback must be used within a FeedbackProvider');
    }
    return context;
}
