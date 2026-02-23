'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, Paperclip, Send, Volume2, Shield, PlusCircle, Search, Mic, Square, Play, Pause, Check, X, ArrowDown } from 'lucide-react';
import Image from 'next/image';

import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/lib/tokenStorage';
import { useFeedback } from '@/components/FeedbackProvider';

interface ChatUser {
    id: string;
    full_name?: string | null;
    email: string;
    role: string;
}

interface ChatMessage {
    id: string;
    thread_id: string;
    sender_id: string;
    message_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | string;
    text_content?: string | null;
    media_url?: string | null;
    media_mime?: string | null;
    voice_duration_seconds?: number | null;
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

interface PendingMediaUpload {
    file: File;
    previewUrl: string;
    kind: 'image' | 'video';
}

interface PendingVoiceUpload {
    file: File;
    previewUrl: string;
    duration: number;
}

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

function formatSeconds(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ChatAudioPlayer({ src, initialDurationSeconds }: { src: string; initialDurationSeconds?: number | null }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(initialDurationSeconds && initialDurationSeconds > 0 ? initialDurationSeconds : 0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onLoadedMetadata = () => {
            if (audio.duration && Number.isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };
        const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
        const onEnded = () => setPlaying(false);
        const onPause = () => setPlaying(false);
        const onPlay = () => setPlaying(true);

        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('play', onPlay);

        return () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('play', onPlay);
        };
    }, []);

    const togglePlay = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
            return;
        }
        try {
            await audio.play();
        } catch {
            // ignore play errors from browser policies
        }
    };

    const onSeek = (value: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = value;
        setCurrentTime(value);
    };

    const resolvedDuration = duration > 0 ? duration : (initialDurationSeconds || 0);

    return (
        <div className="mt-2 rounded-2xl border border-border bg-muted/30 px-3 py-2">
            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={togglePlay}
                    className="h-8 w-8 rounded-full bg-primary/20 text-primary inline-flex items-center justify-center hover:bg-primary/30 transition-colors"
                    aria-label={playing ? 'Pause audio' : 'Play audio'}
                >
                    {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
                <div className="min-w-0 flex-1">
                    <input
                        type="range"
                        min={0}
                        max={Math.max(resolvedDuration, 1)}
                        step={0.1}
                        value={Math.min(currentTime, Math.max(resolvedDuration, 1))}
                        onChange={(e) => onSeek(Number(e.target.value))}
                        className="w-full accent-orange-500"
                    />
                </div>
                <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                    {formatSeconds(currentTime)} / {formatSeconds(resolvedDuration)}
                </span>
                <Volume2 size={14} className="text-muted-foreground" />
            </div>
        </div>
    );
}

