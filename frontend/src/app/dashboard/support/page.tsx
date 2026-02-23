'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState, useRef } from 'react';
import {
    LifeBuoy,
    PlusCircle,
    X,
    Send,
    Tag,
    Clock,
    CheckCircle2,
    AlertCircle,
    ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';

type TicketCategory = 'GENERAL' | 'TECHNICAL' | 'BILLING' | 'SUBSCRIPTION';
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface SupportMessage {
    id: string;
    sender_id: string;
    message: string;
    created_at: string;
}

interface SupportTicket {
    id: string;
    subject: string;
    category: TicketCategory;
    status: TicketStatus;
    created_at: string;
    updated_at: string;
}

export default function CustomerSupportPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const defaultType = searchParams?.get('type');

    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newCategory, setNewCategory] = useState<TicketCategory>(
        defaultType === 'renewal' || defaultType === 'unfreeze' ? 'SUBSCRIPTION' : 'GENERAL'
    );
    const [newMessage, setNewMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Detail view state
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [ticketDetails, setTicketDetails] = useState<SupportTicket & { messages: SupportMessage[] } | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isReplying, setIsReplying] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchTickets = async () => {
        try {
            setLoading(true);
            const response = await api.get('/support/tickets', { params: { is_active: true } });
            setTickets(response.data?.data || []);
            setError(null);
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (defaultType) {
            setIsNewTicketModalOpen(true);
        }
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultType]);

    const fetchTicketDetails = async (id: string) => {
        try {
            const response = await api.get(`/support/tickets/${id}`);
            setTicketDetails(response.data?.data);
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (err) {
            console.error('Failed to fetch ticket details', err);
        }
    };

    useEffect(() => {
        if (selectedTicketId) {
            fetchTicketDetails(selectedTicketId);
        } else {
            setTicketDetails(null);
        }
    }, [selectedTicketId]);

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await api.post('/support/tickets', {
                subject: newSubject,
                category: newCategory,
                message: newMessage,
            });
            setIsNewTicketModalOpen(false);
            setNewSubject('');
            setNewMessage('');
            await fetchTickets();
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            alert(error.response?.data?.detail || 'Failed to create ticket');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTicketId || !replyText.trim()) return;
        try {
            setIsReplying(true);
            await api.post(`/support/tickets/${selectedTicketId}/messages`, {
                message: replyText.trim()
            });
            setReplyText('');
            await fetchTicketDetails(selectedTicketId);
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            alert(error.response?.data?.detail || 'Failed to send message');
        } finally {
            setIsReplying(false);
        }
    };

    const handleCloseTicket = async () => {
        if (!selectedTicketId) return;
        if (!confirm('Are you sure you want to close this ticket?')) return;
        try {
            await api.patch(`/support/tickets/${selectedTicketId}/status`, { status: 'CLOSED' });
            setSelectedTicketId(null);
            fetchTickets();
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            alert(error.response?.data?.detail || 'Failed to close ticket');
        }
    };

    const getStatusIcon = (status: TicketStatus) => {
        switch (status) {
            case 'OPEN': return <AlertCircle size={14} className="text-yellow-500" />;
            case 'IN_PROGRESS': return <Clock size={14} className="text-blue-500" />;
            case 'RESOLVED': return <CheckCircle2 size={14} className="text-green-500" />;
            case 'CLOSED': return <CheckCircle2 size={14} className="text-gray-500" />;
        }
    };

    if (loading && tickets.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">Loading support tickets...</div>;
    }

    if (selectedTicketId && ticketDetails) {
        return (
            <div className="space-y-4 max-w-3xl mx-auto h-[80vh] flex flex-col">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setSelectedTicketId(null)}
                        className="btn-ghost !px-2 flex items-center gap-2"
                    >
                        <ArrowLeft size={18} /> Back to Tickets
                    </button>
                    <button
                        onClick={handleCloseTicket}
                        className="btn-secondary !text-red-500 border-red-500/20 bg-red-500/10 hover:bg-red-500/20"
                    >
                        Mark as Resolved
                    </button>
                </div>

                <div className="kpi-card !p-6 flex-none">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-xl font-bold mb-2">{ticketDetails.subject}</h1>
                            <div className="flex items-center gap-4 text-xs font-semibold">
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                                    <Tag size={12} /> {ticketDetails.category}
                                </span>
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                    {getStatusIcon(ticketDetails.status)} {ticketDetails.status.replace('_', ' ')}
                                </span>
                            </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                            <div>Opened: {format(new Date(ticketDetails.created_at), 'MMM d, yyyy h:mm a')}</div>
                        </div>
                    </div>
                </div>

                <div className="kpi-card flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {ticketDetails.messages.map((msg) => {
                            const isMe = msg.sender_id === user?.id;
                            return (
                                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl p-4 ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                                        <div className="text-xs font-semibold mb-1 opacity-70 flex justify-between gap-4">
                                            <span>{isMe ? 'You' : 'Support Staff'}</span>
                                            <span>{format(new Date(msg.created_at), 'h:mm a')}</span>
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.message}</div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {ticketDetails.status !== 'CLOSED' && ticketDetails.status !== 'RESOLVED' && (
                        <div className="p-4 border-t border-border bg-card/50">
                            <form onSubmit={handleReply} className="flex gap-2">
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your reply to support..."
                                    className="input-dark flex-1"
                                    disabled={isReplying}
                                />
                                <button
                                    type="submit"
                                    disabled={!replyText.trim() || isReplying}
                                    className="btn-primary"
                                >
                                    <Send size={18} />
                                    <span>Send</span>
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <LifeBuoy className="text-primary" /> Support Tickets
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your active support sessions</p>
                </div>
                <button
                    onClick={() => setIsNewTicketModalOpen(true)}
                    className="btn-primary"
                >
                    <PlusCircle size={18} />
                    Open New Session
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4">
                {tickets.length === 0 && !loading ? (
                    <div className="col-span-1 kpi-card py-16 text-center text-muted-foreground">
                        <AlertCircle size={32} className="mx-auto mb-3 opacity-20" />
                        <p>No active support sessions found.</p>
                        <p className="text-xs mt-1">If you have an issue, please open a new session.</p>
                    </div>
                ) : (
                    tickets.map((ticket) => (
                        <div
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="kpi-card !p-5 cursor-pointer hover:border-primary/50 transition-colors group flex flex-col sm:flex-row gap-4 justify-between sm:items-center"
                        >
                            <div>
                                <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{ticket.subject}</h3>
                                <div className="flex items-center gap-3 text-xs font-semibold">
                                    <span className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded">
                                        <Tag size={12} /> {ticket.category}
                                    </span>
                                    <span className="flex items-center gap-1 text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                        {getStatusIcon(ticket.status)} {ticket.status.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground text-left sm:text-right">
                                <div className="text-xs uppercase tracking-wider mb-1 opacity-70">Last Updated</div>
                                <div className="font-medium text-foreground">{format(new Date(ticket.updated_at), 'MMM d, yyyy')}</div>
                                <div className="text-xs">{format(new Date(ticket.updated_at), 'h:mm a')}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isNewTicketModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsNewTicketModalOpen(false)}
                            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-2xl font-semibold mb-6">Open Support Session</h2>

                        <form onSubmit={handleCreateTicket} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Subject</label>
                                <input
                                    type="text"
                                    required
                                    value={newSubject}
                                    onChange={(e) => setNewSubject(e.target.value)}
                                    placeholder="Brief summary of your issue"
                                    className="input-dark w-full"
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Category</label>
                                <select
                                    required
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value as TicketCategory)}
                                    className="input-dark w-full"
                                    disabled={isSubmitting}
                                >
                                    <option value="GENERAL">General Inquiry</option>
                                    <option value="TECHNICAL">Technical Issue (App/Website)</option>
                                    <option value="BILLING">Billing/Payment</option>
                                    <option value="SUBSCRIPTION">Subscription (Renew/Freeze)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Message</label>
                                <textarea
                                    required
                                    rows={5}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Please describe your issue in detail..."
                                    className="input-dark w-full resize-none min-h-[120px]"
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsNewTicketModalOpen(false)}
                                    className="btn-secondary flex-1"
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary flex-1 justify-center"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Opening...' : 'Start Session'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
