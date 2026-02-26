'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { useFeedback } from '@/components/FeedbackProvider';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
    LifeBuoy,
    Send,
    Tag,
    Clock,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    Filter,
    Search,
    ImagePlus
} from 'lucide-react';
import { format } from 'date-fns';
import { SupportTicketWithCustomer, SupportTicketWithMessages, TicketCategory, TicketStatus } from '@/features/support/types';
import { useSupportTickets } from '@/features/support/useSupportTickets';

export default function AdminSupportPage() {
    const { } = useAuth();
    const { showToast, confirm: confirmAction } = useFeedback();
    const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
    const { tickets, total: ticketsTotal, loading, error, fetchTickets } = useSupportTickets<SupportTicketWithCustomer>();
    const [ticketsPage, setTicketsPage] = useState(1);
    const TICKETS_PAGE_SIZE = 20;

    // Filters
    const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Detail view state
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [ticketDetails, setTicketDetails] = useState<(SupportTicketWithCustomer & SupportTicketWithMessages) | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isReplying, setIsReplying] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const messageListRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchTickets({
            isActive: activeTab === 'ACTIVE',
            category: categoryFilter,
            page: ticketsPage,
            pageSize: TICKETS_PAGE_SIZE,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, categoryFilter, ticketsPage]);

    const fetchTicketDetails = useCallback(async (id: string) => {
        try {
            const response = await api.get(`/support/tickets/${id}`);
            setTicketDetails(response.data?.data);
            setTimeout(() => {
                if (messageListRef.current) {
                    messageListRef.current.scrollTop = 0;
                }
            }, 50);
        } catch {
            showToast('Failed to fetch ticket details.', 'error');
        }
    }, [showToast]);

    useEffect(() => {
        if (selectedTicketId) {
            fetchTicketDetails(selectedTicketId);
        } else {
            setTicketDetails(null);
            fetchTickets(); // Refresh list on modal close to catch status changes
        }
    }, [selectedTicketId, fetchTicketDetails, fetchTickets]);

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
            showToast(error.response?.data?.detail || 'Failed to send message', 'error');
        } finally {
            setIsReplying(false);
        }
    };

    const handleUpdateStatus = async (newStatus: TicketStatus) => {
        if (!selectedTicketId) return;

        const isClosing = newStatus === 'RESOLVED' || newStatus === 'CLOSED';
        if (isClosing) {
            const approved = await confirmAction({
                title: 'Close Ticket',
                description: `Are you sure you want to mark this ticket as ${newStatus}? This will close the session.`,
                confirmText: 'Yes, Close',
                cancelText: 'Cancel',
                destructive: true,
            });
            if (!approved) return;
        }

        try {
            await api.patch(`/support/tickets/${selectedTicketId}/status`, { status: newStatus });
            if (isClosing) {
                setSelectedTicketId(null);
            } else {
                fetchTicketDetails(selectedTicketId);
            }
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || 'Failed to update ticket status', 'error');
        }
    };

    const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedTicketId) return;

        const contentType = (file.type || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            showToast('Only image files are supported.', 'error');
            event.target.value = '';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            setIsUploadingPhoto(true);
            await api.post(`/support/tickets/${selectedTicketId}/attachments`, formData);
            await fetchTicketDetails(selectedTicketId);
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || 'Failed to upload photo', 'error');
        } finally {
            setIsUploadingPhoto(false);
            event.target.value = '';
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

    const filteredList = tickets.filter(t => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return t.subject.toLowerCase().includes(q) ||
            t.customer?.full_name.toLowerCase().includes(q) ||
            t.customer?.email.toLowerCase().includes(q);
    });
    const totalTicketPages = Math.max(1, Math.ceil(ticketsTotal / TICKETS_PAGE_SIZE));

    if (selectedTicketId && ticketDetails) {
        const isClosed = ticketDetails.status === 'RESOLVED' || ticketDetails.status === 'CLOSED';
        const profileImageUrl = resolveProfileImageUrl(ticketDetails.customer?.profile_picture_url);

        return (
            <div className="space-y-4 max-w-4xl mx-auto h-[80vh] flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <button
                        onClick={() => setSelectedTicketId(null)}
                        className="btn-ghost !px-2 flex items-center gap-2"
                    >
                        <ArrowLeft size={18} /> Back to Queue
                    </button>
                    {!isClosed && (
                        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:justify-end">
                            {ticketDetails.status === 'OPEN' && (
                                <button
                                    onClick={() => handleUpdateStatus('IN_PROGRESS')}
                                    className="btn-secondary border border-blue-500/30 text-blue-300 hover:bg-blue-500/15 justify-center"
                                >
                                    Mark In Progress
                                </button>
                            )}
                            {(ticketDetails.status === 'OPEN' || ticketDetails.status === 'IN_PROGRESS') && (
                                <button
                                    onClick={() => handleUpdateStatus('RESOLVED')}
                                    className="btn-secondary border border-green-500/30 text-green-300 hover:bg-green-500/15 justify-center"
                                >
                                    Mark Resolved
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="kpi-card !p-6 flex-none">
                    <div className="flex justify-between items-start mb-4 border-b border-border pb-4">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative mt-1 shrink-0">
                                {profileImageUrl ? (
                                    <Image src={profileImageUrl} alt={ticketDetails.customer?.full_name || ''} fill className="object-cover" unoptimized priority />
                                ) : (
                                    ticketDetails.customer?.full_name?.[0] || '?'
                                )}
                            </div>
                            <div>
                                <h1 className="text-xl font-bold mb-1">{ticketDetails.subject}</h1>

                                <div className="text-sm font-semibold mb-2">
                                    {ticketDetails.customer?.full_name} <span className="text-muted-foreground font-normal">({ticketDetails.customer?.email})</span>
                                </div>

                                <div className="flex items-center gap-4 text-xs font-semibold">
                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                                        <Tag size={12} /> {ticketDetails.category}
                                    </span>
                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                        {getStatusIcon(ticketDetails.status)} {ticketDetails.status.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                            <div>Opened: {format(new Date(ticketDetails.created_at), 'MMM d, yyyy h:mm a')}</div>
                        </div>
                    </div>
                </div>

                <div className="kpi-card flex-1 flex flex-col overflow-hidden">
                    <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                        {ticketDetails.messages.map((msg) => {
                            const isStaff = msg.sender_id !== ticketDetails.customer_id;
                            return (
                                <div key={msg.id} className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl p-4 ${isStaff ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                                        <div className="text-xs font-semibold mb-1 opacity-70 flex justify-between gap-4">
                                            <span>{isStaff ? 'Staff (You)' : ticketDetails.customer?.full_name?.split(' ')[0]}</span>
                                            <span>{format(new Date(msg.created_at), 'h:mm a')}</span>
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.message}</div>
                                        {msg.media_url && msg.media_mime?.startsWith('image/') && (
                                            <a
                                                href={resolveProfileImageUrl(msg.media_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block mt-2"
                                            >
                                                <Image
                                                    src={resolveProfileImageUrl(msg.media_url)}
                                                    alt="Support attachment"
                                                    width={640}
                                                    height={480}
                                                    className="max-h-64 rounded-lg border border-border/50"
                                                    unoptimized
                                                />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!isClosed && (
                        <div className="p-4 border-t border-border bg-card/50">
                            <form onSubmit={handleReply} className="flex gap-2">
                                <input
                                    ref={photoInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={handlePhotoUpload}
                                />
                                <button
                                    type="button"
                                    className="btn-secondary !px-3 hover:text-primary hover:border-primary cursor-pointer"
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={isUploadingPhoto || isReplying}
                                    title="Attach photo"
                                    aria-label="Attach photo"
                                >
                                    <ImagePlus size={18} />
                                </button>
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your reply to customer..."
                                    className="input-dark flex-1"
                                    disabled={isReplying || isUploadingPhoto}
                                />
                                <button
                                    type="submit"
                                    disabled={!replyText.trim() || isReplying || isUploadingPhoto}
                                    className="btn-primary"
                                >
                                    <Send size={18} />
                                    <span>Send</span>
                                </button>
                            </form>
                        </div>
                    )}
                    {isClosed && (
                        <div className="p-4 border-t border-border bg-card/50 text-center text-sm text-muted-foreground font-semibold">
                            <AlertCircle size={16} className="inline-block mr-2 mb-0.5" />
                            This ticket has been locked and closed.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <LifeBuoy className="text-primary" /> Support Desk
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage customer support tickets</p>
                </div>

                {/* Tabs */}
                <div className="flex bg-muted p-1 rounded-lg">
                    <button
                        onClick={() => {
                            setTicketsPage(1);
                            setActiveTab('ACTIVE');
                        }}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'ACTIVE'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Active Queue
                    </button>
                    <button
                        onClick={() => {
                            setTicketsPage(1);
                            setActiveTab('COMPLETED');
                        }}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'COMPLETED'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Resolved
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                    {error}
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-xl border border-border">
                <div className="field-with-icon flex-1">
                    <Search className="field-icon" size={18} />
                    <input
                        type="text"
                        placeholder="Search by subject or customer name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-dark input-with-icon w-full"
                    />
                </div>
                <div className="field-with-icon shrink-0 w-full sm:w-48">
                    <Filter className="field-icon" size={18} />
                    <select
                        value={categoryFilter}
                        onChange={(e) => {
                            setTicketsPage(1);
                            setCategoryFilter(e.target.value as TicketCategory | '');
                        }}
                        className="input-dark select-with-icon w-full"
                    >
                        <option value="">All Categories</option>
                        <option value="GENERAL">General</option>
                        <option value="TECHNICAL">Technical</option>
                        <option value="BILLING">Billing</option>
                        <option value="SUBSCRIPTION">Subscription</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading && tickets.length === 0 ? (
                    <div className="kpi-card py-16 text-center text-muted-foreground">Loading tickets...</div>
                ) : filteredList.length === 0 ? (
                    <div className="col-span-1 kpi-card py-16 text-center text-muted-foreground">
                        <CheckCircle2 size={32} className="mx-auto mb-3 opacity-20" />
                        <p>No tickets found in this queue.</p>
                    </div>
                ) : (
                    filteredList.map((ticket) => (
                        <div
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="kpi-card !p-5 cursor-pointer hover:border-primary/50 transition-colors group flex flex-col sm:flex-row gap-4 justify-between sm:items-center"
                        >
                            <div className="flex gap-4 items-center">
                                <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative shrink-0">
                                    {resolveProfileImageUrl(ticket.customer?.profile_picture_url) ? (
                                        <Image src={resolveProfileImageUrl(ticket.customer?.profile_picture_url)!} alt="" fill className="object-cover" unoptimized />
                                    ) : (
                                        ticket.customer?.full_name?.[0] || '?'
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg mb-0.5 group-hover:text-primary transition-colors">{ticket.subject}</h3>
                                    <div className="text-sm font-semibold text-foreground/80 mb-2">{ticket.customer?.full_name}</div>
                                    <div className="flex items-center gap-3 text-xs font-semibold">
                                        <span className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded">
                                            <Tag size={12} /> {ticket.category}
                                        </span>
                                        <span className="flex items-center gap-1 text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                            {getStatusIcon(ticket.status)} {ticket.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground text-left sm:text-right">
                                <div className="text-xs uppercase tracking-wider mb-1 opacity-70">Updated</div>
                                <div className="font-medium text-foreground">{format(new Date(ticket.updated_at), 'MMM d, yyyy')}</div>
                                <div className="text-xs">{format(new Date(ticket.updated_at), 'h:mm a')}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Page {ticketsPage} of {totalTicketPages}</span>
                <div className="flex gap-2">
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={ticketsPage <= 1}
                        onClick={() => setTicketsPage((prev) => Math.max(1, prev - 1))}
                    >
                        Previous
                    </button>
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={ticketsPage >= totalTicketPages}
                        onClick={() => setTicketsPage((prev) => Math.min(totalTicketPages, prev + 1))}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
