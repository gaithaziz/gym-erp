'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, PlusCircle, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface ChatUser {
    id: string;
    full_name?: string | null;
    email: string;
    role: string;
}

interface ChatMessage {
    id: string;
    message_type: string;
    text_content?: string | null;
    created_at: string;
}

interface ChatThread {
    id: string;
    customer: ChatUser;
    coach: ChatUser;
    unread_count: number;
    last_message: ChatMessage | null;
    last_message_at?: string | null;
}

interface ChatDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

function formatPreview(message: ChatMessage | null): string {
    if (!message) return 'No messages yet';
    if (message.message_type === 'TEXT') return message.text_content || '(empty)';
    if (message.message_type === 'IMAGE') return '[Image]';
    if (message.message_type === 'VIDEO') return '[Video]';
    if (message.message_type === 'VOICE') return '[Voice note]';
    return '[Attachment]';
}

function getCounterpart(thread: ChatThread, meRole?: string) {
    if (meRole === 'COACH') return thread.customer;
    if (meRole === 'CUSTOMER') return thread.coach;
    return null;
}

export default function ChatDrawer({ isOpen, onClose }: ChatDrawerProps) {
    const { user } = useAuth();
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [contacts, setContacts] = useState<ChatUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [contactSearch, setContactSearch] = useState('');
    const [creatingThread, setCreatingThread] = useState(false);

    const isReadOnly = user?.role === 'ADMIN';

    const fetchThreads = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const response = await api.get('/chat/threads', {
                params: { limit: 30, sort_by: 'last_message_at', sort_order: 'desc' },
            });
            setThreads(response.data?.data || []);
        } catch {
            setThreads([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchContacts = async () => {
        if (!user || isReadOnly) return;
        try {
            const response = await api.get('/chat/contacts');
            setContacts(response.data?.data || []);
        } catch {
            setContacts([]);
        }
    };

    const openOrCreateThread = async (contactId: string) => {
        if (!contactId || isReadOnly) return;
        setCreatingThread(true);
        try {
            const payload = user?.role === 'CUSTOMER' ? { coach_id: contactId } : { customer_id: contactId };
            const response = await api.post('/chat/threads', payload);
            const threadId = response.data?.data?.id as string | undefined;
            await fetchThreads();
            setNewChatOpen(false);
            setContactSearch('');
            if (threadId) {
                onClose();
                window.location.href = `/dashboard/chat?thread=${threadId}`;
            }
        } catch {
            // keep drawer open for retry
        } finally {
            setCreatingThread(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        fetchThreads();
        fetchContacts();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isOpen) return;
        const interval = window.setInterval(fetchThreads, 12000);
        return () => window.clearInterval(interval);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const title = useMemo(() => (isReadOnly ? 'Chats (Read-only)' : 'Recent Chats'), [isReadOnly]);
    const availableContacts = user?.role === 'CUSTOMER'
        ? contacts.filter((contact) => contact.role === 'COACH')
        : contacts.filter((contact) => contact.role === 'CUSTOMER');
    const filteredContacts = availableContacts.filter((contact) => {
        const q = contactSearch.trim().toLowerCase();
        if (!q) return true;
        return (contact.full_name || '').toLowerCase().includes(q) || contact.email.toLowerCase().includes(q);
    });

    return (
        <>
            {isOpen && <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />}
            <aside
                className={`fixed right-0 top-0 z-[70] h-dvh w-full max-w-md border-l border-border bg-card transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={18} className="text-primary" />
                        <h2 className="text-sm font-bold text-foreground">{title}</h2>
                    </div>
                    <button className="btn-ghost !p-2" onClick={onClose} aria-label="Close chats">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-3 h-[calc(100%-57px)] overflow-y-auto space-y-2">
                    {!isReadOnly && (
                        <div className="border border-border rounded-sm p-2 space-y-2">
                            <button
                                type="button"
                                className="btn-primary w-full justify-center !py-2"
                                onClick={() => setNewChatOpen((prev) => !prev)}
                            >
                                <PlusCircle size={14} />
                                New Chat
                            </button>
                            {newChatOpen && (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            className="input-dark !pl-8"
                                            value={contactSearch}
                                            onChange={(e) => setContactSearch(e.target.value)}
                                            placeholder={user?.role === 'CUSTOMER' ? 'Search coaches...' : 'Search clients...'}
                                        />
                                    </div>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {filteredContacts.map((contact) => (
                                            <button
                                                key={contact.id}
                                                type="button"
                                                disabled={creatingThread}
                                                onClick={() => openOrCreateThread(contact.id)}
                                                className="w-full text-left border border-border hover:border-primary rounded-sm p-2 transition-colors"
                                            >
                                                <p className="text-sm font-medium text-foreground truncate">
                                                    {contact.full_name || contact.email}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                                            </button>
                                        ))}
                                        {filteredContacts.length === 0 && (
                                            <p className="text-xs text-muted-foreground p-2 border border-dashed border-border rounded-sm">
                                                No contacts found.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <Link
                        href="/dashboard/chat"
                        onClick={onClose}
                        className="block border border-border hover:border-primary rounded-sm p-2 text-xs text-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Open Full Chat
                    </Link>

                    {loading && <p className="text-xs text-muted-foreground px-2 py-1">Loading chats...</p>}
                    {!loading && threads.length === 0 && (
                        <div className="border border-dashed border-border rounded-sm p-4 text-center">
                            <p className="text-sm text-muted-foreground">No recent chats.</p>
                        </div>
                    )}

                    {threads.map((thread) => {
                        const counterpart = getCounterpart(thread, user?.role) || thread.customer;
                        const unread = isReadOnly ? 0 : thread.unread_count || 0;
                        return (
                            <Link
                                key={thread.id}
                                href={`/dashboard/chat?thread=${thread.id}`}
                                onClick={onClose}
                                className="block border border-border hover:border-primary rounded-sm p-3 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold text-sm text-foreground truncate">
                                        {user?.role === 'ADMIN'
                                            ? `${thread.customer.full_name || thread.customer.email} ↔ ${thread.coach.full_name || thread.coach.email}`
                                            : (counterpart.full_name || counterpart.email)}
                                    </p>
                                    {unread > 0 && (
                                        <span className="badge badge-orange">{unread}</span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 truncate">{formatPreview(thread.last_message)}</p>
                            </Link>
                        );
                    })}
                </div>
            </aside>
        </>
    );
}
