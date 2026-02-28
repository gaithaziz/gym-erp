'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ListFilter, Search, Upload } from 'lucide-react';

import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { api } from '@/lib/api';

type LostFoundStatus = 'REPORTED' | 'UNDER_REVIEW' | 'READY_FOR_PICKUP' | 'CLOSED' | 'REJECTED' | 'DISPOSED';

interface Actor {
    id: string;
    full_name?: string | null;
    email: string;
    role: string;
}

interface LostFoundMedia {
    id: string;
    uploader_id: string;
    media_url: string;
    media_mime: string;
    media_size_bytes: number;
    created_at: string;
}

interface LostFoundComment {
    id: string;
    item_id: string;
    author: Actor;
    text: string;
    created_at: string;
}

interface LostFoundItem {
    id: string;
    status: LostFoundStatus;
    reporter: Actor;
    assignee?: Actor | null;
    title: string;
    description: string;
    category: string;
    found_date?: string | null;
    found_location?: string | null;
    contact_note?: string | null;
    media: LostFoundMedia[];
    comments: LostFoundComment[];
    created_at: string;
    updated_at: string;
    closed_at?: string | null;
}

interface LostFoundSummary {
    reported: number;
    under_review: number;
    ready_for_pickup: number;
    closed: number;
    rejected: number;
    disposed: number;
    total_open: number;
}

const handlerRoles = ['ADMIN', 'RECEPTION'];

const statusOptions: Array<{ value: LostFoundStatus }> = [
    { value: 'REPORTED' },
    { value: 'UNDER_REVIEW' },
    { value: 'READY_FOR_PICKUP' },
    { value: 'CLOSED' },
    { value: 'REJECTED' },
    { value: 'DISPOSED' },
];
const activeStatusOptions = statusOptions.filter((opt) =>
    ['REPORTED', 'UNDER_REVIEW', 'READY_FOR_PICKUP'].includes(opt.value)
);
const archiveStatusOptions = statusOptions.filter((opt) =>
    ['CLOSED', 'REJECTED', 'DISPOSED'].includes(opt.value)
);

function resolveMediaUrl(url?: string | null): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:8000';
    const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
    const base = normalizedApiUrl.endsWith('/api/v1')
        ? normalizedApiUrl.slice(0, -'/api/v1'.length)
        : normalizedApiUrl;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function statusBadgeClass(status: LostFoundStatus): string {
    if (status === 'CLOSED') return 'badge badge-green';
    if (status === 'READY_FOR_PICKUP') return 'badge badge-blue';
    if (status === 'UNDER_REVIEW') return 'badge badge-orange';
    if (status === 'REJECTED' || status === 'DISPOSED') return 'badge badge-gray';
    return 'badge badge-orange';
}