export default function ChatPage() {
    const { user } = useAuth();
    const { showToast, confirm: confirmAction } = useFeedback();
    const searchParams = useSearchParams();
    const initialThread = searchParams.get('thread');

    const isAdmin = user?.role === 'ADMIN';
    const isAllowedRole = ['ADMIN', 'COACH', 'CUSTOMER'].includes(user?.role || '');

    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThread);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [contacts, setContacts] = useState<ChatUser[]>([]);
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [contactSearch, setContactSearch] = useState('');
    const [creatingThread, setCreatingThread] = useState(false);
    const [text, setText] = useState('');
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [pendingMediaUpload, setPendingMediaUpload] = useState<PendingMediaUpload | null>(null);
    const [pendingVoiceUpload, setPendingVoiceUpload] = useState<PendingVoiceUpload | null>(null);
    const [socketConnected, setSocketConnected] = useState(false);
    const [adminCoachFilter, setAdminCoachFilter] = useState('');
    const [adminCustomerFilter, setAdminCustomerFilter] = useState('');
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const messageListRef = useRef<HTMLDivElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const recordTimerRef = useRef<number | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const directSendOnStopRef = useRef(false);
    const wasNearBottomRef = useRef(true);

    const selectedThread = useMemo(
        () => threads.find((thread) => thread.id === selectedThreadId) || null,
        [threads, selectedThreadId]
    );

    const counterpartName = (thread: ChatThread) => {
        if (isAdmin) return `${thread.customer.full_name || thread.customer.email} <-> ${thread.coach.full_name || thread.coach.email}`;
        if (user?.role === 'COACH') return thread.customer.full_name || thread.customer.email;
        return thread.coach.full_name || thread.coach.email;
    };

    const getAdminSenderLabel = (message: ChatMessage): string => {
        if (!selectedThread) return 'Unknown sender';
        if (message.sender_id === selectedThread.customer.id) {
            return `Client: ${selectedThread.customer.full_name || selectedThread.customer.email}`;
        }
        if (message.sender_id === selectedThread.coach.id) {
            return `Coach: ${selectedThread.coach.full_name || selectedThread.coach.email}`;
        }
        return 'Unknown sender';
    };

    const fetchThreads = async () => {
        if (!isAllowedRole) return;
        try {
            const params: Record<string, string | number> = { limit: 50, sort_by: 'last_message_at', sort_order: 'desc' };
            if (isAdmin && adminCoachFilter) params.coach_id = adminCoachFilter;
            if (isAdmin && adminCustomerFilter) params.customer_id = adminCustomerFilter;
            const response = await api.get('/chat/threads', { params });
            const rows = response.data?.data || [];
            setThreads(rows);
            if (!selectedThreadId && rows.length > 0) {
                setSelectedThreadId(rows[0].id);
            }
        } catch {
            setThreads([]);
        }
    };

    const fetchMessages = async (threadId: string) => {
        try {
            const response = await api.get(`/chat/threads/${threadId}/messages`, { params: { limit: 100 } });
            const rows = response.data?.data || [];
            setMessages(rows);
            if (!isAdmin) {
                await api.post(`/chat/threads/${threadId}/read`);
            }
        } catch {
            setMessages([]);
        }
    };

    const fetchContacts = async () => {
        if (!isAllowedRole) return;
        try {
            const response = await api.get('/chat/contacts');
            setContacts(response.data?.data || []);
        } catch {
            setContacts([]);
        }
    };

    const openOrCreateThread = async (contactId: string) => {
        if (!contactId || isAdmin) return;
        setCreatingThread(true);
        try {
            const payload = user?.role === 'CUSTOMER' ? { coach_id: contactId } : { customer_id: contactId };
            const response = await api.post('/chat/threads', payload);
            const thread = response.data?.data as ChatThread;
            await fetchThreads();
            setSelectedThreadId(thread.id);
            setContactSearch('');
            setNewChatOpen(false);
        } catch {
            showToast('Could not open chat.', 'error');
        } finally {
            setCreatingThread(false);
        }
    };

    const sendText = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedThreadId || !text.trim() || isAdmin) return;
        try {
            await api.post(`/chat/threads/${selectedThreadId}/messages`, { text_content: text.trim() });
            setText('');
            await fetchMessages(selectedThreadId);
            await fetchThreads();
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            const isNetworkError = (err as { message?: string })?.message === 'Network Error';
            if (isNetworkError) {
                showToast('Cannot reach server. Check backend is running on http://127.0.0.1:8000.', 'error');
            } else {
                showToast(typeof detail === 'string' && detail ? detail : 'Failed to send message.', 'error');
            }
        }
    };

    const uploadAttachment = async (file: File, voiceDurationSeconds?: number) => {
        if (!selectedThreadId || isAdmin) return;

        const formData = new FormData();
        formData.append('file', file);
        if (typeof voiceDurationSeconds === 'number' && voiceDurationSeconds > 0) {
            formData.append('voice_duration_seconds', String(voiceDurationSeconds));
        }
        setUploading(true);
        try {
            await api.post(`/chat/threads/${selectedThreadId}/attachments`, formData);
            await fetchMessages(selectedThreadId);
            await fetchThreads();
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            const isNetworkError = (err as { message?: string })?.message === 'Network Error';
            if (isNetworkError) {
                showToast('Cannot reach server. Check backend is running on http://127.0.0.1:8000.', 'error');
            } else {
                showToast(typeof detail === 'string' && detail ? detail : 'Attachment upload failed.', 'error');
            }
        } finally {
            setUploading(false);
        }
    };

    const cancelPendingUpload = () => {
        if (pendingMediaUpload) {
            URL.revokeObjectURL(pendingMediaUpload.previewUrl);
        }
        setPendingMediaUpload(null);
    };

    const queueOrUploadAttachment = async (file: File) => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            await uploadAttachment(file);
            return;
        }
        const previewUrl = URL.createObjectURL(file);
        setPendingMediaUpload({
            file,
            previewUrl,
            kind: isImage ? 'image' : 'video',
        });
    };

    const confirmPendingUpload = async () => {
        if (!pendingMediaUpload) return;
        const { file, previewUrl } = pendingMediaUpload;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const approved = await confirmAction({
            title: 'Send Media',
            description: `Send "${file.name}" (${sizeMb} MB)?`,
            confirmText: 'Send',
            cancelText: 'Cancel',
        });
        if (approved) {
            await uploadAttachment(file);
        }
        URL.revokeObjectURL(previewUrl);
        setPendingMediaUpload(null);
    };

    const startVoiceRecording = async () => {
        if (recording || isAdmin || !selectedThreadId) return;
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            showToast('Voice recording is not supported on this browser.', 'error');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            setRecordSeconds(0);
            setRecording(true);

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            recorder.onstop = async () => {
                const mimeType = recorder.mimeType || 'audio/webm';
                const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
                const durationAtStop = recordSeconds;
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                if (blob.size > 0) {
                    const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mimeType });
                    if (directSendOnStopRef.current) {
                        await uploadAttachment(file, durationAtStop);
                    } else {
                        const previewUrl = URL.createObjectURL(blob);
                        setPendingVoiceUpload({
                            file,
                            previewUrl,
                            duration: durationAtStop,
                        });
                    }
                }
                if (recordTimerRef.current) {
                    window.clearInterval(recordTimerRef.current);
                    recordTimerRef.current = null;
                }
                setRecordSeconds(0);
                setRecording(false);
                directSendOnStopRef.current = false;
                stream.getTracks().forEach((track) => track.stop());
                mediaStreamRef.current = null;
            };

            recorder.start();
            recordTimerRef.current = window.setInterval(() => {
                setRecordSeconds((prev) => prev + 1);
            }, 1000);
        } catch {
            setRecording(false);
            showToast('Unable to access microphone.', 'error');
        }
    };

    const stopVoiceRecording = () => {
        if (!recording) return;
        directSendOnStopRef.current = false;
        mediaRecorderRef.current?.stop();
    };

    const stopAndSendVoiceRecording = () => {
        if (!recording) return;
        directSendOnStopRef.current = true;
        mediaRecorderRef.current?.stop();
    };

    useEffect(() => {
        fetchThreads();
        fetchContacts();
    }, [adminCoachFilter, adminCustomerFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (selectedThreadId) {
            fetchMessages(selectedThreadId);
        } else {
            setMessages([]);
        }
    }, [selectedThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (wasNearBottomRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleMessageListScroll = () => {
        const container = messageListRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const nearBottom = distanceFromBottom < 100;
        wasNearBottomRef.current = nearBottom;
        setShowJumpToLatest(!nearBottom);
    };

    const jumpToLatest = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        wasNearBottomRef.current = true;
        setShowJumpToLatest(false);
    };

    useEffect(() => {
        return () => {
            if (recordTimerRef.current) {
                window.clearInterval(recordTimerRef.current);
                recordTimerRef.current = null;
            }
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
            if (pendingMediaUpload) {
                URL.revokeObjectURL(pendingMediaUpload.previewUrl);
            }
            if (pendingVoiceUpload) {
                URL.revokeObjectURL(pendingVoiceUpload.previewUrl);
            }
        };
    }, [pendingMediaUpload, pendingVoiceUpload]);

    const cancelPendingVoiceUpload = () => {
        if (pendingVoiceUpload) {
            URL.revokeObjectURL(pendingVoiceUpload.previewUrl);
        }
        setPendingVoiceUpload(null);
    };

    const confirmPendingVoiceUpload = async () => {
        if (!pendingVoiceUpload) return;
        const approved = await confirmAction({
            title: 'Send Voice Note',
            description: `Send this voice note (${formatSeconds(pendingVoiceUpload.duration)})?`,
            confirmText: 'Send',
            cancelText: 'Cancel',
        });
        if (!approved) return;
        await uploadAttachment(pendingVoiceUpload.file, pendingVoiceUpload.duration);
        URL.revokeObjectURL(pendingVoiceUpload.previewUrl);
        setPendingVoiceUpload(null);
    };

    useEffect(() => {
        const token = getAccessToken();
        if (!token || !isAllowedRole) return;
        const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:8000';
        const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
        const apiOrigin = normalizedApiUrl.endsWith('/api/v1')
            ? normalizedApiUrl.slice(0, -'/api/v1'.length)
            : normalizedApiUrl;
        const wsBase = apiOrigin.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsBase}/api/v1/chat/ws?token=${encodeURIComponent(token)}`);

        ws.onopen = () => setSocketConnected(true);
        ws.onclose = () => setSocketConnected(false);
        ws.onerror = () => setSocketConnected(false);
        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload?.event === 'chat.message.created') {
                    fetchThreads();
                    if (payload.thread_id === selectedThreadId) {
                        setMessages((prev) => [...prev, payload.message]);
                        if (!isAdmin && selectedThreadId) {
                            api.post(`/chat/threads/${selectedThreadId}/read`).catch(() => { });
                        }
                    }
                }
                if (payload?.event === 'chat.read.updated') {
                    fetchThreads();
                }
            } catch {
                // no-op
            }
        };

        return () => ws.close();
    }, [isAllowedRole, isAdmin, selectedThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (socketConnected) return;
        const interval = window.setInterval(() => {
            fetchThreads();
            if (selectedThreadId) fetchMessages(selectedThreadId);
        }, 7000);
        return () => window.clearInterval(interval);
    }, [socketConnected, selectedThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isAllowedRole) {
        return (
            <div className="kpi-card">
                <h1 className="text-xl font-bold">Chat is unavailable for your role.</h1>
            </div>
        );
    }

    const coachContacts = contacts.filter((contact) => contact.role === 'COACH');
    const customerContacts = contacts.filter((contact) => contact.role === 'CUSTOMER');
    const availableContacts = user?.role === 'CUSTOMER' ? coachContacts : customerContacts;
    const filteredContacts = availableContacts.filter((contact) => {
        const query = contactSearch.trim().toLowerCase();
        if (!query) return true;
        const name = (contact.full_name || '').toLowerCase();
        const email = contact.email.toLowerCase();
        return name.includes(query) || email.includes(query);
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Chat</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isAdmin ? 'Admin chat monitor (read-only)' : 'Direct messaging with media support'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                <aside className="kpi-card space-y-3 !p-3">
                    {isAdmin && (
                        <div className="rounded-sm border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs px-2 py-1 inline-flex items-center gap-1">
                            <Shield size={12} /> Read-only
                        </div>
                    )}

                    {!isAdmin && (
                        <div className="space-y-2 border border-border p-2 rounded-sm">
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
                                    <label className="text-xs text-muted-foreground block">
                                        {user?.role === 'CUSTOMER' ? 'Search coaches' : 'Search clients'}
                                    </label>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            className="input-dark !pl-8"
                                            value={contactSearch}
                                            onChange={(e) => setContactSearch(e.target.value)}
                                            placeholder={user?.role === 'CUSTOMER' ? 'Type coach name/email...' : 'Type client name/email...'}
                                        />
                                    </div>
                                    <div className="max-h-44 overflow-y-auto hide-scrollbar space-y-1">
                                        {filteredContacts.map((contact) => (
                                            <button
                                                key={contact.id}
                                                type="button"
                                                onClick={() => openOrCreateThread(contact.id)}
                                                disabled={creatingThread}
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

                    {isAdmin && (
                        <div className="space-y-2 border border-border p-2 rounded-sm">
                            <label className="text-xs text-muted-foreground block">Coach filter</label>
                            <select className="input-dark" value={adminCoachFilter} onChange={(e) => setAdminCoachFilter(e.target.value)}>
                                <option value="">All coaches</option>
                                {coachContacts.map((contact) => (
                                    <option key={contact.id} value={contact.id}>{contact.full_name || contact.email}</option>
                                ))}
                            </select>
                            <label className="text-xs text-muted-foreground block">Customer filter</label>
                            <select className="input-dark" value={adminCustomerFilter} onChange={(e) => setAdminCustomerFilter(e.target.value)}>
                                <option value="">All customers</option>
                                {customerContacts.map((contact) => (
                                    <option key={contact.id} value={contact.id}>{contact.full_name || contact.email}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1 max-h-[60vh] lg:max-h-[65vh] xl:max-h-[70vh] overflow-y-auto hide-scrollbar pr-1">
                        {threads.map((thread) => (
                            <button
                                key={thread.id}
                                type="button"
                                onClick={() => setSelectedThreadId(thread.id)}
                                className={`w-full text-left border rounded-sm p-2 transition-colors ${selectedThreadId === thread.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold truncate">{counterpartName(thread)}</p>
                                    {!isAdmin && (thread.unread_count || 0) > 0 && <span className="badge badge-orange">{thread.unread_count}</span>}
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-1">
                                    {thread.last_message?.text_content || thread.last_message?.message_type || 'No messages yet'}
                                </p>
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="kpi-card !p-0 flex flex-col h-[70vh] lg:h-[75vh] xl:h-[80vh] relative min-w-0">
                    <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                        <MessageCircle size={16} className="text-primary" />
                        <p className="font-semibold text-sm">
                            {selectedThread ? counterpartName(selectedThread) : 'Select a conversation'}
                        </p>
                    </div>

                    <div ref={messageListRef} onScroll={handleMessageListScroll} className="flex-1 p-4 space-y-3 overflow-y-auto hide-scrollbar relative">
                        {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                        {messages.map((message) => {
                            const mine = message.sender_id === user?.id;
                            return (
                                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl border px-3 py-2 ${mine ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'}`}>
                                        {isAdmin && (
                                            <p className="text-[10px] text-muted-foreground mb-1">
                                                {getAdminSenderLabel(message)}
                                            </p>
                                        )}
                                        {message.text_content && <p className="text-sm whitespace-pre-wrap">{message.text_content}</p>}
                                        {message.media_url && message.media_mime?.startsWith('image/') && (
                                            <Image
                                                src={resolveMediaUrl(message.media_url)}
                                                alt="attachment"
                                                width={420}
                                                height={320}
                                                unoptimized
                                                className="mt-2 max-h-72 w-auto rounded-xl border border-border"
                                            />
                                        )}
                                        {message.media_url && message.media_mime?.startsWith('video/') && (
                                            <video controls src={resolveMediaUrl(message.media_url)} className="mt-2 max-h-72 rounded-xl border border-border" />
                                        )}
                                        {message.media_url && message.media_mime?.startsWith('audio/') && (
                                            <ChatAudioPlayer
                                                src={resolveMediaUrl(message.media_url)}
                                                initialDurationSeconds={message.voice_duration_seconds}
                                            />
                                        )}
                                        <p className="text-[10px] text-muted-foreground mt-1">{new Date(message.created_at).toLocaleString()}</p>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={bottomRef} />
                    </div>
                    {showJumpToLatest && (
                        <div className="absolute right-6 bottom-24 z-20">
                            <button
                                type="button"
                                onClick={jumpToLatest}
                                className="btn-primary !py-2 !px-3 shadow-sm"
                            >
                                <ArrowDown size={14} />
                                Latest
                            </button>
                        </div>
                    )}

                    {!isAdmin && selectedThreadId && (
                        <form onSubmit={sendText} className="border-t border-border p-3 space-y-2">
                            {recording && (
                                <div className="rounded-sm border border-red-500/40 bg-red-500/10 text-red-300 text-xs px-2 py-1 inline-flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                    Recording voice note... {recordSeconds}s
                                </div>
                            )}
                            {pendingMediaUpload && (
                                <div className="rounded-sm border border-border bg-muted/20 p-2 space-y-2">
                                    <p className="text-xs text-muted-foreground">Preview before send</p>
                                    {pendingMediaUpload.kind === 'image' ? (
                                        <Image
                                            src={pendingMediaUpload.previewUrl}
                                            alt="Pending upload preview"
                                            width={420}
                                            height={320}
                                            unoptimized
                                            className="max-h-60 w-auto rounded-sm border border-border"
                                        />
                                    ) : (
                                        <video
                                            controls
                                            src={pendingMediaUpload.previewUrl}
                                            className="max-h-60 rounded-sm border border-border"
                                        />
                                    )}
                                    <div className="flex items-center gap-2">
                                        <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={confirmPendingUpload}>
                                            Confirm & Send
                                        </button>
                                        <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={cancelPendingUpload}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            {pendingVoiceUpload && (
                                <div className="rounded-sm border border-border bg-muted/20 p-2 space-y-2">
                                    <p className="text-xs text-muted-foreground">Voice note preview</p>
                                    <ChatAudioPlayer src={pendingVoiceUpload.previewUrl} initialDurationSeconds={pendingVoiceUpload.duration} />
                                    <div className="flex items-center gap-2">
                                        <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={confirmPendingVoiceUpload}>
                                            <Check size={13} />
                                            Accept & Send
                                        </button>
                                        <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={cancelPendingVoiceUpload}>
                                            <X size={13} />
                                            Discard
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Type a message..."
                                    className="input-dark"
                                    disabled={recording}
                                />
                                <label className="btn-ghost !p-2 cursor-pointer border border-border rounded-sm">
                                    <Paperclip size={16} />
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*,video/*,audio/*"
                                        onChange={async (e) => {
                                            const input = e.currentTarget;
                                            const file = input.files?.[0];
                                            input.value = '';
                                            if (file) await queueOrUploadAttachment(file);
                                        }}
                                        disabled={uploading || recording}
                                    />
                                </label>
                                <button
                                    type="button"
                                    className={`btn-ghost !p-2 border border-border rounded-sm ${recording ? 'text-red-400' : ''}`}
                                    onClick={recording ? stopVoiceRecording : startVoiceRecording}
                                    disabled={uploading || !!pendingVoiceUpload}
                                    title={recording ? 'Stop recording for preview' : 'Record voice note'}
                                >
                                    {recording ? <Square size={16} /> : <Mic size={16} />}
                                </button>
                                {recording && (
                                    <button
                                        type="button"
                                        className="btn-primary !py-2 !px-3"
                                        onClick={stopAndSendVoiceRecording}
                                        disabled={uploading}
                                        title="Stop and send voice note directly"
                                    >
                                        <Check size={15} />
                                    </button>
                                )}
                                <button type="submit" className="btn-primary !py-2 !px-3" disabled={!text.trim() || recording || uploading}>
                                    <Send size={15} />
                                </button>
                            </div>
                            {uploading && <p className="text-xs text-muted-foreground">Uploading attachment...</p>}
                        </form>
                    )}
                </section>
            </div>
        </div>
    );
}
