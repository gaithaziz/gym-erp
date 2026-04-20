'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Check, Clock3, Loader2, Repeat, Users, X } from 'lucide-react';

import { useFeedback } from '@/components/FeedbackProvider';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { api } from '@/lib/api';

type DashboardRole = 'ADMIN' | 'MANAGER' | 'COACH' | 'CUSTOMER';
type SessionStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
type ReservationStatus = 'PENDING' | 'RESERVED' | 'WAITLISTED' | 'REJECTED' | 'CANCELLED' | 'NO_SHOW';

type ClassSession = {
    id: string;
    template_id: string;
    template_name: string;
    session_name: string | null;
    display_name: string;
    coach_id: string;
    coach_name: string | null;
    starts_at: string;
    ends_at: string;
    capacity: number;
    capacity_override: number | null;
    status: SessionStatus;
    reserved_count: number;
    pending_count: number;
    waitlist_count: number;
};

type MemberReservation = {
    reservation_id: string;
    status: ReservationStatus;
    reserved_at: string;
    session: ClassSession;
};

type SessionReservation = {
    id: string;
    session_id: string;
    member_id: string;
    member_name: string | null;
    status: ReservationStatus;
    attended: boolean;
    reserved_at: string;
    cancelled_at: string | null;
};

type StaffUser = {
    id: string;
    full_name: string;
    role: string;
};

type Envelope<T> = {
    data?: T;
};

type SessionFormState = {
    session_name: string;
    coach_id: string;
    session_date: string;
    session_time: string;
    duration_minutes: string;
    capacity: string;
    repeat_weeks: string;
};

function unwrapData<T>(payload: T | Envelope<T>): T {
    if (payload && typeof payload === 'object' && 'data' in (payload as Envelope<T>)) {
        return ((payload as Envelope<T>).data ?? []) as T;
    }
    return payload as T;
}

function getErrorMessage(error: unknown, fallback: string) {
    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
}

