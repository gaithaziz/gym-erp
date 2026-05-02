'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, Save } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useBranch } from '@/context/BranchContext';
import { BRANCH_ADMIN_ROLES } from '@/lib/roles';

interface BranchHoursDay {
    weekday: number;
    is_closed: boolean;
    open_time?: string | null;
    close_time?: string | null;
    note?: string | null;
}

interface BranchHoursResponse {
    branch: {
        id: string;
        name: string;
        display_name?: string | null;
        code: string;
        slug: string;
        timezone: string;
    };
    summary: {
        current_weekday: number;
        current_is_closed: boolean;
        current_open_time?: string | null;
        current_close_time?: string | null;
        current_note?: string | null;
        updated_at?: string | null;
    };
    days: BranchHoursDay[];
}

const EN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const AR_DAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

function weekdayLabel(weekday: number, locale: string) {
    const days = locale === 'ar' ? AR_DAYS : EN_DAYS;
    return days[weekday] || String(weekday);
}

function hoursLabel(day: BranchHoursDay | undefined, locale: string) {
    if (!day || day.is_closed) return locale === 'ar' ? 'مغلق' : 'Closed';
    return `${day.open_time || '--:--'} - ${day.close_time || '--:--'}`;
}

export default function HoursPage() {
    const { user } = useAuth();
    const { locale, direction } = useLocale();
    const { selectedBranchId } = useBranch();
    const canEdit = Boolean(user && [...BRANCH_ADMIN_ROLES, 'SUPER_ADMIN'].includes(user.role));
    const branchId = canEdit && selectedBranchId !== 'all' ? selectedBranchId : null;
    const [draftDays, setDraftDays] = useState<BranchHoursDay[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const hoursQuery = useQuery({
        queryKey: ['branch-hours', branchId, user?.role],
        queryFn: async () => {
            const response = await api.get(canEdit ? '/admin/branch-hours' : '/branch-hours/current', branchId ? { params: { branch_id: branchId } } : undefined);
            return response.data?.data as BranchHoursResponse;
        },
        enabled: !canEdit || Boolean(branchId),
    });

    const hours = hoursQuery.data;
    const needsBranchSelection = canEdit && !branchId;
    useEffect(() => {
        if (hours?.days?.length) {
            setDraftDays(hours.days);
        }
    }, [hours]);

    const selectedDay = useMemo(() => {
        if (!hours) return null;
        return hours.days.find((day) => day.weekday === hours.summary.current_weekday) || null;
    }, [hours]);
    const hasConfiguredHours = Boolean(hours?.days?.some((day) => !day.is_closed && day.open_time && day.close_time));

    const updateDay = (weekday: number, patch: Partial<BranchHoursDay>) => {
        setDraftDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
    };

    const saveHours = async () => {
        if (!branchId || !hours) return;
        setIsSaving(true);
        try {
            await api.put('/admin/branch-hours', {
                branch_id: branchId,
                days: draftDays.map((day) => ({
                    weekday: day.weekday,
                    is_closed: day.is_closed,
                    open_time: day.is_closed ? null : day.open_time || null,
                    close_time: day.is_closed ? null : day.close_time || null,
                    note: day.note || null,
                })),
            }, { params: { locale } });
            await hoursQuery.refetch();
        } finally {
            setIsSaving(false);
        }
    };

    const branchName = hours?.branch.display_name || hours?.branch.name || (locale === 'ar' ? 'ساعات العمل' : 'Hours & days');
    const updatedAt = hours?.summary.updated_at ? new Date(hours.summary.updated_at) : null;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="section-chip mb-2">{locale === 'ar' ? 'ساعات العمل' : 'Hours & days'}</p>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">{branchName}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {locale === 'ar'
                            ? 'أوقات العمل تظهر للعملاء، ويمكن للمشرفين تحديثها من هنا.'
                            : 'Working hours are shown to customers, and admins can update them here.'}
                    </p>
                </div>
                {updatedAt ? (
                    <div className="kpi-card p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'آخر تحديث' : 'Updated'}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {updatedAt.toLocaleString(locale)}
                        </p>
                    </div>
                ) : null}
            </div>

            {needsBranchSelection ? (
                <div className="kpi-card p-6">
                    <p className="text-sm text-muted-foreground">
                        {locale === 'ar' ? 'اختر فرعًا من شريط الفروع لعرض أو تعديل الساعات.' : 'Choose a branch from the branch bar to view or edit hours.'}
                    </p>
                </div>
            ) : hoursQuery.isLoading ? (
                <div className="kpi-card p-6">Loading...</div>
            ) : hours ? (
                <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
                    <div className="space-y-6">
                        <div className="kpi-card p-6 border-l-4 border-l-primary">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="section-chip mb-2">{locale === 'ar' ? 'اليوم' : 'Today'}</p>
                                    <p className="text-2xl font-bold text-foreground font-serif">
                                        {weekdayLabel(hours.summary.current_weekday, locale)}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {!hasConfiguredHours || selectedDay?.is_closed
                                            ? locale === 'ar' ? 'مغلق اليوم' : 'Closed today'
                                            : locale === 'ar' ? 'مفتوح الآن' : 'Open now'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border bg-background px-3 py-2 text-right">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                        {locale === 'ar' ? 'ساعات اليوم' : 'Today'}
                                    </p>
                                    <p className="mt-1 font-mono font-semibold text-foreground">
                                        {!hasConfiguredHours ? (locale === 'ar' ? 'غير محدد' : 'Not set') : hoursLabel(selectedDay || undefined, locale)}
                                    </p>
                                </div>
                            </div>
                            {hours.summary.current_note ? (
                                <p className="mt-4 text-sm text-muted-foreground">{hours.summary.current_note}</p>
                            ) : null}
                        </div>

                        <div className="kpi-card p-6">
                            <p className="section-chip mb-4">{locale === 'ar' ? 'الجدول الأسبوعي' : 'Weekly schedule'}</p>
                            <div className="space-y-3">
                                {hours.days.map((day) => {
                                    const isCurrent = day.weekday === hours.summary.current_weekday;
                                    return (
                                        <div
                                            key={day.weekday}
                                            className={`rounded-xl border p-4 ${isCurrent ? 'border-primary/60 bg-primary/5' : 'border-border bg-background/60'}`}
                                        >
                                            <div className={`flex items-start justify-between gap-4 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className="flex-1">
                                                    <p className="font-semibold text-foreground">{weekdayLabel(day.weekday, locale)}</p>
                                                    {day.note ? <p className="mt-1 text-sm text-muted-foreground">{day.note}</p> : null}
                                                </div>
                                                <p className={`text-sm font-mono font-semibold ${day.is_closed ? 'text-muted-foreground' : 'text-primary'}`}>
                                                    {hoursLabel(day, locale)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="kpi-card p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="section-chip mb-2">{locale === 'ar' ? 'تعديل الساعات' : 'Edit hours'}</p>
                                <h2 className="text-lg font-bold text-foreground">{locale === 'ar' ? 'للمشرفين والمدراء' : 'Admins and managers'}</h2>
                            </div>
                            <Clock3 className="text-primary" size={20} />
                        </div>

                        {canEdit ? (
                            branchId ? (
                                <div className="mt-5 space-y-4">
                                    {draftDays.map((day) => (
                                        <div key={day.weekday} className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                                            <div className={`flex items-center justify-between gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <p className="font-semibold text-foreground">{weekdayLabel(day.weekday, locale)}</p>
                                                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                                    <input
                                                        type="checkbox"
                                                        checked={day.is_closed}
                                                        onChange={(event) => updateDay(day.weekday, { is_closed: event.target.checked })}
                                                    />
                                                    {locale === 'ar' ? 'مغلق' : 'Closed'}
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <label className="space-y-1">
                                                    <span className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'من' : 'Open'}</span>
                                                    <input
                                                        type="time"
                                                        className="input-dark"
                                                        value={day.open_time || ''}
                                                        disabled={day.is_closed}
                                                        onChange={(event) => updateDay(day.weekday, { open_time: event.target.value })}
                                                    />
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'إلى' : 'Close'}</span>
                                                    <input
                                                        type="time"
                                                        className="input-dark"
                                                        value={day.close_time || ''}
                                                        disabled={day.is_closed}
                                                        onChange={(event) => updateDay(day.weekday, { close_time: event.target.value })}
                                                    />
                                                </label>
                                            </div>
                                            <label className="space-y-1 block">
                                                <span className="text-xs uppercase tracking-wider text-muted-foreground">{locale === 'ar' ? 'ملاحظة' : 'Note'}</span>
                                                <input
                                                    type="text"
                                                    className="input-dark"
                                                    value={day.note || ''}
                                                    onChange={(event) => updateDay(day.weekday, { note: event.target.value })}
                                                />
                                            </label>
                                        </div>
                                    ))}
                                    <button type="button" onClick={saveHours} disabled={isSaving} className="btn-primary w-full justify-center">
                                        <Save size={16} />
                                        {isSaving ? (locale === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ الساعات' : 'Save hours')}
                                    </button>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    {locale === 'ar' ? 'اختر فرعًا أولاً من شريط الفروع.' : 'Choose a branch first from the branch selector.'}
                                </p>
                            )
                        ) : (
                            <p className="mt-4 text-sm text-muted-foreground">
                                {locale === 'ar'
                                    ? 'يمكنك مشاهدة ساعات العمل الحالية هنا.'
                                    : 'You can view the current working hours here.'}
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="kpi-card p-6">
                    <p className="text-sm text-muted-foreground">{locale === 'ar' ? 'لم يتم ضبط ساعات العمل بعد.' : 'Working hours are not set yet.'}</p>
                </div>
            )}
        </div>
    );
}
