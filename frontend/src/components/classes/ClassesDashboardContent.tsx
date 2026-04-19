'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Clock3, Plus, Users, X } from 'lucide-react';

import { useFeedback } from '@/components/FeedbackProvider';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

type DashboardRole = 'ADMIN' | 'MANAGER' | 'COACH';

type ClassTemplate = {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    duration_minutes: number;
    capacity: number;
    color: string | null;
    is_active: boolean;
};

type ClassSession = {
    id: string;
    template_id: string;
    template_name: string;
    coach_id: string;
    coach_name: string | null;
    starts_at: string;
    ends_at: string;
    capacity: number;
    capacity_override: number | null;
    status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
    reserved_count: number;
    pending_count: number;
    waitlist_count: number;
};

type StaffUser = {
    id: string;
    full_name: string;
    role: string;
};

type Reservation = {
    id: string;
    session_id: string;
    member_id: string;
    member_name: string | null;
    status: 'PENDING' | 'RESERVED' | 'WAITLISTED' | 'REJECTED' | 'CANCELLED' | 'NO_SHOW';
    attended: boolean;
    reserved_at: string;
    cancelled_at: string | null;
};

type Envelope<T> = {
    data?: T;
};

function unwrapData<T>(payload: T | Envelope<T>): T {
    if (payload && typeof payload === 'object' && 'data' in (payload as Envelope<T>)) {
        return ((payload as Envelope<T>).data ?? []) as T;
    }
    return payload as T;
}