export default function LostFoundPage() {
    const { locale } = useLocale();
    const { user } = useAuth();
    const { showToast, confirm: confirmAction } = useFeedback();
    const txt = locale === 'ar' ? {
        loading: 'جاري تحميل المفقودات والمعثورات...',
        title: 'المفقودات والمعثورات',
        subtitle: 'الإبلاغ عن العناصر وتتبع دورة التعامل معها.',
        active: 'نشط',
        archive: 'الأرشيف',
        openQueue: 'الطابور المفتوح',
        reported: 'تم الإبلاغ',
        underReview: 'قيد المراجعة',
        readyForPickup: 'جاهز للاستلام',
        reports: 'البلاغات',
        reportItem: 'إبلاغ عن عنصر',
        searchReports: 'ابحث في البلاغات',
        allArchived: 'كل المؤرشف',
        allActive: 'كل النشط',
        noArchivedReports: 'لا توجد بلاغات مؤرشفة.',
        noReports: 'لا توجد بلاغات.',
        selectReport: 'اختر بلاغًا لعرض التفاصيل.',
        itemDetails: 'تفاصيل العنصر',
        category: 'التصنيف:',
        foundDate: 'تاريخ العثور:',
        location: 'الموقع:',
        contactNote: 'ملاحظة التواصل:',
        notAvailable: 'غير متاح',
        people: 'الأشخاص',
        reporter: 'المبلّغ:',
        assignee: 'المسؤول:',
        unassigned: 'غير معيّن',
        assignTo: 'تعيين إلى',
        selectHandler: 'اختر مسؤولًا',
        statusNoteOptional: 'ملاحظة الحالة (اختياري)',
        statusReasonPlaceholder: 'السبب / ملاحظة المعالجة',
        media: 'الوسائط',
        addMedia: 'إضافة وسائط',
        previewBeforeSending: 'معاينة قبل الإرسال',
        pendingPreviewAlt: 'معاينة معلقة',
        confirmUpload: 'تأكيد الرفع',
        cancel: 'إلغاء',
        noMedia: 'لا توجد وسائط مرفوعة بعد.',
        attachmentAlt: 'مرفق',
        timelineComments: 'السجل الزمني والتعليقات',
        noComments: 'لا توجد تعليقات بعد.',
        addCommentPlaceholder: 'أضف تعليق متابعة',
        send: 'إرسال',
        reportModalTitle: 'الإبلاغ عن عنصر مفقود أو معثور عليه',
        fieldTitle: 'العنوان',
        fieldDescription: 'الوصف',
        fieldCategory: 'التصنيف',
        fieldFoundDate: 'تاريخ العثور',
        fieldFoundLocation: 'موقع العثور',
        fieldContactNote: 'ملاحظة التواصل',
        optionalEvidence: 'صورة/فيديو إثباتي اختياري',
        selectFile: 'اختر ملفًا',
        selectedEvidenceAlt: 'الدليل المحدد',
        submitHint: 'ستؤكد إرسال هذا الملف وقت الإرسال.',
        submitting: 'جارٍ الإرسال...',
        submitReport: 'إرسال البلاغ',
        reportSubmitted: 'تم إرسال البلاغ.',
        reportSubmitFailed: 'تعذر إرسال البلاغ.',
        commentAdded: 'تمت إضافة التعليق.',
        commentFailed: 'تعذر إضافة التعليق.',
        statusUpdated: 'تم تحديث الحالة.',
        statusUpdateFailed: 'فشل تغيير الحالة.',
        assignedSuccess: 'تم التعيين بنجاح.',
        assignFailed: 'تعذر تعيين العنصر.',
        onlyMediaAllowed: 'تدعم الملفات من نوع صورة/فيديو فقط.',
        sendMediaTitle: 'إرسال وسائط',
        sendMediaDescription: 'إرسال هذا الملف إلى بلاغ المفقودات والمعثورات المحدد؟',
        sendMedia: 'إرسال',
        mediaUploaded: 'تم رفع الوسائط.',
        mediaUploadFailed: 'فشل رفع الوسائط.',
        attachMediaTitle: 'إرفاق وسائط',
        attachMediaDescription: 'هل ترسل هذه الوسائط المختارة مع البلاغ الآن؟',
        sendSelectedMedia: 'إرسال الوسائط',
        skipForNow: 'تخطي الآن',
        statusReported: 'تم الإبلاغ',
        statusUnderReview: 'قيد المراجعة',
        statusReadyForPickup: 'جاهز للاستلام',
        statusClosed: 'مغلق',
        statusRejected: 'مرفوض',
        statusDisposed: 'تم التخلص',
    } : {
        loading: 'Loading lost & found...',
        title: 'Lost & Found',
        subtitle: 'Report items and track their handling lifecycle.',
        active: 'Active',
        archive: 'Archive',
        openQueue: 'Open Queue',
        reported: 'Reported',
        underReview: 'Under Review',
        readyForPickup: 'Ready for Pickup',
        reports: 'Reports',
        reportItem: 'Report Item',
        searchReports: 'Search reports',
        allArchived: 'All archived',
        allActive: 'All active',
        noArchivedReports: 'No archived reports found.',
        noReports: 'No reports found.',
        selectReport: 'Select a report to view details.',
        itemDetails: 'Item Details',
        category: 'Category:',
        foundDate: 'Found date:',
        location: 'Location:',
        contactNote: 'Contact note:',
        notAvailable: 'N/A',
        people: 'People',
        reporter: 'Reporter:',
        assignee: 'Assignee:',
        unassigned: 'Unassigned',
        assignTo: 'Assign To',
        selectHandler: 'Select handler',
        statusNoteOptional: 'Status Note (optional)',
        statusReasonPlaceholder: 'Reason / handling note',
        media: 'Media',
        addMedia: 'Add Media',
        previewBeforeSending: 'Preview before sending',
        pendingPreviewAlt: 'Pending preview',
        confirmUpload: 'Confirm Upload',
        cancel: 'Cancel',
        noMedia: 'No media uploaded yet.',
        attachmentAlt: 'Attachment',
        timelineComments: 'Timeline & Comments',
        noComments: 'No comments yet.',
        addCommentPlaceholder: 'Add follow-up comment',
        send: 'Send',
        reportModalTitle: 'Report Lost or Found Item',
        fieldTitle: 'Title',
        fieldDescription: 'Description',
        fieldCategory: 'Category',
        fieldFoundDate: 'Found Date',
        fieldFoundLocation: 'Found Location',
        fieldContactNote: 'Contact Note',
        optionalEvidence: 'Optional photo/video evidence',
        selectFile: 'Select file',
        selectedEvidenceAlt: 'Selected evidence',
        submitHint: 'You will confirm sending this file at submit time.',
        submitting: 'Submitting...',
        submitReport: 'Submit Report',
        reportSubmitted: 'Report submitted.',
        reportSubmitFailed: 'Could not submit report.',
        commentAdded: 'Comment added.',
        commentFailed: 'Could not add comment.',
        statusUpdated: 'Status updated.',
        statusUpdateFailed: 'Status change failed.',
        assignedSuccess: 'Assigned successfully.',
        assignFailed: 'Could not assign item.',
        onlyMediaAllowed: 'Only image/video files are supported.',
        sendMediaTitle: 'Send media',
        sendMediaDescription: 'Send this file to the selected Lost & Found report?',
        sendMedia: 'Send',
        mediaUploaded: 'Media uploaded.',
        mediaUploadFailed: 'Media upload failed.',
        attachMediaTitle: 'Attach media',
        attachMediaDescription: 'Send this selected media with the report now?',
        sendSelectedMedia: 'Send media',
        skipForNow: 'Skip for now',
        statusReported: 'Reported',
        statusUnderReview: 'Under Review',
        statusReadyForPickup: 'Ready for Pickup',
        statusClosed: 'Closed',
        statusRejected: 'Rejected',
        statusDisposed: 'Disposed',
    };

    const getStatusLabel = (status: LostFoundStatus) => {
        if (status === 'REPORTED') return txt.statusReported;
        if (status === 'UNDER_REVIEW') return txt.statusUnderReview;
        if (status === 'READY_FOR_PICKUP') return txt.statusReadyForPickup;
        if (status === 'CLOSED') return txt.statusClosed;
        if (status === 'REJECTED') return txt.statusRejected;
        return txt.statusDisposed;
    };
    const isHandler = handlerRoles.includes(user?.role || '');
    const isAdmin = user?.role === 'ADMIN';
    const [viewMode, setViewMode] = useState<'ACTIVE' | 'ARCHIVE'>('ACTIVE');

    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<LostFoundItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [summary, setSummary] = useState<LostFoundSummary | null>(null);
    const [handlers, setHandlers] = useState<Actor[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<LostFoundStatus | 'ALL'>('ALL');
    const [commentText, setCommentText] = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [reportOpen, setReportOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [reportForm, setReportForm] = useState({
        title: '',
        description: '',
        category: '',
        found_date: '',
        found_location: '',
        contact_note: '',
    });

    const selectedItem = useMemo(
        () => items.find((item) => item.id === selectedItemId) || null,
        [items, selectedItemId]
    );

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((item) => {
            const statusOk = statusFilter === 'ALL' ? true : item.status === statusFilter;
            const searchOk = q
                ? [item.title, item.description, item.category, item.reporter.full_name || '', item.reporter.email]
                    .join(' ')
                    .toLowerCase()
                    .includes(q)
                : true;
            return statusOk && searchOk;
        });
    }, [items, search, statusFilter]);

    const visibleStatusOptions = viewMode === 'ARCHIVE' ? archiveStatusOptions : activeStatusOptions;

    const fetchItems = useCallback(async () => {
        try {
            const params: Record<string, string | boolean> = {};
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (isAdmin) params.archived_only = viewMode === 'ARCHIVE';
            const response = await api.get('/lost-found/items', { params });
            const rows = (response.data?.data || []) as LostFoundItem[];
            setItems(rows);
            if (!selectedItemId && rows.length > 0) setSelectedItemId(rows[0].id);
            if (selectedItemId && !rows.some((item) => item.id === selectedItemId)) {
                setSelectedItemId(rows[0]?.id || null);
            }
        } catch {
            setItems([]);
        }
    }, [selectedItemId, statusFilter, isAdmin, viewMode]);

    const fetchSummary = useCallback(async () => {
        if (!isHandler) return;
        try {
            const response = await api.get('/lost-found/summary');
            setSummary(response.data?.data || null);
        } catch {
            setSummary(null);
        }
    }, [isHandler]);

    const fetchHandlers = useCallback(async () => {
        if (!isHandler) return;
        try {
            const response = await api.get('/lost-found/handlers');
            setHandlers(response.data?.data || []);
        } catch {
            setHandlers([]);
        }
    }, [isHandler]);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchItems(), fetchSummary(), fetchHandlers()]).finally(() => setLoading(false));
        const id = window.setInterval(() => {
            fetchItems();
            fetchSummary();
        }, 12000);
        return () => window.clearInterval(id);
    }, [fetchHandlers, fetchItems, fetchSummary]);

    useEffect(() => {
        setStatusFilter('ALL');
        setSelectedItemId(null);
    }, [viewMode]);

    useEffect(() => {
        return () => {
            if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        };
    }, [pendingPreview]);

    const handleCreateReport = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...reportForm,
                found_date: reportForm.found_date || null,
                found_location: reportForm.found_location || null,
                contact_note: reportForm.contact_note || null,
            };
            const createRes = await api.post('/lost-found/items', payload);
            const itemId = createRes.data?.data?.id as string;
            if (itemId && pendingFile) {
                const shouldUpload = await confirmAction({
                    title: txt.attachMediaTitle,
                    description: txt.attachMediaDescription,
                    confirmText: txt.sendSelectedMedia,
                    cancelText: txt.skipForNow,
                });
                if (shouldUpload) {
                    const formData = new FormData();
                    formData.append('file', pendingFile);
                    await api.post(`/lost-found/items/${itemId}/media`, formData);
                }
            }
            setReportOpen(false);
            setReportForm({
                title: '',
                description: '',
                category: '',
                found_date: '',
                found_location: '',
                contact_note: '',
            });
            setPendingFile(null);
            if (pendingPreview) {
                URL.revokeObjectURL(pendingPreview);
                setPendingPreview(null);
            }
            await fetchItems();
            await fetchSummary();
            showToast(txt.reportSubmitted, 'success');
        } catch {
            showToast(txt.reportSubmitFailed, 'error');
        } finally {
            setSaving(false);
        }
    };

    const addComment = async () => {
        if (!selectedItem || !commentText.trim()) return;
        try {
            await api.post(`/lost-found/items/${selectedItem.id}/comments`, { text: commentText.trim() });
            setCommentText('');
            await fetchItems();
            showToast(txt.commentAdded, 'success');
        } catch {
            showToast(txt.commentFailed, 'error');
        }
    };

    const updateStatus = async (status: LostFoundStatus) => {
        if (!selectedItem || !isHandler) return;
        try {
            await api.post(`/lost-found/items/${selectedItem.id}/status`, {
                status,
                note: statusNote.trim() || null,
            });
            setStatusNote('');
            await fetchItems();
            await fetchSummary();
            showToast(txt.statusUpdated, 'success');
        } catch {
            showToast(txt.statusUpdateFailed, 'error');
        }
    };

    const assignItem = async (assigneeId: string) => {
        if (!selectedItem || !isHandler || !assigneeId) return;
        try {
            await api.post(`/lost-found/items/${selectedItem.id}/assign`, { assignee_id: assigneeId });
            await fetchItems();
            showToast(txt.assignedSuccess, 'success');
        } catch {
            showToast(txt.assignFailed, 'error');
        }
    };

    const pickMedia = async (e: ChangeEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const mime = file.type.toLowerCase().split(';')[0].trim();
        if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
            showToast(txt.onlyMediaAllowed, 'error');
            return;
        }
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        setPendingFile(file);
        setPendingPreview(URL.createObjectURL(file));
    };

    const uploadMediaToSelected = async () => {
        if (!selectedItem || !pendingFile) return;
        const ok = await confirmAction({
            title: txt.sendMediaTitle,
            description: txt.sendMediaDescription,
            confirmText: txt.sendMedia,
            cancelText: txt.cancel,
        });
        if (!ok) return;
        try {
            const formData = new FormData();
            formData.append('file', pendingFile);
            await api.post(`/lost-found/items/${selectedItem.id}/media`, formData);
            showToast(txt.mediaUploaded, 'success');
            setPendingFile(null);
            if (pendingPreview) {
                URL.revokeObjectURL(pendingPreview);
                setPendingPreview(null);
            }
            await fetchItems();
        } catch {
            showToast(txt.mediaUploadFailed, 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-sm text-muted-foreground">{txt.loading}</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{txt.title}</h1>
                    <p className="text-sm text-muted-foreground">{txt.subtitle}</p>
                </div>
                {isAdmin && (
                    <div className="flex bg-muted p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setViewMode('ACTIVE')}
                            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                                viewMode === 'ACTIVE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {txt.active}
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('ARCHIVE')}
                            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                                viewMode === 'ARCHIVE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {txt.archive}
                        </button>
                    </div>
                )}
            </div>

            {isHandler && summary && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">{txt.openQueue}</p><p className="text-xl font-bold">{summary.total_open}</p></div>
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">{txt.reported}</p><p className="text-xl font-bold">{summary.reported}</p></div>
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">{txt.underReview}</p><p className="text-xl font-bold">{summary.under_review}</p></div>
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">{txt.readyForPickup}</p><p className="text-xl font-bold">{summary.ready_for_pickup}</p></div>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <section className="card border border-border/90 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-3">
                        <p className="text-sm font-semibold text-foreground">{viewMode === 'ARCHIVE' ? txt.archive : txt.reports}</p>
                        {viewMode === 'ACTIVE' && (
                            <button type="button" className="btn-primary text-xs !px-3 !py-1.5" onClick={() => setReportOpen(true)}>
                                {txt.reportItem}
                            </button>
                        )}
                    </div>
                    <div className="space-y-3 border-b border-border/80 bg-muted/10 px-3 py-3">
                    <div className="field-with-icon rounded border border-border/90 bg-background">
                        <Search size={14} className="field-icon" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input-with-icon w-full bg-transparent py-1.5 text-sm outline-none"
                            placeholder={txt.searchReports}
                        />
                    </div>
                    <div className="field-with-icon">
                        <ListFilter size={14} className="field-icon" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter((e.target.value || 'ALL') as LostFoundStatus | 'ALL')}
                            className="input select-with-icon w-full text-sm !text-foreground !bg-card border border-border/90"
                            style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}
                        >
                            <option value="ALL" style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>
                                {viewMode === 'ARCHIVE' ? txt.allArchived : txt.allActive}
                            </option>
                            {visibleStatusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value} style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>
                                    {getStatusLabel(opt.value)}
                                </option>
                            ))}
                        </select>
                    </div>
                    </div>

                    <div className="max-h-[60vh] overflow-auto space-y-2 p-3">
                        {filteredItems.length === 0 && (
                            <div className="rounded-md border border-dashed border-border/90 px-3 py-6 text-center text-sm text-muted-foreground">
                                {viewMode === 'ARCHIVE' ? txt.noArchivedReports : txt.noReports}
                            </div>
                        )}
                        {filteredItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedItemId(item.id)}
                                className={`w-full rounded-md border px-3 py-2 text-start transition-colors ${selectedItemId === item.id ? 'border-primary bg-primary/10' : 'border-border/90 bg-card hover:bg-muted/30'}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold truncate">{item.title}</p>
                                    <span className={statusBadgeClass(item.status)}>{getStatusLabel(item.status)}</span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground truncate">{item.category} - {item.reporter.full_name || item.reporter.email}</p>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="card border border-border/90 p-4">
                    {!selectedItem && <p className="text-sm text-muted-foreground">{txt.selectReport}</p>}
                    {selectedItem && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-bold">{selectedItem.title}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">{selectedItem.description}</p>
                                </div>
                                <span className={statusBadgeClass(selectedItem.status)}>{getStatusLabel(selectedItem.status)}</span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border border-border/90 bg-muted/10 p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{txt.itemDetails}</p>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">{txt.category}</span> {selectedItem.category}</p>
                                        <p><span className="text-muted-foreground">{txt.foundDate}</span> {selectedItem.found_date || txt.notAvailable}</p>
                                        <p><span className="text-muted-foreground">{txt.location}</span> {selectedItem.found_location || txt.notAvailable}</p>
                                        <p><span className="text-muted-foreground">{txt.contactNote}</span> {selectedItem.contact_note || txt.notAvailable}</p>
                                    </div>
                                </div>
                                <div className="rounded-md border border-border/90 bg-muted/10 p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{txt.people}</p>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">{txt.reporter}</span> {selectedItem.reporter.full_name || selectedItem.reporter.email}</p>
                                        <p><span className="text-muted-foreground">{txt.assignee}</span> {selectedItem.assignee?.full_name || selectedItem.assignee?.email || txt.unassigned}</p>
                                    </div>
                                </div>
                            </div>

                            {isHandler && (
                                <div className="rounded-md border border-border/90 bg-muted/20 p-3 space-y-3">
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-xs text-muted-foreground">{txt.assignTo}</label>
                                            <select
                                                className="input text-sm !text-foreground !bg-card border border-border/90"
                                                style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}
                                                value={selectedItem.assignee?.id || ''}
                                                onChange={(e) => assignItem(e.target.value)}
                                            >
                                                <option value="" style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>{txt.selectHandler}</option>
                                                {handlers.map((handler) => (
                                                    <option key={handler.id} value={handler.id} style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>
                                                        {(handler.full_name || handler.email)} ({handler.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs text-muted-foreground">{txt.statusNoteOptional}</label>
                                            <input
                                                className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                                value={statusNote}
                                                onChange={(e) => setStatusNote(e.target.value)}
                                                placeholder={txt.statusReasonPlaceholder}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                        {statusOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                className="btn-ghost text-xs justify-center"
                                                onClick={() => updateStatus(opt.value)}
                                            >
                                                {getStatusLabel(opt.value)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-md border border-border/90 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold">{txt.media}</h3>
                                    <label className="btn-ghost cursor-pointer text-xs">
                                        <Upload size={14} />
                                        {txt.addMedia}
                                        <input type="file" accept="image/*,video/*" className="hidden" onChange={pickMedia} />
                                    </label>
                                </div>
                                {pendingPreview && (
                                    <div className="rounded-md border border-border/90 bg-muted/20 p-2">
                                        <p className="mb-2 text-xs text-muted-foreground">{txt.previewBeforeSending}</p>
                                        {pendingFile?.type.startsWith('video/') ? (
                                            <video src={pendingPreview} controls className="max-h-56 w-full rounded border border-border" />
                                        ) : (
                                            <Image src={pendingPreview} alt={txt.pendingPreviewAlt} width={500} height={320} className="h-auto max-h-56 w-full rounded border border-border object-contain" unoptimized />
                                        )}
                                        <div className="mt-2 flex gap-2">
                                            <button type="button" className="btn-primary text-xs" onClick={uploadMediaToSelected}>{txt.confirmUpload}</button>
                                            <button
                                                type="button"
                                                className="btn-ghost text-xs"
                                                onClick={() => {
                                                    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
                                                    setPendingPreview(null);
                                                    setPendingFile(null);
                                                }}
                                            >
                                                {txt.cancel}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {selectedItem.media.length === 0 && (
                                    <p className="text-xs text-muted-foreground">{txt.noMedia}</p>
                                )}
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                    {selectedItem.media.map((m) => {
                                        const src = resolveMediaUrl(m.media_url);
                                        const isVideo = m.media_mime.startsWith('video/');
                                        return (
                                            <div key={m.id} className="rounded-md border border-border/90 bg-card p-2">
                                                {isVideo ? (
                                                    <video src={src} controls className="max-h-64 w-full rounded object-contain bg-black/20" />
                                                ) : (
                                                    <Image
                                                        src={src}
                                                        alt={txt.attachmentAlt}
                                                        width={400}
                                                        height={240}
                                                        className="h-auto max-h-64 w-full rounded object-contain bg-black/20"
                                                        unoptimized
                                                        loading="eager"
                                                    />
                                                )}
                                                <p className="mt-1 text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-md border border-border/90 p-3 space-y-2">
                                <h3 className="text-sm font-semibold">{txt.timelineComments}</h3>
                                <div className="max-h-56 overflow-auto space-y-2 ltr:pr-1 rtl:pl-1">
                                    {selectedItem.comments.length === 0 && (
                                        <p className="text-xs text-muted-foreground">{txt.noComments}</p>
                                    )}
                                    {selectedItem.comments.map((comment) => (
                                        <div key={comment.id} className="rounded-md border border-border/90 bg-muted/20 px-2 py-1.5">
                                            <p className="text-xs">
                                                <span className="font-semibold">{comment.author.full_name || comment.author.email}</span>
                                                <span className="ltr:ml-1 rtl:mr-1 text-muted-foreground">({comment.author.role})</span>
                                            </p>
                                            <p className="text-sm">{comment.text}</p>
                                            <p className="text-[11px] text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                        placeholder={txt.addCommentPlaceholder}
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                    />
                                    <button type="button" className="btn-primary !px-4" onClick={addComment}>{txt.send}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <Modal isOpen={reportOpen} onClose={() => setReportOpen(false)} title={txt.reportModalTitle}>
                <form className="space-y-3" onSubmit={handleCreateReport}>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">{txt.fieldTitle}</label>
                        <input
                            required
                            className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.title}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, title: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">{txt.fieldDescription}</label>
                        <textarea
                            required
                            className="min-h-24 w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.description}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs text-muted-foreground">{txt.fieldCategory}</label>
                            <input
                                required
                                className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                value={reportForm.category}
                                onChange={(e) => setReportForm((prev) => ({ ...prev, category: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs text-muted-foreground">{txt.fieldFoundDate}</label>
                            <input
                                type="date"
                                className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                value={reportForm.found_date}
                                onChange={(e) => setReportForm((prev) => ({ ...prev, found_date: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">{txt.fieldFoundLocation}</label>
                        <input
                            className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.found_location}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, found_location: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">{txt.fieldContactNote}</label>
                        <input
                            className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.contact_note}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, contact_note: e.target.value }))}
                        />
                    </div>
                    <div className="rounded-md border border-border/90 bg-muted/20 p-3 space-y-2">
                        <label className="block text-xs text-muted-foreground">{txt.optionalEvidence}</label>
                        <label className="btn-ghost inline-flex cursor-pointer text-xs !border-border/90">
                            <Upload size={14} />
                            {txt.selectFile}
                            <input type="file" accept="image/*,video/*" className="hidden" onChange={pickMedia} />
                        </label>
                        {pendingPreview && (
                            <div>
                                {pendingFile?.type.startsWith('video/') ? (
                                    <video src={pendingPreview} controls className="max-h-48 w-full rounded border border-border" />
                                ) : (
                                    <Image src={pendingPreview} alt={txt.selectedEvidenceAlt} width={500} height={320} className="h-auto max-h-48 w-full rounded border border-border object-contain" unoptimized />
                                )}
                                <p className="mt-1 text-[11px] text-muted-foreground">{txt.submitHint}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" className="btn-ghost" onClick={() => setReportOpen(false)} disabled={saving}>{txt.cancel}</button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? txt.submitting : txt.submitReport}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

