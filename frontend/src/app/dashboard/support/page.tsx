'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { resolveProfileImageUrl } from '@/lib/profileImage';
import { useFeedback } from '@/components/FeedbackProvider';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
    LifeBuoy,
    PlusCircle,
    X,
    Send,
    Tag,
    Clock,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    ImagePlus
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { SupportTicket, SupportTicketWithMessages, TicketCategory, TicketStatus } from '@/features/support/types';
import { useSupportTickets } from '@/features/support/useSupportTickets';
import { useLocale } from '@/context/LocaleContext';

export default function CustomerSupportPage() {
    const { user } = useAuth();
    const { t, direction, formatDate } = useLocale();
    const { showToast, confirm: confirmAction } = useFeedback();
    const searchParams = useSearchParams();
    const defaultType = searchParams?.get('type');
    const isSubscriptionType = ['renewal', 'unfreeze', 'freeze', 'extend'].includes(defaultType || '');
    const defaultSubjectByType: Record<string, string> = {
        renewal: 'Subscription renewal request',
        extend: 'Subscription extension request',
        freeze: 'Subscription freeze request',
        unfreeze: 'Subscription unfreeze request',
    };

    const { tickets, total: ticketsTotal, loading, error, fetchTickets } = useSupportTickets<SupportTicket>();
    const [ticketsPage, setTicketsPage] = useState(1);
    const TICKETS_PAGE_SIZE = 20;

    // Modal state
    const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newCategory, setNewCategory] = useState<TicketCategory>(
        isSubscriptionType ? 'SUBSCRIPTION' : 'GENERAL'
    );
    const [newMessage, setNewMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Detail view state
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [ticketDetails, setTicketDetails] = useState<SupportTicketWithMessages | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isReplying, setIsReplying] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const messageListRef = useRef<HTMLDivElement>(null);

    const refreshTickets = useCallback(
        () =>
            fetchTickets({
                isActive: true,
                page: ticketsPage,
                pageSize: TICKETS_PAGE_SIZE,
            }),
        [fetchTickets, ticketsPage]
    );

    useEffect(() => {
        if (defaultType) {
            setIsNewTicketModalOpen(true);
            if (isSubscriptionType) {
                setNewCategory('SUBSCRIPTION');
                const suggested = defaultSubjectByType[defaultType || ''];
                if (suggested) {
                    setNewSubject(suggested);
                }
            }
        }
        refreshTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultType, isSubscriptionType, ticketsPage, refreshTickets]);

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
            showToast(t('support.customer.failedFetchDetails'), 'error');
        }
    }, [showToast, t]);

    useEffect(() => {
        if (selectedTicketId) {
            fetchTicketDetails(selectedTicketId);
        } else {
            setTicketDetails(null);
        }
    }, [selectedTicketId, fetchTicketDetails]);

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await api.post('/support/tickets', {
                subject: newSubject,
                category: newCategory,
                message: newMessage,
            });
            if (isSubscriptionType && user?.id) {
                const lockKey = `blocked_request_lock_${user.id}`;
                const for48h = Date.now() + 48 * 60 * 60 * 1000;
                localStorage.setItem(lockKey, String(for48h));
            }
            setIsNewTicketModalOpen(false);
            setNewSubject('');
            setNewMessage('');
            await refreshTickets();
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || t('support.customer.failedCreate'), 'error');
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
            showToast(error.response?.data?.detail || t('support.customer.failedReply'), 'error');
        } finally {
            setIsReplying(false);
        }
    };

    const totalTicketPages = Math.max(1, Math.ceil(ticketsTotal / TICKETS_PAGE_SIZE));

    const handleCloseTicket = async () => {
        if (!selectedTicketId) return;
        const approved = await confirmAction({
            title: t('support.customer.resolveTitle'),
            description: t('support.customer.resolveDescription'),
            confirmText: t('support.customer.resolveConfirm'),
            cancelText: t('support.customer.cancel'),
            destructive: true,
        });
        if (!approved) return;
        try {
            await api.patch(`/support/tickets/${selectedTicketId}/status`, { status: 'CLOSED' });
            setSelectedTicketId(null);
            refreshTickets();
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || t('support.customer.failedClose'), 'error');
        }
    };

    const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedTicketId) return;

        const contentType = (file.type || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            showToast(t('support.customer.imageOnly'), 'error');
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
            showToast(error.response?.data?.detail || t('support.customer.failedUpload'), 'error');
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
    const statusLabel = (status: TicketStatus) => t(`support.status.${status}`);
    const categoryLabel = (category: TicketCategory) => t(`support.category.${category}`);
    const supportAttachmentAlt = t('support.customer.attachmentAlt');
    const pageLabel = (page: number, total: number) =>
        t('support.customer.pageOf')
            .replace('{{page}}', String(page))
            .replace('{{total}}', String(total));

    if (loading && tickets.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">{t('support.customer.loading')}</div>;
    }

    if (selectedTicketId && ticketDetails) {
        return (
            <div className="space-y-4 max-w-3xl mx-auto h-[80vh] flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <button
                        onClick={() => setSelectedTicketId(null)}
                        className="btn-ghost !px-2 flex items-center gap-2"
                    >
                        <ArrowLeft size={18} className={direction === 'rtl' ? 'rotate-180' : ''} /> {t('support.customer.backToTickets')}
                    </button>
                    <button
                        onClick={handleCloseTicket}
                        className="btn-secondary border border-green-500/30 text-green-300 hover:bg-green-500/15 justify-center"
                    >
                        {t('support.customer.markResolved')}
                    </button>
                </div>

                <div className="kpi-card !p-6 flex-none">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-xl font-bold mb-2">{ticketDetails.subject}</h1>
                            <div className="flex items-center gap-4 text-xs font-semibold">
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                                    <Tag size={12} /> {categoryLabel(ticketDetails.category)}
                                </span>
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                    {getStatusIcon(ticketDetails.status)} {statusLabel(ticketDetails.status)}
                                </span>
                            </div>
                        </div>
                        <div className={`${direction === 'rtl' ? 'text-start' : 'text-end'} text-xs text-muted-foreground`}>
                            <div>{t('support.customer.opened')}: {formatDate(ticketDetails.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                        </div>
                    </div>
                </div>

                <div className="kpi-card flex-1 flex flex-col overflow-hidden">
                    <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                        {ticketDetails.messages.map((msg) => {
                            const isMe = msg.sender_id === user?.id;
                            const mediaUrl = resolveProfileImageUrl(msg.media_url);
                            return (
                                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl p-4 ${isMe ? 'bg-primary text-primary-foreground ltr:rounded-tr-sm rtl:rounded-tl-sm' : 'bg-muted ltr:rounded-tl-sm rtl:rounded-tr-sm'}`}>
                                        <div className="text-xs font-semibold mb-1 opacity-70 flex justify-between gap-4">
                                            <span>{isMe ? t('support.customer.you') : t('support.customer.supportStaff')}</span>
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

                    {ticketDetails.status !== 'CLOSED' && ticketDetails.status !== 'RESOLVED' && (
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
                                    title={t('support.customer.attachPhoto')}
                                    aria-label={t('support.customer.attachPhoto')}
                                >
                                    <ImagePlus size={18} />
                                </button>
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder={t('support.customer.replyPlaceholder')}
                                    className="input-dark flex-1"
                                    disabled={isReplying || isUploadingPhoto}
                                />
                                <button
                                    type="submit"
                                    disabled={!replyText.trim() || isReplying || isUploadingPhoto}
                                    className="btn-primary"
                                >
                                    <Send size={18} />
                                    <span>{t('support.customer.send')}</span>
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
                        <LifeBuoy className="text-primary" /> {t('support.customer.title')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('support.customer.subtitle')}</p>
                </div>
                <button
                    onClick={() => setIsNewTicketModalOpen(true)}
                    className="btn-primary"
                >
                    <PlusCircle size={18} />
                    {t('support.customer.openNewSession')}
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
                        <p>{t('support.customer.noActive')}</p>
                        <p className="text-xs mt-1">{t('support.customer.noActiveHint')}</p>
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
                                        <Tag size={12} /> {categoryLabel(ticket.category)}
                                    </span>
                                    <span className="flex items-center gap-1 text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                        {getStatusIcon(ticket.status)} {statusLabel(ticket.status)}
                                    </span>
                                </div>
                            </div>
                            <div className={`text-sm text-muted-foreground text-start ${direction === 'rtl' ? 'sm:text-start' : 'sm:text-end'}`}>
                                <div className="text-xs uppercase tracking-wider mb-1 opacity-70">{t('support.customer.lastUpdated')}</div>
                                <div className="font-medium text-foreground">{formatDate(ticket.updated_at, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                <div className="text-xs">{formatDate(ticket.updated_at, { hour: 'numeric', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    ))
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
                        {t('support.customer.previous')}
                    </button>
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={ticketsPage >= totalTicketPages}
                        onClick={() => setTicketsPage((prev) => Math.min(totalTicketPages, prev + 1))}
                    >
                        {t('support.customer.next')}
                    </button>
                </div>
            </div>

            {isNewTicketModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsNewTicketModalOpen(false)}
                            className={`absolute top-4 ${direction === 'rtl' ? 'rtl:left-4' : 'ltr:right-4'} text-muted-foreground hover:text-foreground transition-colors`}
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-2xl font-semibold mb-6">{t('support.customer.modalTitle')}</h2>

                        <form onSubmit={handleCreateTicket} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t('support.customer.subject')}</label>
                                <input
                                    type="text"
                                    required
                                    value={newSubject}
                                    onChange={(e) => setNewSubject(e.target.value)}
                                    placeholder={t('support.customer.subjectPlaceholder')}
                                    className="input-dark w-full"
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t('support.customer.categoryLabel')}</label>
                                <select
                                    required
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value as TicketCategory)}
                                    className="input-dark w-full"
                                    disabled={isSubmitting}
                                >
                                    <option value="GENERAL">{t('support.category.GENERAL')}</option>
                                    <option value="TECHNICAL">{t('support.category.TECHNICAL')}</option>
                                    <option value="BILLING">{t('support.category.BILLING')}</option>
                                    <option value="SUBSCRIPTION">{t('support.category.SUBSCRIPTION')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t('support.customer.message')}</label>
                                <textarea
                                    required
                                    rows={5}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={t('support.customer.messagePlaceholder')}
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
                                    {t('support.customer.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary flex-1 justify-center"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? t('support.customer.opening') : t('support.customer.startSession')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