function statusTone(status: ClassSession['status']) {
    if (status === 'COMPLETED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    if (status === 'CANCELLED') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-sky-500/30 bg-sky-500/10 text-sky-400';
}

function reservationTone(status: Reservation['status']) {
    if (status === 'RESERVED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    if (status === 'PENDING') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    if (status === 'WAITLISTED') return 'border-violet-500/30 bg-violet-500/10 text-violet-400';
    return 'border-border bg-muted/40 text-muted-foreground';
}

export default function ClassesDashboardContent({ role }: { role: DashboardRole }) {
    const { user } = useAuth();
    const { locale } = useLocale();
    const { showToast, confirm } = useFeedback();

    const isArabic = locale === 'ar';
    const canManageTemplates = role !== 'COACH';
    const canCancelSessions = role !== 'COACH';
    const canScheduleSessions = Boolean(user);
    const canLoadStaffDirectory = user?.role === 'ADMIN';
    const sessionLocale = isArabic ? 'ar' : 'en';

    const txt = isArabic
        ? {
            pageTitle: role === 'COACH' ? 'حصصي' : 'إدارة الحصص',
            pageSubtitle: role === 'COACH' ? 'تابع حصصك القادمة وطلبات الحجز.' : 'أنشئ القوالب، وجدول الحصص، وراجع الحجوزات.',
            sessions: 'الحصص',
            templates: 'القوالب',
            newTemplate: 'قالب جديد',
            scheduleSession: 'جدولة حصة',
            loading: 'جارٍ تحميل الحصص...',
            loadFailed: 'فشل تحميل بيانات الحصص.',
            noSessions: 'لا توجد حصص لعرضها حالياً.',
            noTemplates: 'لا توجد قوالب حصص بعد.',
            coach: 'المدرب',
            reserved: 'محجوز',
            pending: 'معلّق',
            waitlist: 'انتظار',
            attendees: 'الحجوزات',
            viewReservations: 'عرض الحجوزات',
            cancelSession: 'إلغاء الحصة',
            completeSession: 'إنهاء الحصة',
            reservationsTitle: 'طلبات الحجز',
            reservationsEmpty: 'لا توجد حجوزات لهذه الحصة بعد.',
            approve: 'قبول',
            reject: 'رفض',
            close: 'إغلاق',
            createdTemplate: 'تم إنشاء قالب الحصة.',
            createdSession: 'تمت جدولة الحصة.',
            cancelledSession: 'تم إلغاء الحصة.',
            completedSession: 'تم إنهاء الحصة.',
            updatedReservations: 'تم تحديث طلبات الحجز.',
            createTemplateFailed: 'فشل إنشاء القالب.',
            createSessionFailed: 'فشل جدولة الحصة.',
            actionFailed: 'تعذر تنفيذ الإجراء.',
            reservationsFailed: 'تعذر تحميل الحجوزات.',
            cancelConfirmTitle: 'إلغاء الحصة',
            cancelConfirmDescription: 'سيتم إلغاء هذه الحصة وكل الحجوزات المرتبطة بها. هل تريد المتابعة؟',
            completeConfirmTitle: 'إنهاء الحصة',
            completeConfirmDescription: 'هل تريد وسم هذه الحصة كمنتهية؟',
            templateName: 'اسم الحصة',
            description: 'الوصف',
            duration: 'المدة بالدقائق',
            capacity: 'السعة',
            selectTemplate: 'اختر القالب',
            selectCoach: 'اختر المدرب',
            startsAt: 'وقت البدء',
            capacityOverride: 'سعة مخصصة',
            repeatWeeks: 'تكرار أسبوعي',
            noDescription: 'لا يوجد وصف',
            dateLabel: 'التاريخ',
            keep: 'إلغاء',
            confirm: 'تأكيد',
            todayBadge: 'اليوم',
        }
        : {
            pageTitle: role === 'COACH' ? 'My Classes' : 'Classes',
            pageSubtitle: role === 'COACH' ? 'Track your upcoming sessions and reservation demand.' : 'Create templates, schedule sessions, and review reservations.',
            sessions: 'Sessions',
            templates: 'Templates',
            newTemplate: 'New Template',
            scheduleSession: 'Schedule Session',
            loading: 'Loading classes...',
            loadFailed: 'Failed to load classes data.',
            noSessions: 'No class sessions to show right now.',
            noTemplates: 'No class templates yet.',
            coach: 'Coach',
            reserved: 'Reserved',
            pending: 'Pending',
            waitlist: 'Waitlist',
            attendees: 'Reservations',
            viewReservations: 'View reservations',
            cancelSession: 'Cancel session',
            completeSession: 'Complete session',
            reservationsTitle: 'Reservations',
            reservationsEmpty: 'No reservations for this session yet.',
            approve: 'Approve',
            reject: 'Reject',
            close: 'Close',
            createdTemplate: 'Class template created.',
            createdSession: 'Class session scheduled.',
            cancelledSession: 'Class session cancelled.',
            completedSession: 'Class session completed.',
            updatedReservations: 'Reservations updated.',
            createTemplateFailed: 'Failed to create template.',
            createSessionFailed: 'Failed to schedule session.',
            actionFailed: 'Unable to complete that action.',
            reservationsFailed: 'Unable to load reservations.',
            cancelConfirmTitle: 'Cancel session',
            cancelConfirmDescription: 'This will cancel the session and every active reservation. Continue?',
            completeConfirmTitle: 'Complete session',
            completeConfirmDescription: 'Mark this session as completed?',
            templateName: 'Class name',
            description: 'Description',
            duration: 'Duration (min)',
            capacity: 'Capacity',
            selectTemplate: 'Select template',
            selectCoach: 'Select coach',
            startsAt: 'Start date & time',
            capacityOverride: 'Capacity override',
            repeatWeeks: 'Repeat weekly',
            noDescription: 'No description',
            dateLabel: 'Date',
            keep: 'Keep',
            confirm: 'Confirm',
            todayBadge: 'Today',
        };

    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'sessions' | 'templates'>('sessions');
    const [templates, setTemplates] = useState<ClassTemplate[]>([]);
    const [sessions, setSessions] = useState<ClassSession[]>([]);
    const [coaches, setCoaches] = useState<StaffUser[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [reservationsSession, setReservationsSession] = useState<ClassSession | null>(null);
    const [loadingReservations, setLoadingReservations] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showSessionModal, setShowSessionModal] = useState(false);
    const [templateForm, setTemplateForm] = useState({ name: '', description: '', duration_minutes: 60, capacity: 20 });
    const [sessionForm, setSessionForm] = useState({ template_id: '', coach_id: user?.id ?? '', starts_at: '', capacity_override: '', recur_weekly_count: '0' });
    const hasTemplates = templates.length > 0;
    const hasSessions = sessions.length > 0;

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [templatesResponse, sessionsResponse] = await Promise.all([
                api.get('/classes/templates'),
                api.get('/classes/sessions'),
            ]);
            setTemplates(unwrapData<ClassTemplate[]>(templatesResponse.data as ClassTemplate[] | Envelope<ClassTemplate[]>) || []);
            setSessions(unwrapData<ClassSession[]>(sessionsResponse.data as ClassSession[] | Envelope<ClassSession[]>) || []);
            if (canManageTemplates && canLoadStaffDirectory) {
                const staffResponse = await api.get('/hr/staff');
                const staff = unwrapData<{ data?: StaffUser[] } | StaffUser[]>((staffResponse.data ?? []) as { data?: StaffUser[] } | StaffUser[]);
                const staffList = Array.isArray(staff) ? staff : staff?.data || [];
                setCoaches(staffList.filter((candidate) => ['ADMIN', 'MANAGER', 'COACH'].includes(candidate.role)));
            } else if (user?.id) {
                setCoaches([{ id: user.id, full_name: user.full_name || user.email || 'Coach', role: user.role }]);
                setSessionForm((current) => ({ ...current, coach_id: user.id }));
            }
        } catch (error) {
            console.error('Failed to load classes data', error);
            showToast(txt.loadFailed, 'error');
        } finally {
            setLoading(false);
        }
    }, [canLoadStaffDirectory, canManageTemplates, showToast, txt.loadFailed, user]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const summary = useMemo(() => {
        return sessions.reduce(
            (acc, session) => {
                if (session.status === 'SCHEDULED') acc.scheduled += 1;
                if (session.status === 'COMPLETED') acc.completed += 1;
                acc.reservations += session.reserved_count + session.pending_count + session.waitlist_count;
                return acc;
            },
            { scheduled: 0, completed: 0, reservations: 0 }
        );
    }, [sessions]);

    const openReservations = useCallback(async (session: ClassSession) => {
        try {
            setReservationsSession(session);
            setLoadingReservations(true);
            const response = await api.get(`/classes/sessions/${session.id}/reservations`);
            setReservations(unwrapData<Reservation[]>(response.data) || []);
        } catch (error) {
            console.error('Failed to load reservations', error);
            showToast(txt.reservationsFailed, 'error');
        } finally {
            setLoadingReservations(false);
        }
    }, [showToast, txt.reservationsFailed]);

    async function handleCreateTemplate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try {
            await api.post('/classes/templates', templateForm);
            setShowTemplateModal(false);
            setTemplateForm({ name: '', description: '', duration_minutes: 60, capacity: 20 });
            showToast(txt.createdTemplate, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to create template', error);
            showToast(txt.createTemplateFailed, 'error');
        }
    }

    async function handleCreateSession(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try {
            await api.post('/classes/sessions', {
                template_id: sessionForm.template_id,
                coach_id: sessionForm.coach_id || user?.id,
                starts_at: new Date(sessionForm.starts_at).toISOString(),
                capacity_override: sessionForm.capacity_override ? Number(sessionForm.capacity_override) : null,
                recur_weekly_count: Number(sessionForm.recur_weekly_count || 0),
            });
            setShowSessionModal(false);
            setSessionForm({ template_id: '', coach_id: user?.id ?? '', starts_at: '', capacity_override: '', recur_weekly_count: '0' });
            showToast(txt.createdSession, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to create session', error);
            showToast(txt.createSessionFailed, 'error');
        }
    }

    async function handleCancelSession(session: ClassSession) {
        const accepted = await confirm({
            title: txt.cancelConfirmTitle,
            description: txt.cancelConfirmDescription,
            confirmText: txt.confirm,
            cancelText: txt.keep,
            destructive: true,
        });
        if (!accepted) return;
        try {
            await api.post(`/classes/sessions/${session.id}/cancel`);
            showToast(txt.cancelledSession, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to cancel session', error);
            showToast(txt.actionFailed, 'error');
        }
    }

    async function handleCompleteSession(session: ClassSession) {
        const accepted = await confirm({
            title: txt.completeConfirmTitle,
            description: txt.completeConfirmDescription,
            confirmText: txt.confirm,
            cancelText: txt.keep,
        });
        if (!accepted) return;
        try {
            await api.post(`/classes/sessions/${session.id}/complete`);
            showToast(txt.completedSession, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to complete session', error);
            showToast(txt.actionFailed, 'error');
        }
    }

    async function handleReservationAction(action: 'approve' | 'reject', reservationId: string) {
        if (!reservationsSession) return;
        try {
            await api.post(`/classes/sessions/${reservationsSession.id}/reservations/${action}`, {
                reservation_ids: [reservationId],
            });
            showToast(txt.updatedReservations, 'success');
            await openReservations(reservationsSession);
            await loadData();
        } catch (error) {
            console.error('Failed to update reservation', error);
            showToast(txt.actionFailed, 'error');
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">{txt.loading}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{txt.pageTitle}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{txt.pageSubtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canManageTemplates ? (
                        <button type="button" className="btn-secondary" onClick={() => setShowTemplateModal(true)}>
                            <Plus size={16} /> {txt.newTemplate}
                        </button>
                    ) : null}
                    {canScheduleSessions ? (
                        <button type="button" className="btn-primary" onClick={() => setShowSessionModal(true)}>
                            <Calendar size={16} /> {txt.scheduleSession}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="kpi-card">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{txt.sessions}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{summary.scheduled}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{txt.todayBadge} / {txt.sessions}</p>
                </div>
                <div className="kpi-card">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{txt.templates}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{templates.length}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{canManageTemplates ? txt.newTemplate : txt.scheduleSession}</p>
                </div>
                <div className="kpi-card">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{txt.attendees}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{summary.reservations}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{txt.reserved} + {txt.pending} + {txt.waitlist}</p>
                </div>
            </div>

            {!hasTemplates || !hasSessions ? (
                <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                    <div className="kpi-card border-primary/20 bg-primary/5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                                    {role === 'COACH' ? 'Coach start' : 'Classes start here'}
                                </p>
                                <h2 className="text-xl font-bold text-foreground">
                                    {role === 'COACH'
                                        ? 'Create a template, then schedule your first session.'
                                        : 'Create a template, schedule a session, and watch reservations appear.'}
                                </h2>
                                <p className="max-w-2xl text-sm text-muted-foreground">
                                    {role === 'COACH'
                                        ? 'Coaches can manage their own sessions from here. Admins and managers can also create the template library.'
                                        : 'The classes module now supports the full flow, but it looks best once there is at least one active template and a future session.'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {canManageTemplates ? (
                                    <button type="button" className="btn-secondary" onClick={() => setShowTemplateModal(true)}>
                                        <Plus size={16} /> {txt.newTemplate}
                                    </button>
                                ) : null}
                                {canScheduleSessions ? (
                                    <button type="button" className="btn-primary" onClick={() => setShowSessionModal(true)}>
                                        <Calendar size={16} /> {txt.scheduleSession}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="kpi-card space-y-3">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Quick status</p>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>{hasTemplates ? `Templates: ${templates.length}` : 'No templates yet.'}</p>
                            <p>{hasSessions ? `Sessions: ${sessions.length}` : 'No scheduled sessions yet.'}</p>
                            <p>{role === 'COACH' ? 'Your sessions will appear here once scheduled.' : 'Use the buttons to seed the dashboard with live data.'}</p>
                        </div>
                    </div>
                </div>
            ) : null}

            {canManageTemplates ? (
                <div className="flex items-center gap-2 border-b border-border">
                    <button
                        type="button"
                        className={`border-b-2 px-4 py-3 text-sm font-semibold ${view === 'sessions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                        onClick={() => setView('sessions')}
                    >
                        {txt.sessions}
                    </button>
                    <button
                        type="button"
                        className={`border-b-2 px-4 py-3 text-sm font-semibold ${view === 'templates' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                        onClick={() => setView('templates')}
                    >
                        {txt.templates}
                    </button>
                </div>
            ) : null}

            {view === 'templates' && canManageTemplates ? (
                templates.length === 0 ? (
                    <div className="kpi-card text-sm text-muted-foreground">{txt.noTemplates}</div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {templates.map((template) => (
                            <div key={template.id} className="kpi-card space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-foreground">{template.name}</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">{template.description || txt.noDescription}</p>
                                    </div>
                                    <div
                                        className="h-3 w-3 rounded-full border border-white/20"
                                        style={{ backgroundColor: template.color || 'hsl(var(--primary))' }}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1">
                                        <Clock3 size={14} /> {template.duration_minutes}m
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1">
                                        <Users size={14} /> {template.capacity}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : sessions.length === 0 ? (
                <div className="kpi-card text-sm text-muted-foreground">{txt.noSessions}</div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {sessions.map((session) => {
                        const isToday = new Date(session.starts_at).toDateString() === new Date().toDateString();
                        const canComplete = session.status === 'SCHEDULED';
                        return (
                            <div key={session.id} className="kpi-card space-y-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-xl font-bold text-foreground">{session.template_name}</h2>
                                            {isToday ? (
                                                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                                                    {txt.todayBadge}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <Calendar size={15} />
                                                {new Date(session.starts_at).toLocaleDateString(sessionLocale, { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock3 size={15} />
                                                {new Date(session.starts_at).toLocaleTimeString(sessionLocale, { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {session.coach_name ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <Users size={15} />
                                                    {txt.coach}: {session.coach_name}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${statusTone(session.status)}`}>
                                        {session.status}
                                    </span>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-2xl border border-border bg-muted/30 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.reserved}</p>
                                        <p className="mt-1 text-2xl font-bold text-foreground">{session.reserved_count}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border bg-muted/30 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.pending}</p>
                                        <p className="mt-1 text-2xl font-bold text-foreground">{session.pending_count}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border bg-muted/30 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.waitlist}</p>
                                        <p className="mt-1 text-2xl font-bold text-foreground">{session.waitlist_count}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className="btn-secondary" onClick={() => void openReservations(session)}>
                                        <Users size={16} /> {txt.viewReservations}
                                    </button>
                                    {canComplete ? (
                                        <button type="button" className="btn-secondary" onClick={() => void handleCompleteSession(session)}>
                                            <Check size={16} /> {txt.completeSession}
                                        </button>
                                    ) : null}
                                    {canCancelSessions && session.status === 'SCHEDULED' ? (
                                        <button type="button" className="btn-ghost text-destructive" onClick={() => void handleCancelSession(session)}>
                                            <X size={16} /> {txt.cancelSession}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showTemplateModal ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-foreground">{txt.newTemplate}</h2>
                            <button type="button" onClick={() => setShowTemplateModal(false)} className="text-muted-foreground">
                                <X size={18} />
                            </button>
                        </div>
                        <form className="space-y-4" onSubmit={handleCreateTemplate}>
                            <input className="input-field" placeholder={txt.templateName} value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} required />
                            <textarea className="input-field min-h-28" placeholder={txt.description} value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <input className="input-field" type="number" min="5" placeholder={txt.duration} value={templateForm.duration_minutes} onChange={(event) => setTemplateForm((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} required />
                                <input className="input-field" type="number" min="1" placeholder={txt.capacity} value={templateForm.capacity} onChange={(event) => setTemplateForm((current) => ({ ...current, capacity: Number(event.target.value) }))} required />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" className="btn-ghost" onClick={() => setShowTemplateModal(false)}>{txt.close}</button>
                                <button type="submit" className="btn-primary">{txt.newTemplate}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {showSessionModal ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-foreground">{txt.scheduleSession}</h2>
                            <button type="button" onClick={() => setShowSessionModal(false)} className="text-muted-foreground">
                                <X size={18} />
                            </button>
                        </div>
                        <form className="space-y-4" onSubmit={handleCreateSession}>
                            <select className="input-field" value={sessionForm.template_id} onChange={(event) => setSessionForm((current) => ({ ...current, template_id: event.target.value }))} required>
                                <option value="">{txt.selectTemplate}</option>
                                {templates.map((template) => (
                                    <option key={template.id} value={template.id}>{template.name}</option>
                                ))}
                            </select>
                            <select className="input-field" value={sessionForm.coach_id} onChange={(event) => setSessionForm((current) => ({ ...current, coach_id: event.target.value }))} required disabled={!canManageTemplates}>
                                <option value="">{txt.selectCoach}</option>
                                {coaches.map((coach) => (
                                    <option key={coach.id} value={coach.id}>{coach.full_name} ({coach.role})</option>
                                ))}
                            </select>
                            <input className="input-field" type="datetime-local" value={sessionForm.starts_at} onChange={(event) => setSessionForm((current) => ({ ...current, starts_at: event.target.value }))} required />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <input className="input-field" type="number" min="1" placeholder={txt.capacityOverride} value={sessionForm.capacity_override} onChange={(event) => setSessionForm((current) => ({ ...current, capacity_override: event.target.value }))} />
                                <input className="input-field" type="number" min="0" max="52" placeholder={txt.repeatWeeks} value={sessionForm.recur_weekly_count} onChange={(event) => setSessionForm((current) => ({ ...current, recur_weekly_count: event.target.value }))} />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" className="btn-ghost" onClick={() => setShowSessionModal(false)}>{txt.close}</button>
                                <button type="submit" className="btn-primary">{txt.scheduleSession}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {reservationsSession ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{txt.reservationsTitle}</h2>
                                <p className="text-sm text-muted-foreground">{reservationsSession.template_name}</p>
                            </div>
                            <button type="button" className="text-muted-foreground" onClick={() => setReservationsSession(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        {loadingReservations ? (
                            <div className="text-sm text-muted-foreground">{txt.loading}</div>
                        ) : reservations.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{txt.reservationsEmpty}</div>
                        ) : (
                            <div className="space-y-3">
                                {reservations.map((reservation) => (
                                    <div key={reservation.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold text-foreground">{reservation.member_name || 'Member'}</p>
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${reservationTone(reservation.status)}`}>
                                                    {reservation.status}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {new Date(reservation.reserved_at).toLocaleString(sessionLocale)}
                                            </p>
                                        </div>
                                        {reservation.status === 'PENDING' ? (
                                            <div className="flex gap-2">
                                                <button type="button" className="btn-secondary" onClick={() => void handleReservationAction('approve', reservation.id)}>
                                                    {txt.approve}
                                                </button>
                                                <button type="button" className="btn-ghost text-destructive" onClick={() => void handleReservationAction('reject', reservation.id)}>
                                                    {txt.reject}
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
