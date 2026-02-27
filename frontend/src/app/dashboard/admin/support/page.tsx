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
import { SupportTicketWithCustomer, SupportTicketWithMessages, TicketCategory, TicketStatus } from '@/features/support/types';
import { useSupportTickets } from '@/features/support/useSupportTickets';
import { useLocale } from '@/context/LocaleContext';

export default function AdminSupportPage() {
    const {} = useAuth();
    const { t, direction, formatDate } = useLocale();
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

    const refreshTickets = useCallback(
        () =>
            fetchTickets({
                isActive: activeTab === 'ACTIVE',
                category: categoryFilter,
                page: ticketsPage,
                pageSize: TICKETS_PAGE_SIZE,
            }),
        [activeTab, categoryFilter, fetchTickets, ticketsPage]
    );

    useEffect(() => {
        refreshTickets();
    }, [activeTab, categoryFilter, ticketsPage, refreshTickets]);

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
            showToast(t('support.admin.failedFetchDetails'), 'error');
        }
    }, [showToast, t]);

    useEffect(() => {
        if (selectedTicketId) {
            fetchTicketDetails(selectedTicketId);
        } else {
            setTicketDetails(null);
            refreshTickets(); // Refresh list on modal close to catch status changes
        }
    }, [selectedTicketId, fetchTicketDetails, refreshTickets]);

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
            showToast(error.response?.data?.detail || t('support.admin.failedReply'), 'error');
        } finally {
            setIsReplying(false);
        }
    };

    const handleUpdateStatus = async (newStatus: TicketStatus) => {
        if (!selectedTicketId) return;

        const isClosing = newStatus === 'RESOLVED' || newStatus === 'CLOSED';
        if (isClosing) {
            const approved = await confirmAction({
                title: t('support.admin.closeTitle'),
                description: t('support.admin.closeDescription').replace('{{status}}', t(`support.status.${newStatus}`)),
                confirmText: t('support.admin.closeConfirm'),
                cancelText: t('support.admin.cancel'),
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
            showToast(error.response?.data?.detail || t('support.admin.failedStatus'), 'error');
        }
    };

    const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedTicketId) return;

        const contentType = (file.type || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            showToast(t('support.admin.imageOnly'), 'error');
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
            showToast(error.response?.data?.detail || t('support.admin.failedUpload'), 'error');
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
    const statusLabel = (status: TicketStatus) => t(`support.status.${status}`);
    const categoryLabel = (category: TicketCategory) => t(`support.category.${category}`);
    const supportAttachmentAlt = 'Support attachment';
    const pageLabel = (page: number, total: number) =>
        t('support.admin.pageOf')
            .replace('{{page}}', String(page))
            .replace('{{total}}', String(total));
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
                        <ArrowLeft size={18} className={direction === 'rtl' ? 'rotate-180' : ''} /> {t('support.admin.backToQueue')}
                    </button>
                    {!isClosed && (
                        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:justify-end">
                            {ticketDetails.status === 'OPEN' && (
                                <button
                                    onClick={() => handleUpdateStatus('IN_PROGRESS')}
                                    className="btn-secondary border border-blue-500/30 text-blue-300 hover:bg-blue-500/15 justify-center"
                                >
                                    {t('support.admin.markInProgress')}
                                </button>
                            )}
                            {(ticketDetails.status === 'OPEN' || ticketDetails.status === 'IN_PROGRESS') && (
                                <button
                                    onClick={() => handleUpdateStatus('RESOLVED')}
                                    className="btn-secondary border border-green-500/30 text-green-300 hover:bg-green-500/15 justify-center"
                                >
                                    {t('support.admin.markResolved')}
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
                                        <Tag size={12} /> {categoryLabel(ticketDetails.category)}
                                    </span>
                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                        {getStatusIcon(ticketDetails.status)} {statusLabel(ticketDetails.status)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className={`${direction === 'rtl' ? 'text-start' : 'text-end'} text-xs text-muted-foreground`}>
                            <div>{t('support.admin.opened')}: {formatDate(ticketDetails.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                        </div>
                    </div>
                </div>

                <div className="kpi-card flex-1 flex flex-col overflow-hidden">
                    <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                        {ticketDetails.messages.map((msg) => {
                            const isStaff = msg.sender_id !== ticketDetails.customer_id;
                            const mediaUrl = resolveProfileImageUrl(msg.media_url);
                            return (
                                <div key={msg.id} className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl p-4 ${isStaff ? 'bg-primary text-primary-foreground ltr:rounded-tr-sm rtl:rounded-tl-sm' : 'bg-muted ltr:rounded-tl-sm rtl:rounded-tr-sm'}`}>
                                        <div className="text-xs font-semibold mb-1 opacity-70 flex justify-between gap-4">
                                            <span>{isStaff ? t('support.admin.staffYou') : ticketDetails.customer?.full_name?.split(' ')[0]}</span>
                                            <span>{formatDate(msg.created_at, { hour: 'numeric', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.message}</div>
                                        {mediaUrl && msg.media_mime?.startsWith('image/') && (
                                            <a
                                                href={mediaUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block mt-2"
                                            >
                                                <Image
                                                    src={mediaUrl}
                                                    alt={supportAttachmentAlt}
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
                                    title={t('support.admin.attachPhoto')}
                                    aria-label={t('support.admin.attachPhoto')}
                                >
                                    <ImagePlus size={18} />
                                </button>
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder={t('support.admin.replyPlaceholder')}
                                    className="input-dark flex-1"
                                    disabled={isReplying || isUploadingPhoto}
                                />
                                <button
                                    type="submit"
                                    disabled={!replyText.trim() || isReplying || isUploadingPhoto}
                                    className="btn-primary"
                                >
                                    <Send size={18} />
                                    <span>{t('support.admin.send')}</span>
                                </button>
                            </form>
                        </div>
                    )}
                    {isClosed && (
                        <div className="p-4 border-t border-border bg-card/50 text-center text-sm text-muted-foreground font-semibold">
                            <AlertCircle size={16} className="inline-block ltr:mr-2 rtl:ml-2 mb-0.5" />
                            {t('support.admin.closedNotice')}
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
                        <LifeBuoy className="text-primary" /> {t('support.admin.title')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('support.admin.subtitle')}</p>
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
                        {t('support.admin.activeQueue')}
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
                        {t('support.admin.resolved')}
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
                        placeholder={t('support.admin.searchPlaceholder')}
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
                        <option value="">{t('support.admin.allCategories')}</option>
                        <option value="GENERAL">{t('support.category.GENERAL')}</option>
                        <option value="TECHNICAL">{t('support.category.TECHNICAL')}</option>
                        <option value="BILLING">{t('support.category.BILLING')}</option>
                        <option value="SUBSCRIPTION">{t('support.category.SUBSCRIPTION')}</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading && tickets.length === 0 ? (
                    <div className="kpi-card py-16 text-center text-muted-foreground">{t('support.admin.loading')}</div>
                ) : filteredList.length === 0 ? (
                    <div className="col-span-1 kpi-card py-16 text-center text-muted-foreground">
                        <CheckCircle2 size={32} className="mx-auto mb-3 opacity-20" />
                        <p>{t('support.admin.noTickets')}</p>
                    </div>
                ) : (
                    filteredList.map((ticket) => {
                        const customerImageUrl = resolveProfileImageUrl(ticket.customer?.profile_picture_url);
                        return <div
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="kpi-card !p-5 cursor-pointer hover:border-primary/50 transition-colors group flex flex-col sm:flex-row gap-4 justify-between sm:items-center"
                        >
                            <div className="flex gap-4 items-center">
                                <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold overflow-hidden relative shrink-0">
                                    {customerImageUrl ? (
                                        <Image src={customerImageUrl} alt="" fill className="object-cover" unoptimized />
                                    ) : (
                                        ticket.customer?.full_name?.[0] || '?'
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg mb-0.5 group-hover:text-primary transition-colors">{ticket.subject}</h3>
                                    <div className="text-sm font-semibold text-foreground/80 mb-2">{ticket.customer?.full_name}</div>
                                    <div className="flex items-center gap-3 text-xs font-semibold">
                                        <span className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded">
                                            <Tag size={12} /> {categoryLabel(ticket.category)}
                                        </span>
                                        <span className="flex items-center gap-1 text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                            {getStatusIcon(ticket.status)} {statusLabel(ticket.status)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className={`text-sm text-muted-foreground text-start ${direction === 'rtl' ? 'sm:text-start' : 'sm:text-end'}`}>
                                <div className="text-xs uppercase tracking-wider mb-1 opacity-70">{t('support.admin.updated')}</div>
                                <div className="font-medium text-foreground">{formatDate(ticket.updated_at, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                <div className="text-xs">{formatDate(ticket.updated_at, { hour: 'numeric', minute: '2-digit' })}</div>
                            </div>
                        </div>;
                    })
                )}
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{pageLabel(ticketsPage, totalTicketPages)}</span>
                <div className="flex gap-2">
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={ticketsPage <= 1}
                        onClick={() => setTicketsPage((prev) => Math.max(1, prev - 1))}
                    >
                        {t('support.admin.previous')}
                    </button>
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={ticketsPage >= totalTicketPages}
                        onClick={() => setTicketsPage((prev) => Math.min(totalTicketPages, prev + 1))}
                    >
                        {t('support.admin.next')}
                    </button>
                </div>
            </div>
        </div>
    );
}