function statusTone(status: SessionStatus) {
    if (status === 'COMPLETED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    if (status === 'CANCELLED') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-sky-500/30 bg-sky-500/10 text-sky-400';
}

function reservationTone(status: ReservationStatus) {
    if (status === 'RESERVED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    if (status === 'PENDING') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    if (status === 'WAITLISTED') return 'border-violet-500/30 bg-violet-500/10 text-violet-400';
    if (status === 'REJECTED') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-border bg-muted/40 text-muted-foreground';
}

function buildSessionStartsAt(date: string, time: string) {
    if (!date || !time) return null;
    const startsAt = new Date(`${date}T${time}`);
    if (Number.isNaN(startsAt.getTime())) return null;
    return startsAt;
}

function formatDate(dateString: string, locale: string) {
    return new Date(dateString).toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}

function formatTime(dateString: string, locale: string) {
    return new Date(dateString).toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatDateTime(dateString: string, locale: string) {
    return new Date(dateString).toLocaleString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatEndTime(startsAt: Date, durationMinutes: number, locale: string) {
    return new Date(startsAt.getTime() + durationMinutes * 60_000).toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function isActiveEnrollment(status: ReservationStatus) {
    return status === 'RESERVED' || status === 'PENDING' || status === 'WAITLISTED';
}

export default function ClassesDashboardContent({ role }: { role: DashboardRole }) {
    const { user } = useAuth();
    const { locale } = useLocale();
    const { showToast, confirm } = useFeedback();

    const isArabic = locale === 'ar';
    const sessionLocale = isArabic ? 'ar' : 'en';
    const isCustomer = role === 'CUSTOMER';
    const isCoach = role === 'COACH';
    const isStaffView = !isCustomer;
    const canAssignCoach = !isCustomer && !isCoach;
    const canCancelSessions = !isCustomer && !isCoach;

    const txt = isArabic
        ? {
            pageTitle: isCustomer ? 'الحصص' : isCoach ? 'حصصي' : 'إدارة الحصص',
            pageSubtitle: isCustomer
                ? 'اكتشف الحصص القادمة وتابع طلبات الحجز الخاصة بك.'
                : isCoach
                    ? 'أنشئ حصصك وراجع الجلسات القادمة بسرعة ووضوح.'
                    : 'أنشئ الحصص مباشرة وراجع جدول الفريق.',
            loading: 'جارٍ تحميل الحصص...',
            loadFailed: 'فشل تحميل بيانات الحصص.',
            createSession: 'حفظ الحصة',
            createSessionSuccess: 'تمت جدولة الحصة.',
            createSessionFailed: 'تعذر جدولة الحصة.',
            cancelSession: 'إلغاء الحصة',
            cancelSessionConfirmTitle: 'إلغاء الحصة',
            cancelSessionConfirmBody: 'سيتم إلغاء الحصة وكل الحجوزات النشطة المرتبطة بها. هل تريد المتابعة؟',
            cancelSessionSuccess: 'تم إلغاء الحصة.',
            completeSession: 'إنهاء الحصة',
            completeSessionConfirmTitle: 'إنهاء الحصة',
            completeSessionConfirmBody: 'هل تريد وسم هذه الحصة كمنتهية؟',
            completeSessionSuccess: 'تم إنهاء الحصة.',
            actionFailed: 'تعذر تنفيذ هذا الإجراء.',
            upcomingSessions: 'الحصص القادمة',
            noSessions: 'لا توجد حصص قادمة لعرضها حالياً.',
            formTitle: 'جدولة حصة',
            className: 'اسم الحصة',
            classNameHint: 'سيظهر هذا الاسم للعضو ويمكنك تغييره في كل مرة.',
            coach: 'المدرب',
            coachHint: 'اختر من سيقود هذه الحصة.',
            date: 'التاريخ',
            dateHint: 'اختر يوم بدء الحصة.',
            time: 'الوقت',
            timeHint: 'اختر ساعة بداية الحصة.',
            duration: 'المدة',
            durationHint: 'مدة الحصة بالدقائق.',
            capacity: 'السعة الافتراضية',
            capacityHint: 'هذا هو العدد الأساسي للمقاعد في هذه الحصة وسيظهر للأعضاء عند الحجز.',
            repeatWeeks: 'تكرار أسبوعي',
            repeatWeeksHint: 'اتركها 0 إذا كانت الحصة لمرة واحدة.',
            scheduleSummary: 'ملخص الجدولة',
            starts: 'تبدأ',
            ends: 'تنتهي',
            conflictHint: 'لن يتم حفظ الحصة إذا كان لدى المدرب جلسة أخرى متداخلة في نفس الوقت.',
            seats: 'المقاعد',
            reserved: 'محجوز',
            pending: 'معلّق',
            waitlist: 'انتظار',
            today: 'اليوم',
            templateReference: 'القالب',
            reserveSpot: 'طلب حجز',
            cancelBooking: 'إلغاء الحجز',
            reserveSuccess: 'تم إرسال طلب الحجز.',
            cancelBookingSuccess: 'تم إلغاء الحجز.',
            reserveFailed: 'تعذر إرسال طلب الحجز.',
            bookingsFailed: 'تعذر تحديث الحجز.',
            browseClasses: 'الحصص القادمة',
            myBookings: 'حجوزاتي',
            myBookingsEmpty: 'لا توجد حجوزات نشطة لديك حالياً.',
            noUpcomingPublic: 'لا توجد حصص متاحة قريباً.',
            bookingState: 'حالة الحجز',
            full: 'ممتلئة',
            fullHint: 'الحصة ممتلئة حالياً، لكن يمكن إرسال طلب وقد يتم وضعه في قائمة الانتظار.',
            seatsUsed: 'المقاعد المستخدمة',
            requestSubmittedAt: 'تاريخ الطلب',
            sessionsCount: 'الحصص المجدولة',
            attendeesCount: 'إجمالي المشاركين',
            save: 'حفظ',
            keep: 'إلغاء',
            schedulePlaceholder: 'أدخل اسم الحصة، ثم حدد التاريخ والوقت والمدرب.',
            noCoach: 'لم يتم تحديد مدرب',
            classInfoSection: 'معلومات الحصة',
            scheduleSection: 'موعد الحصة',
            capacitySection: 'السعة والتكرار',
            coachLockedHint: 'هذا الحقل ثابت في حساب المدرب.',
            previewTitle: 'معاينة مباشرة',
            previewDescription: 'سيتم تحديث هذه البطاقة أثناء تعبئة النموذج.',
            previewCoach: 'المدرب',
            previewDuration: 'المدة',
            previewCapacity: 'السعة',
            previewEmpty: 'أكمل التاريخ والوقت لعرض المعاينة.',
            sessionsIntro: 'راجع الجلسات القادمة واتخذ الإجراءات الأساسية من نفس الصفحة.',
            schedulerEyebrow: 'منشئ الحصص',
            editorLead: 'جهّز الحصة التالية بسرعة، ثم راجع المعاينة قبل الحفظ.',
            summaryNoteTitle: 'ملاحظة سريعة',
            viewAttendees: 'عرض المسجلين',
            attendeesTitle: 'المسجلون في الحصة',
            attendeesEmpty: 'لا يوجد أعضاء مسجلون في هذه الحصة حالياً.',
            attendeesLoading: 'جارٍ تحميل قائمة الأعضاء...',
            attendeesFailed: 'تعذر تحميل قائمة الأعضاء.',
            memberFallback: 'عضو',
        }
        : {
            pageTitle: isCustomer ? 'Classes' : isCoach ? 'My Classes' : 'Classes',
            pageSubtitle: isCustomer
                ? 'Discover upcoming classes and track your booking requests.'
                : isCoach
                    ? 'Create classes and keep your upcoming sessions easy to scan.'
                    : 'Create classes inline and manage the team schedule.',
            loading: 'Loading classes...',
            loadFailed: 'Failed to load classes data.',
            createSession: 'Save session',
            createSessionSuccess: 'Class session scheduled.',
            createSessionFailed: 'Unable to schedule the class session.',
            cancelSession: 'Cancel session',
            cancelSessionConfirmTitle: 'Cancel session',
            cancelSessionConfirmBody: 'This will cancel the class and its active reservations. Continue?',
            cancelSessionSuccess: 'Class session cancelled.',
            completeSession: 'Complete session',
            completeSessionConfirmTitle: 'Complete session',
            completeSessionConfirmBody: 'Mark this class session as completed?',
            completeSessionSuccess: 'Class session completed.',
            actionFailed: 'Unable to complete that action.',
            upcomingSessions: 'Upcoming sessions',
            noSessions: 'No upcoming class sessions to show right now.',
            formTitle: 'Schedule a class',
            className: 'Class name',
            classNameHint: 'Members will see this title. You can name each class separately.',
            coach: 'Coach',
            coachHint: 'Choose who will run this class.',
            date: 'Date',
            dateHint: 'Pick the day the class starts.',
            time: 'Time',
            timeHint: 'Pick the start time for the class.',
            duration: 'Duration',
            durationHint: 'How long this class runs, in minutes.',
            capacity: 'Default capacity',
            capacityHint: 'This is the base seat count for the class and the number members see while booking.',
            repeatWeeks: 'Repeat weeks',
            repeatWeeksHint: 'Leave this at 0 for a one-off class.',
            scheduleSummary: 'Schedule summary',
            starts: 'Starts',
            ends: 'Ends',
            conflictHint: 'This save will be blocked if the coach already has another overlapping session.',
            seats: 'Seats',
            reserved: 'Reserved',
            pending: 'Pending',
            waitlist: 'Waitlist',
            today: 'Today',
            templateReference: 'Template',
            reserveSpot: 'Request spot',
            cancelBooking: 'Cancel booking',
            reserveSuccess: 'Booking request submitted.',
            cancelBookingSuccess: 'Booking cancelled.',
            reserveFailed: 'Unable to submit booking request.',
            bookingsFailed: 'Unable to update booking.',
            browseClasses: 'Browse classes',
            myBookings: 'My bookings',
            myBookingsEmpty: 'You do not have any active bookings right now.',
            noUpcomingPublic: 'No public classes are scheduled soon.',
            bookingState: 'Booking state',
            full: 'Full',
            fullHint: 'This class is full right now, but you can still send a request and be waitlisted.',
            seatsUsed: 'Seats used',
            requestSubmittedAt: 'Requested',
            sessionsCount: 'Scheduled sessions',
            attendeesCount: 'Total attendees',
            save: 'Save',
            keep: 'Keep',
            schedulePlaceholder: 'Enter the class name, then set the time, duration, and coach.',
            noCoach: 'Unassigned coach',
            classInfoSection: 'Class info',
            scheduleSection: 'Schedule',
            capacitySection: 'Capacity & repeat',
            coachLockedHint: 'This field is fixed for coach accounts.',
            previewTitle: 'Live preview',
            previewDescription: 'This card updates as you fill in the form.',
            previewCoach: 'Coach',
            previewDuration: 'Duration',
            previewCapacity: 'Capacity',
            previewEmpty: 'Set the date and time to preview the session.',
            sessionsIntro: 'Review upcoming sessions and take the key actions from one calmer list.',
            schedulerEyebrow: 'Class Builder',
            editorLead: 'Set up the next class quickly, then review the snapshot before saving.',
            summaryNoteTitle: 'Quick note',
            viewAttendees: 'View attendees',
            attendeesTitle: 'Class attendees',
            attendeesEmpty: 'No active enrollments for this class yet.',
            attendeesLoading: 'Loading attendee list...',
            attendeesFailed: 'Unable to load attendee list.',
            memberFallback: 'Member',
        };

    const [loading, setLoading] = useState(true);
    const [customerTab, setCustomerTab] = useState<'browse' | 'bookings'>('browse');
    const [sessions, setSessions] = useState<ClassSession[]>([]);
    const [publicSessions, setPublicSessions] = useState<ClassSession[]>([]);
    const [myReservations, setMyReservations] = useState<MemberReservation[]>([]);
    const [coaches, setCoaches] = useState<StaffUser[]>([]);
    const [creatingSession, setCreatingSession] = useState(false);
    const [actingSessionId, setActingSessionId] = useState<string | null>(null);
    const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
    const [sessionReservations, setSessionReservations] = useState<SessionReservation[]>([]);
    const [sessionReservationsLoading, setSessionReservationsLoading] = useState(false);
    const [sessionReservationsError, setSessionReservationsError] = useState<string | null>(null);
    const [sessionForm, setSessionForm] = useState<SessionFormState>({
        session_name: '',
        coach_id: user?.id ?? '',
        session_date: '',
        session_time: '',
        duration_minutes: '60',
        capacity: '20',
        repeat_weeks: '0',
    });

    const loadCustomerData = useCallback(async () => {
        const [upcomingResponse, reservationsResponse] = await Promise.all([
            api.get('/classes/public/upcoming'),
            api.get('/classes/my-reservations'),
        ]);
        setPublicSessions(unwrapData<ClassSession[]>(upcomingResponse.data as ClassSession[] | Envelope<ClassSession[]>) || []);
        setMyReservations(
            unwrapData<MemberReservation[]>(reservationsResponse.data as MemberReservation[] | Envelope<MemberReservation[]>) || []
        );
    }, []);

    const loadStaffData = useCallback(async () => {
        const sessionsResponse = await api.get('/classes/sessions');
        const nextSessions = unwrapData<ClassSession[]>(sessionsResponse.data as ClassSession[] | Envelope<ClassSession[]>) || [];
        setSessions(nextSessions);

        if (canAssignCoach) {
            const staffResponse = await api.get('/hr/staff');
            const staffPayload = unwrapData<{ data?: StaffUser[] } | StaffUser[]>(
                (staffResponse.data ?? []) as { data?: StaffUser[] } | StaffUser[]
            );
            const staffList = Array.isArray(staffPayload) ? staffPayload : staffPayload?.data || [];
            setCoaches(staffList.filter((candidate) => ['ADMIN', 'MANAGER', 'COACH'].includes(candidate.role)));
        } else if (user) {
            setCoaches([{ id: user.id, full_name: user.full_name || user.email || 'Coach', role: user.role }]);
        }

    }, [canAssignCoach, user]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            if (isCustomer) {
                await loadCustomerData();
            } else {
                await loadStaffData();
            }
        } catch (error) {
            console.error('Failed to load classes data', error);
            showToast(getErrorMessage(error, txt.loadFailed), 'error');
        } finally {
            setLoading(false);
        }
    }, [isCustomer, loadCustomerData, loadStaffData, showToast, txt.loadFailed]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (user?.id && !canAssignCoach) {
            setSessionForm((current) => ({ ...current, coach_id: user.id }));
        }
    }, [canAssignCoach, user]);

    const startPreview = useMemo(
        () => buildSessionStartsAt(sessionForm.session_date, sessionForm.session_time),
        [sessionForm.session_date, sessionForm.session_time]
    );
    const durationPreview = Number(sessionForm.duration_minutes || 0);
    const capacityPreview = Number(sessionForm.capacity || 0);
    const selectedCoachName = useMemo(
        () => coaches.find((coach) => coach.id === sessionForm.coach_id)?.full_name || user?.full_name || user?.email || txt.noCoach,
        [coaches, sessionForm.coach_id, txt.noCoach, user]
    );
    const reservationBySession = useMemo(
        () => new Map(myReservations.map((reservation) => [reservation.session.id, reservation])),
        [myReservations]
    );
    const staffSummary = useMemo(() => {
        return sessions.reduce(
            (acc, session) => {
                if (session.status === 'SCHEDULED') acc.scheduled += 1;
                acc.attendees += session.reserved_count + session.pending_count + session.waitlist_count;
                return acc;
            },
            { scheduled: 0, attendees: 0 }
        );
    }, [sessions]);

    async function handleCreateSession(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const startsAt = buildSessionStartsAt(sessionForm.session_date, sessionForm.session_time);
        if (!startsAt || !user) {
            showToast(txt.createSessionFailed, 'error');
            return;
        }

        setCreatingSession(true);
        try {
            await api.post('/classes/sessions', {
                template_name: sessionForm.session_name.trim(),
                template_duration_minutes: Number(sessionForm.duration_minutes),
                template_capacity: Number(sessionForm.capacity),
                session_name: sessionForm.session_name.trim(),
                coach_id: canAssignCoach ? sessionForm.coach_id : user.id,
                starts_at: startsAt.toISOString(),
                recur_weekly_count: Number(sessionForm.repeat_weeks) > 0 ? Number(sessionForm.repeat_weeks) : null,
            });
            setSessionForm((current) => ({
                ...current,
                session_name: '',
                session_date: '',
                session_time: '',
                duration_minutes: '60',
                capacity: '20',
                repeat_weeks: '0',
                coach_id: canAssignCoach ? current.coach_id : user.id,
            }));
            showToast(txt.createSessionSuccess, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to create class session', error);
            showToast(getErrorMessage(error, txt.createSessionFailed), 'error');
        } finally {
            setCreatingSession(false);
        }
    }

    async function handleCancelSession(session: ClassSession) {
        const accepted = await confirm({
            title: txt.cancelSessionConfirmTitle,
            description: txt.cancelSessionConfirmBody,
            confirmText: txt.cancelSession,
            cancelText: txt.keep,
            destructive: true,
        });
        if (!accepted) return;

        setActingSessionId(session.id);
        try {
            await api.post(`/classes/sessions/${session.id}/cancel`);
            showToast(txt.cancelSessionSuccess, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to cancel session', error);
            showToast(getErrorMessage(error, txt.actionFailed), 'error');
        } finally {
            setActingSessionId(null);
        }
    }

    useEffect(() => {
        if (!selectedSession) return;
        if (!sessions.some((session) => session.id === selectedSession.id)) {
            setSelectedSession(null);
        }
    }, [selectedSession, sessions]);

    useEffect(() => {
        let cancelled = false;

        const loadSessionReservations = async () => {
            if (!selectedSession || !isStaffView) {
                setSessionReservations([]);
                setSessionReservationsError(null);
                setSessionReservationsLoading(false);
                return;
            }

            try {
                setSessionReservationsLoading(true);
                setSessionReservationsError(null);
                const response = await api.get(`/classes/sessions/${selectedSession.id}/reservations`);
                const reservations = unwrapData<SessionReservation[]>(response.data as SessionReservation[] | Envelope<SessionReservation[]>) || [];
                if (!cancelled) {
                    setSessionReservations(reservations.filter((reservation) => isActiveEnrollment(reservation.status)));
                }
            } catch (error) {
                console.error('Failed to load session attendees', error);
                if (!cancelled) {
                    setSessionReservations([]);
                    setSessionReservationsError(txt.attendeesFailed);
                }
            } finally {
                if (!cancelled) {
                    setSessionReservationsLoading(false);
                }
            }
        };

        void loadSessionReservations();

        return () => {
            cancelled = true;
        };
    }, [isStaffView, selectedSession, txt.attendeesFailed]);

    async function handleCompleteSession(session: ClassSession) {
        const accepted = await confirm({
            title: txt.completeSessionConfirmTitle,
            description: txt.completeSessionConfirmBody,
            confirmText: txt.completeSession,
            cancelText: txt.keep,
        });
        if (!accepted) return;

        setActingSessionId(session.id);
        try {
            await api.post(`/classes/sessions/${session.id}/complete`);
            showToast(txt.completeSessionSuccess, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to complete session', error);
            showToast(getErrorMessage(error, txt.actionFailed), 'error');
        } finally {
            setActingSessionId(null);
        }
    }

    async function handleReserve(sessionId: string) {
        setActingSessionId(sessionId);
        try {
            await api.post(`/classes/sessions/${sessionId}/reserve`);
            showToast(txt.reserveSuccess, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to reserve session', error);
            showToast(getErrorMessage(error, txt.reserveFailed), 'error');
        } finally {
            setActingSessionId(null);
        }
    }

    async function handleCancelBooking(sessionId: string) {
        setActingSessionId(sessionId);
        try {
            await api.delete(`/classes/sessions/${sessionId}/reserve`);
            showToast(txt.cancelBookingSuccess, 'success');
            await loadData();
        } catch (error) {
            console.error('Failed to cancel booking', error);
            showToast(getErrorMessage(error, txt.bookingsFailed), 'error');
        } finally {
            setActingSessionId(null);
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">{txt.loading}</div>;
    }

    const scheduleFormSection = (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_320px] xl:items-start">
            <form className="kpi-card overflow-hidden !rounded-[28px] !border-primary/10 !p-0" onSubmit={handleCreateSession}>
                <div className="border-b border-border/70 bg-gradient-to-b from-primary/[0.10] via-primary/[0.04] to-transparent px-6 py-6 lg:px-8">
                    <div className="space-y-3">
                        <p className="section-chip">{txt.schedulerEyebrow}</p>
                        <div className="space-y-2">
                            <h2 className="text-3xl font-bold tracking-tight text-foreground">{txt.formTitle}</h2>
                            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{txt.editorLead}</p>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3 backdrop-blur-sm">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{txt.previewCoach}</p>
                            <p className="mt-2 text-base font-semibold text-foreground">{selectedCoachName}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3 backdrop-blur-sm">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{txt.previewDuration}</p>
                            <p className="mt-2 text-base font-semibold text-foreground">{durationPreview > 0 ? `${durationPreview} min` : '...'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3 backdrop-blur-sm">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{txt.previewCapacity}</p>
                            <p className="mt-2 text-base font-semibold text-foreground">{capacityPreview > 0 ? capacityPreview : '...'}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-7">
                    <section className="rounded-[24px] border border-border/70 bg-background/35 p-5 lg:p-6">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary/80">{txt.classInfoSection}</p>
                                <p className="text-sm text-muted-foreground">{txt.classNameHint}</p>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(220px,0.7fr)]">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.className}</label>
                                <input
                                    className="input-field"
                                    value={sessionForm.session_name}
                                    onChange={(event) => setSessionForm((current) => ({ ...current, session_name: event.target.value }))}
                                    placeholder={txt.className}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.coach}</label>
                                {canAssignCoach ? (
                                    <select
                                        className="input-field"
                                        value={sessionForm.coach_id}
                                        onChange={(event) => setSessionForm((current) => ({ ...current, coach_id: event.target.value }))}
                                        required
                                    >
                                        <option value="">{txt.coach}</option>
                                        {coaches.map((coach) => (
                                            <option key={coach.id} value={coach.id}>
                                                {coach.full_name} ({coach.role})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="input-field flex min-h-12 items-center border-dashed bg-muted/15 text-foreground/90">
                                        {selectedCoachName}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">{canAssignCoach ? txt.coachHint : txt.coachLockedHint}</p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[24px] border border-border/70 bg-muted/[0.10] p-5 lg:p-6">
                        <div className="mb-4 space-y-1">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary/80">{txt.scheduleSection}</p>
                            <p className="text-sm text-muted-foreground">{txt.dateHint}</p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.date}</label>
                                <input
                                    className="input-field"
                                    type="date"
                                    value={sessionForm.session_date}
                                    onChange={(event) => setSessionForm((current) => ({ ...current, session_date: event.target.value }))}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.time}</label>
                                <input
                                    className="input-field"
                                    type="time"
                                    value={sessionForm.session_time}
                                    onChange={(event) => setSessionForm((current) => ({ ...current, session_time: event.target.value }))}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.duration}</label>
                                <input
                                    className="input-field"
                                    type="number"
                                    min="5"
                                    max="480"
                                    step="5"
                                    value={sessionForm.duration_minutes}
                                    onChange={(event) => setSessionForm((current) => ({ ...current, duration_minutes: event.target.value }))}
                                    required
                                />
                                <p className="text-xs text-muted-foreground">{txt.durationHint}</p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[24px] border border-border/70 bg-background/35 p-5 lg:p-6">
                        <div className="mb-4 space-y-1">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary/80">{txt.capacitySection}</p>
                            <p className="text-sm text-muted-foreground">{txt.capacityHint}</p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.capacity}</label>
                                <input
                                    className="input-field"
                                    type="number"
                                    min="1"
                                    max="500"
                                    value={sessionForm.capacity}
                                    onChange={(event) => setSessionForm((current) => ({ ...current, capacity: event.target.value }))}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{txt.repeatWeeks}</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/20 text-muted-foreground">
                                        <Repeat size={16} />
                                    </div>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        max="52"
                                        value={sessionForm.repeat_weeks}
                                        onChange={(event) => setSessionForm((current) => ({ ...current, repeat_weeks: event.target.value }))}
                                        required
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">{txt.repeatWeeksHint}</p>
                            </div>
                        </div>
                    </section>

                    <div className="border-t border-border/70 pt-4">
                        <button type="submit" className="btn-primary h-12 w-full justify-center text-base font-bold" disabled={creatingSession}>
                            {creatingSession ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                            {txt.createSession}
                        </button>
                    </div>
                </div>
            </form>

            <aside className="space-y-4 lg:sticky lg:top-24">
                <div className="kpi-card !rounded-[26px] !border-primary/10 bg-gradient-to-b from-card via-card to-muted/[0.08] !p-5">
                    <div className="space-y-1 border-b border-border/70 pb-4">
                        <h3 className="text-xl font-bold text-foreground">{txt.previewTitle}</h3>
                        <p className="text-sm text-muted-foreground">{txt.previewDescription}</p>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/[0.16] p-4">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{txt.previewCoach}</p>
                                    <p className="mt-1 text-base font-semibold text-foreground">{selectedCoachName}</p>
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.08] text-primary">
                                    <Users size={18} />
                                </div>
                            </div>

                            <div className="space-y-3 border-t border-border/60 pt-4">
                                <div className="flex items-start justify-between gap-4 text-sm">
                                    <span className="text-muted-foreground">{txt.starts}</span>
                                    <span className="max-w-[180px] text-end font-semibold text-foreground">
                                        {startPreview ? formatDateTime(startPreview.toISOString(), sessionLocale) : txt.previewEmpty}
                                    </span>
                                </div>
                                <div className="flex items-start justify-between gap-4 text-sm">
                                    <span className="text-muted-foreground">{txt.ends}</span>
                                    <span className="max-w-[180px] text-end font-semibold text-foreground">
                                        {startPreview && durationPreview > 0 ? formatEndTime(startPreview, durationPreview, sessionLocale) : txt.previewEmpty}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-4 text-sm">
                                    <span className="text-muted-foreground">{txt.previewDuration}</span>
                                    <span className="font-semibold text-foreground">{durationPreview > 0 ? `${durationPreview} min` : '...'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 text-sm">
                                    <span className="text-muted-foreground">{txt.previewCapacity}</span>
                                    <span className="font-semibold text-foreground">{capacityPreview > 0 ? capacityPreview : '...'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="kpi-card !rounded-[26px] border-primary/10 bg-primary/[0.04] !p-5">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="mt-0.5 text-primary" />
                        <div className="space-y-1 text-sm">
                            <p className="font-semibold text-foreground">{txt.summaryNoteTitle}</p>
                            <p className="text-muted-foreground">{txt.conflictHint}</p>
                        </div>
                    </div>
                </div>
            </aside>
        </section>
    );

    const upcomingSessionsSection = (
        <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="section-chip mb-3">{txt.upcomingSessions}</p>
                    <h2 className="text-2xl font-bold text-foreground">{txt.upcomingSessions}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{txt.sessionsIntro}</p>
                </div>
            </div>

            {sessions.length === 0 ? (
                <div className="kpi-card text-sm text-muted-foreground">{txt.noSessions}</div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {sessions.map((session) => {
                        const isToday = new Date(session.starts_at).toDateString() === new Date().toDateString();
                        return (
                            <div
                                key={session.id}
                                className="kpi-card space-y-4 !rounded-[24px] !p-5 transition-colors hover:!border-primary/50 cursor-pointer"
                                onClick={() => setSelectedSession(session)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setSelectedSession(session);
                                    }
                                }}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-bold text-foreground">{session.display_name}</h3>
                                            {isToday ? (
                                                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                                                    {txt.today}
                                                </span>
                                            ) : null}
                                        </div>
                                        {session.display_name !== session.template_name ? (
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {txt.templateReference}: {session.template_name}
                                            </p>
                                        ) : null}
                                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <Calendar size={15} />
                                                {formatDate(session.starts_at, sessionLocale)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock3 size={15} />
                                                {formatTime(session.starts_at, sessionLocale)} - {formatTime(session.ends_at, sessionLocale)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Users size={15} />
                                                {session.coach_name || txt.noCoach}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${statusTone(session.status)}`}>
                                        {session.status}
                                    </span>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-4">
                                    <div className="rounded-2xl border border-border/50 bg-background/45 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.seats}</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{session.capacity}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/50 bg-background/45 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.reserved}</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{session.reserved_count}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/50 bg-background/45 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.pending}</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{session.pending_count}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/50 bg-background/45 p-3">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.waitlist}</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{session.waitlist_count}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSelectedSession(session);
                                        }}
                                    >
                                        <Users size={16} />
                                        {txt.viewAttendees}
                                    </button>
                                    {session.status === 'SCHEDULED' ? (
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void handleCompleteSession(session);
                                            }}
                                            disabled={actingSessionId === session.id}
                                        >
                                            <Check size={16} />
                                            {txt.completeSession}
                                        </button>
                                    ) : null}
                                    {canCancelSessions && session.status === 'SCHEDULED' ? (
                                        <button
                                            type="button"
                                            className="btn-ghost text-destructive"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void handleCancelSession(session);
                                            }}
                                            disabled={actingSessionId === session.id}
                                        >
                                            <X size={16} />
                                            {txt.cancelSession}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );

    const customerBrowseSection = (
        <section className="space-y-4">
            {publicSessions.length === 0 ? (
                <div className="kpi-card text-sm text-muted-foreground">{txt.noUpcomingPublic}</div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {publicSessions.map((session) => {
                        const reservation = reservationBySession.get(session.id);
                        const isFull = session.reserved_count >= session.capacity && !reservation;
                        return (
                            <div key={session.id} className="kpi-card space-y-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-xl font-bold text-foreground">{session.display_name}</h3>
                                            {reservation ? (
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${reservationTone(reservation.status)}`}>
                                                    {reservation.status}
                                                </span>
                                            ) : isFull ? (
                                                <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-red-400">
                                                    {txt.full}
                                                </span>
                                            ) : null}
                                        </div>
                                        {session.display_name !== session.template_name ? (
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {txt.templateReference}: {session.template_name}
                                            </p>
                                        ) : null}
                                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <Calendar size={15} />
                                                {formatDate(session.starts_at, sessionLocale)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock3 size={15} />
                                                {formatTime(session.starts_at, sessionLocale)} - {formatTime(session.ends_at, sessionLocale)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Users size={15} />
                                                {session.coach_name || txt.noCoach}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-center">
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{txt.seatsUsed}</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">
                                            {session.reserved_count}/{session.capacity}
                                        </p>
                                    </div>
                                </div>

                                {isFull && !reservation ? (
                                    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-muted-foreground">
                                        {txt.fullHint}
                                    </div>
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                    {reservation ? (
                                        <button
                                            type="button"
                                            className="btn-ghost text-destructive"
                                            onClick={() => void handleCancelBooking(session.id)}
                                            disabled={actingSessionId === session.id}
                                        >
                                            <X size={16} />
                                            {txt.cancelBooking}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={() => void handleReserve(session.id)}
                                            disabled={actingSessionId === session.id}
                                        >
                                            {actingSessionId === session.id ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                                            {txt.reserveSpot}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );

    const customerBookingsSection = (
        <section className="space-y-4">
            {myReservations.length === 0 ? (
                <div className="kpi-card text-sm text-muted-foreground">{txt.myBookingsEmpty}</div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {myReservations.map((reservation) => (
                        <div key={reservation.reservation_id} className="kpi-card space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-xl font-bold text-foreground">{reservation.session.display_name}</h3>
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${reservationTone(reservation.status)}`}>
                                            {reservation.status}
                                        </span>
                                    </div>
                                    {reservation.session.display_name !== reservation.session.template_name ? (
                                        <p className="text-xs font-medium text-muted-foreground">
                                            {txt.templateReference}: {reservation.session.template_name}
                                        </p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <Calendar size={15} />
                                            {formatDate(reservation.session.starts_at, sessionLocale)}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock3 size={15} />
                                            {formatTime(reservation.session.starts_at, sessionLocale)} - {formatTime(reservation.session.ends_at, sessionLocale)}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Users size={15} />
                                            {reservation.session.coach_name || txt.noCoach}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {txt.requestSubmittedAt}: {formatDateTime(reservation.reserved_at, sessionLocale)}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="btn-ghost text-destructive"
                                    onClick={() => void handleCancelBooking(reservation.session.id)}
                                    disabled={actingSessionId === reservation.session.id}
                                >
                                    <X size={16} />
                                    {txt.cancelBooking}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{txt.pageTitle}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{txt.pageSubtitle}</p>
                </div>
            </div>

            {isStaffView && !isCoach ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="kpi-card">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{txt.sessionsCount}</p>
                        <p className="mt-2 text-3xl font-bold text-foreground">{staffSummary.scheduled}</p>
                    </div>
                    <div className="kpi-card">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{txt.attendeesCount}</p>
                        <p className="mt-2 text-3xl font-bold text-foreground">{staffSummary.attendees}</p>
                    </div>
                </div>
            ) : null}

            {isCustomer ? (
                <>
                    <div className="flex items-center gap-2 border-b border-border">
                        <button
                            type="button"
                            className={`border-b-2 px-4 py-3 text-sm font-semibold ${customerTab === 'browse' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                            onClick={() => setCustomerTab('browse')}
                        >
                            {txt.browseClasses}
                        </button>
                        <button
                            type="button"
                            className={`border-b-2 px-4 py-3 text-sm font-semibold ${customerTab === 'bookings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                            onClick={() => setCustomerTab('bookings')}
                        >
                            {txt.myBookings}
                        </button>
                    </div>
                    {customerTab === 'browse' ? customerBrowseSection : customerBookingsSection}
                </>
            ) : (
                <>
                    {scheduleFormSection}
                    {upcomingSessionsSection}
                </>
            )}

            <Modal
                isOpen={Boolean(selectedSession)}
                onClose={() => setSelectedSession(null)}
                title={selectedSession ? `${txt.attendeesTitle}: ${selectedSession.display_name}` : txt.attendeesTitle}
                maxWidthClassName="max-w-2xl"
            >
                {sessionReservationsLoading ? (
                    <div className="text-sm text-muted-foreground">{txt.attendeesLoading}</div>
                ) : sessionReservationsError ? (
                    <div className="text-sm text-destructive">{sessionReservationsError}</div>
                ) : sessionReservations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                        {txt.attendeesEmpty}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessionReservations.map((reservation) => (
                            <div
                                key={reservation.id}
                                className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-foreground">{reservation.member_name || txt.memberFallback}</p>
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${reservationTone(reservation.status)}`}>
                                            {reservation.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {formatDateTime(reservation.reserved_at, sessionLocale)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
}
