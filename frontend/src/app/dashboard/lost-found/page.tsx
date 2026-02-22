'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ListFilter, Search, Upload } from 'lucide-react';

import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';
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

const statusOptions: Array<{ value: LostFoundStatus; label: string }> = [
    { value: 'REPORTED', label: 'Reported' },
    { value: 'UNDER_REVIEW', label: 'Under Review' },
    { value: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'DISPOSED', label: 'Disposed' },
];

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
    const { user } = useAuth();
    const { showToast, confirm: confirmAction } = useFeedback();
    const isHandler = handlerRoles.includes(user?.role || '');

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

    const fetchItems = useCallback(async () => {
        try {
            const params = statusFilter === 'ALL' ? {} : { status: statusFilter };
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
    }, [selectedItemId, statusFilter]);

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
                    title: 'Attach media',
                    description: 'Send this selected media with the report now?',
                    confirmText: 'Send media',
                    cancelText: 'Skip for now',
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
            showToast('Report submitted.', 'success');
        } catch {
            showToast('Could not submit report.', 'error');
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
            showToast('Comment added.', 'success');
        } catch {
            showToast('Could not add comment.', 'error');
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
            showToast('Status updated.', 'success');
        } catch {
            showToast('Status change failed.', 'error');
        }
    };

    const assignItem = async (assigneeId: string) => {
        if (!selectedItem || !isHandler || !assigneeId) return;
        try {
            await api.post(`/lost-found/items/${selectedItem.id}/assign`, { assignee_id: assigneeId });
            await fetchItems();
            showToast('Assigned successfully.', 'success');
        } catch {
            showToast('Could not assign item.', 'error');
        }
    };

    const pickMedia = async (e: ChangeEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const mime = file.type.toLowerCase().split(';')[0].trim();
        if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
            showToast('Only image/video files are supported.', 'error');
            return;
        }
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        setPendingFile(file);
        setPendingPreview(URL.createObjectURL(file));
    };

    const uploadMediaToSelected = async () => {
        if (!selectedItem || !pendingFile) return;
        const ok = await confirmAction({
            title: 'Send media',
            description: 'Send this file to the selected Lost & Found report?',
            confirmText: 'Send',
            cancelText: 'Cancel',
        });
        if (!ok) return;
        try {
            const formData = new FormData();
            formData.append('file', pendingFile);
            await api.post(`/lost-found/items/${selectedItem.id}/media`, formData);
            showToast('Media uploaded.', 'success');
            setPendingFile(null);
            if (pendingPreview) {
                URL.revokeObjectURL(pendingPreview);
                setPendingPreview(null);
            }
            await fetchItems();
        } catch {
            showToast('Media upload failed.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-sm text-muted-foreground">Loading lost & found...</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Lost & Found</h1>
                    <p className="text-sm text-muted-foreground">Report items and track their handling lifecycle.</p>
                </div>
            </div>

            {isHandler && summary && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">Open Queue</p><p className="text-xl font-bold">{summary.total_open}</p></div>
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">Reported</p><p className="text-xl font-bold">{summary.reported}</p></div>
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">Under Review</p><p className="text-xl font-bold">{summary.under_review}</p></div>
                    <div className="card p-3 min-w-0 border border-border/90"><p className="text-xs text-muted-foreground">Ready for Pickup</p><p className="text-xl font-bold">{summary.ready_for_pickup}</p></div>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <section className="card border border-border/90 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-3">
                        <p className="text-sm font-semibold text-foreground">Reports</p>
                        <button type="button" className="btn-primary text-xs !px-3 !py-1.5" onClick={() => setReportOpen(true)}>
                            Report Item
                        </button>
                    </div>
                    <div className="space-y-3 border-b border-border/80 bg-muted/10 px-3 py-3">
                    <div className="flex items-center gap-2 rounded border border-border/90 bg-background px-2 py-1.5">
                        <Search size={14} className="text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-transparent text-sm outline-none"
                            placeholder="Search reports"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <ListFilter size={14} className="text-muted-foreground" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter((e.target.value || 'ALL') as LostFoundStatus | 'ALL')}
                            className="input text-sm !text-foreground !bg-card border border-border/90"
                            style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}
                        >
                            <option value="ALL" style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>All statuses</option>
                            {statusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value} style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    </div>

                    <div className="max-h-[60vh] overflow-auto space-y-2 p-3">
                        {filteredItems.length === 0 && (
                            <div className="rounded-md border border-dashed border-border/90 px-3 py-6 text-center text-sm text-muted-foreground">
                                No reports found.
                            </div>
                        )}
                        {filteredItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedItemId(item.id)}
                                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${selectedItemId === item.id ? 'border-primary bg-primary/10' : 'border-border/90 bg-card hover:bg-muted/30'}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold truncate">{item.title}</p>
                                    <span className={statusBadgeClass(item.status)}>{item.status.replaceAll('_', ' ')}</span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground truncate">{item.category} - {item.reporter.full_name || item.reporter.email}</p>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="card border border-border/90 p-4">
                    {!selectedItem && <p className="text-sm text-muted-foreground">Select a report to view details.</p>}
                    {selectedItem && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-bold">{selectedItem.title}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">{selectedItem.description}</p>
                                </div>
                                <span className={statusBadgeClass(selectedItem.status)}>{selectedItem.status.replaceAll('_', ' ')}</span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border border-border/90 bg-muted/10 p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item Details</p>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">Category:</span> {selectedItem.category}</p>
                                        <p><span className="text-muted-foreground">Found date:</span> {selectedItem.found_date || 'N/A'}</p>
                                        <p><span className="text-muted-foreground">Location:</span> {selectedItem.found_location || 'N/A'}</p>
                                        <p><span className="text-muted-foreground">Contact note:</span> {selectedItem.contact_note || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="rounded-md border border-border/90 bg-muted/10 p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</p>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">Reporter:</span> {selectedItem.reporter.full_name || selectedItem.reporter.email}</p>
                                        <p><span className="text-muted-foreground">Assignee:</span> {selectedItem.assignee?.full_name || selectedItem.assignee?.email || 'Unassigned'}</p>
                                    </div>
                                </div>
                            </div>

                            {isHandler && (
                                <div className="rounded-md border border-border/90 bg-muted/20 p-3 space-y-3">
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-xs text-muted-foreground">Assign To</label>
                                            <select
                                                className="input text-sm !text-foreground !bg-card border border-border/90"
                                                style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}
                                                value={selectedItem.assignee?.id || ''}
                                                onChange={(e) => assignItem(e.target.value)}
                                            >
                                                <option value="" style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>Select handler</option>
                                                {handlers.map((handler) => (
                                                    <option key={handler.id} value={handler.id} style={{ color: '#f3f4f6', backgroundColor: '#0f172a' }}>
                                                        {(handler.full_name || handler.email)} ({handler.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs text-muted-foreground">Status Note (optional)</label>
                                            <input
                                                className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                                value={statusNote}
                                                onChange={(e) => setStatusNote(e.target.value)}
                                                placeholder="Reason / handling note"
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
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-md border border-border/90 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold">Media</h3>
                                    <label className="btn-ghost cursor-pointer text-xs">
                                        <Upload size={14} />
                                        Add Media
                                        <input type="file" accept="image/*,video/*" className="hidden" onChange={pickMedia} />
                                    </label>
                                </div>
                                {pendingPreview && (
                                    <div className="rounded-md border border-border/90 bg-muted/20 p-2">
                                        <p className="mb-2 text-xs text-muted-foreground">Preview before sending</p>
                                        {pendingFile?.type.startsWith('video/') ? (
                                            <video src={pendingPreview} controls className="max-h-56 w-full rounded border border-border" />
                                        ) : (
                                            <Image src={pendingPreview} alt="Pending preview" width={500} height={320} className="h-auto max-h-56 w-full rounded border border-border object-contain" unoptimized />
                                        )}
                                        <div className="mt-2 flex gap-2">
                                            <button type="button" className="btn-primary text-xs" onClick={uploadMediaToSelected}>Confirm Upload</button>
                                            <button
                                                type="button"
                                                className="btn-ghost text-xs"
                                                onClick={() => {
                                                    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
                                                    setPendingPreview(null);
                                                    setPendingFile(null);
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {selectedItem.media.length === 0 && (
                                    <p className="text-xs text-muted-foreground">No media uploaded yet.</p>
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
                                                        alt="Attachment"
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
                                <h3 className="text-sm font-semibold">Timeline & Comments</h3>
                                <div className="max-h-56 overflow-auto space-y-2 pr-1">
                                    {selectedItem.comments.length === 0 && (
                                        <p className="text-xs text-muted-foreground">No comments yet.</p>
                                    )}
                                    {selectedItem.comments.map((comment) => (
                                        <div key={comment.id} className="rounded-md border border-border/90 bg-muted/20 px-2 py-1.5">
                                            <p className="text-xs">
                                                <span className="font-semibold">{comment.author.full_name || comment.author.email}</span>
                                                <span className="ml-1 text-muted-foreground">({comment.author.role})</span>
                                            </p>
                                            <p className="text-sm">{comment.text}</p>
                                            <p className="text-[11px] text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                        placeholder="Add follow-up comment"
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                    />
                                    <button type="button" className="btn-primary !px-4" onClick={addComment}>Send</button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <Modal isOpen={reportOpen} onClose={() => setReportOpen(false)} title="Report Lost or Found Item">
                <form className="space-y-3" onSubmit={handleCreateReport}>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">Title</label>
                        <input
                            required
                            className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.title}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, title: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">Description</label>
                        <textarea
                            required
                            className="min-h-24 w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.description}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs text-muted-foreground">Category</label>
                            <input
                                required
                                className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                value={reportForm.category}
                                onChange={(e) => setReportForm((prev) => ({ ...prev, category: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs text-muted-foreground">Found Date</label>
                            <input
                                type="date"
                                className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                                value={reportForm.found_date}
                                onChange={(e) => setReportForm((prev) => ({ ...prev, found_date: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">Found Location</label>
                        <input
                            className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.found_location}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, found_location: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs text-muted-foreground">Contact Note</label>
                        <input
                            className="w-full rounded-md border border-border/90 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/70"
                            value={reportForm.contact_note}
                            onChange={(e) => setReportForm((prev) => ({ ...prev, contact_note: e.target.value }))}
                        />
                    </div>
                    <div className="rounded-md border border-border/90 bg-muted/20 p-3 space-y-2">
                        <label className="block text-xs text-muted-foreground">Optional photo/video evidence</label>
                        <label className="btn-ghost inline-flex cursor-pointer text-xs !border-border/90">
                            <Upload size={14} />
                            Select file
                            <input type="file" accept="image/*,video/*" className="hidden" onChange={pickMedia} />
                        </label>
                        {pendingPreview && (
                            <div>
                                {pendingFile?.type.startsWith('video/') ? (
                                    <video src={pendingPreview} controls className="max-h-48 w-full rounded border border-border" />
                                ) : (
                                    <Image src={pendingPreview} alt="Selected evidence" width={500} height={320} className="h-auto max-h-48 w-full rounded border border-border object-contain" unoptimized />
                                )}
                                <p className="mt-1 text-[11px] text-muted-foreground">You will confirm sending this file at submit time.</p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" className="btn-ghost" onClick={() => setReportOpen(false)} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? 'Submitting...' : 'Submit Report'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
