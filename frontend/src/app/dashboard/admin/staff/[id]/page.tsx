'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Calendar, Printer } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

interface AttendanceRecord {
    id: string;
    check_in_time: string | null;
    check_out_time: string | null;
    hours_worked: number;
}

interface LeaveRecord {
    id: string;
    start_date: string;
    end_date: string;
    leave_type: string;
    status: string;
    reason: string | null;
}

interface StaffSummaryResponse {
    employee: {
        id: string;
        full_name: string;
        email: string;
        role: string;
        contract_type: string | null;
        base_salary: number | null;
    };
    range: {
        start_date: string | null;
        end_date: string | null;
    };
    attendance_summary: {
        days_present: number;
        total_hours: number;
        avg_hours_per_day: number;
        records: AttendanceRecord[];
    };
    leave_summary: {
        total_requests: number;
        approved_days: number;
        pending_count: number;
        records: LeaveRecord[];
    };
}

export default function StaffSummaryPage() {
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const txt = locale === 'ar'
        ? {
            missingId: 'معرّف الموظف غير موجود في الرابط.',
            startAfterEnd: 'لا يمكن أن يكون تاريخ البداية بعد تاريخ النهاية.',
            failedSummary: 'فشل تحميل ملخص الموظف',
            notFound: 'لم يتم العثور على الموظف',
            adminOnly: 'مطلوب صلاحية المدير لعرض هذا الملخص',
            attendanceSummary: 'ملخص الحضور',
            leaveSummary: 'ملخص الإجازات',
            daysPresent: 'أيام الحضور',
            totalHours: 'إجمالي الساعات',
            avgDay: 'متوسط/اليوم',
            totalRequests: 'إجمالي الطلبات',
            approvedDays: 'الأيام المعتمدة',
            pending: 'قيد الانتظار',
            approved: 'معتمد',
            denied: 'مرفوض',
            sick: 'مرضي',
            vacation: 'إجازة',
            other: 'أخرى',
            checkIn: 'تسجيل الدخول',
            checkOut: 'تسجيل الخروج',
            hours: 'الساعات',
            to: 'إلى',
            start: 'البداية',
            end: 'النهاية',
            type: 'النوع',
            status: 'الحالة',
            noRecords: 'لا توجد سجلات',
            popupBlocked: 'تم حظر النافذة المنبثقة. اسمح بالنوافذ للطباعة.',
            backToStaff: 'العودة للموظفين',
            couldNotLoad: 'تعذر تحميل ملخص الموظف',
            unknownError: 'خطأ غير معروف',
            retry: 'إعادة المحاولة',
            dateRange: 'نطاق التاريخ',
            last7Days: 'آخر 7 أيام',
            last30Days: 'آخر 30 يومًا',
            custom: 'مخصص',
            apply: 'تطبيق',
            attendanceRecords: 'سجلات الحضور',
            printAttendance: 'طباعة ملخص الحضور',
            noAttendance: 'لا توجد سجلات حضور',
            pendingRequests: 'الطلبات المعلقة',
            leaveRecords: 'سجلات الإجازات',
            printLeaves: 'طباعة ملخص الإجازات',
            noLeaves: 'لا توجد سجلات إجازات',
        }
        : {
            missingId: 'Missing staff id in route.',
            startAfterEnd: 'Start date cannot be after end date.',
            failedSummary: 'Failed to load staff summary',
            notFound: 'Staff user not found',
            adminOnly: 'Admin access is required to view this summary',
            attendanceSummary: 'Attendance Summary',
            leaveSummary: 'Leave Summary',
            daysPresent: 'Days Present',
            totalHours: 'Total Hours',
            avgDay: 'Avg/Day',
            totalRequests: 'Total Requests',
            approvedDays: 'Approved Days',
            pending: 'Pending',
            approved: 'Approved',
            denied: 'Denied',
            sick: 'Sick',
            vacation: 'Vacation',
            other: 'Other',
            checkIn: 'Check In',
            checkOut: 'Check Out',
            hours: 'Hours',
            to: 'to',
            start: 'Start',
            end: 'End',
            type: 'Type',
            status: 'Status',
            noRecords: 'No records',
            popupBlocked: 'Popup blocked. Allow popups to print.',
            backToStaff: 'Back to Staff',
            couldNotLoad: 'Could not load staff summary',
            unknownError: 'Unknown error',
            retry: 'Retry',
            dateRange: 'Date Range',
            last7Days: 'Last 7 Days',
            last30Days: 'Last 30 Days',
            custom: 'Custom',
            apply: 'Apply',
            attendanceRecords: 'Attendance Records',
            printAttendance: 'Print Attendance Summary',
            noAttendance: 'No attendance records',
            pendingRequests: 'Pending Requests',
            leaveRecords: 'Leave Records',
            printLeaves: 'Print Leaves Summary',
            noLeaves: 'No leave records',
        };
    const params = useParams();
    const router = useRouter();
    const idParam = params?.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<StaffSummaryResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [preset, setPreset] = useState<'7d' | '30d' | 'custom'>('30d');

    const toDateInput = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const [startDate, setStartDate] = useState(toDateInput(thirtyDaysAgo));
    const [endDate, setEndDate] = useState(toDateInput(today));

    const applyPreset = (next: '7d' | '30d' | 'custom') => {
        setPreset(next);
        if (next === 'custom') return;
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - (next === '7d' ? 6 : 29));
        setStartDate(toDateInput(start));
        setEndDate(toDateInput(now));
    };

    const fetchSummary = useCallback(async () => {
        if (!id) {
            setLoadError(txt.missingId);
            setLoading(false);
            return;
        }
        if (startDate > endDate) {
            showToast(txt.startAfterEnd, 'error');
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const res = await api.get(`/hr/staff/${id}/summary`, { params: { start_date: startDate, end_date: endDate } });
            setSummary(res.data.data);
        } catch (err) {
            const error = err as { response?: { status?: number, data?: { detail?: string } } };
            const status = error.response?.status;
            const apiDetail = error.response?.data?.detail;
            let detail = txt.failedSummary;
            if (status === 404) {
                detail = txt.notFound;
            } else if (status === 403) {
                detail = txt.adminOnly;
            } else if (apiDetail) {
                detail = apiDetail;
            }
            setLoadError(detail);
            showToast(detail, 'error');
        } finally {
            setLoading(false);
        }
    }, [endDate, id, showToast, startDate]);

    useEffect(() => { setTimeout(() => fetchSummary(), 0); }, [fetchSummary]);

    const attendanceRows = useMemo(() => summary?.attendance_summary.records ?? [], [summary]);
    const leaveRows = useMemo(() => summary?.leave_summary.records ?? [], [summary]);
    const leaveTypeLabel = (type: string) => {
        switch (type) {
            case 'SICK':
                return txt.sick;
            case 'VACATION':
                return txt.vacation;
            case 'OTHER':
                return txt.other;
            default:
                return type;
        }
    };
    const leaveStatusLabel = (status: string) => {
        switch (status) {
            case 'PENDING':
                return txt.pending;
            case 'APPROVED':
                return txt.approved;
            case 'DENIED':
                return txt.denied;
            default:
                return status;
        }
    };

    const printSection = (type: 'attendance' | 'leaves') => {
        if (!summary) return;
        const employee = summary.employee;
        const title = type === 'attendance' ? txt.attendanceSummary : txt.leaveSummary;
        const metrics = type === 'attendance'
            ? `<div class="metric"><b>${txt.daysPresent}</b><br/>${summary.attendance_summary.days_present}</div>
               <div class="metric"><b>${txt.totalHours}</b><br/>${summary.attendance_summary.total_hours.toFixed(2)}</div>
               <div class="metric"><b>${txt.avgDay}</b><br/>${summary.attendance_summary.avg_hours_per_day.toFixed(2)}</div>`
            : `<div class="metric"><b>${txt.totalRequests}</b><br/>${summary.leave_summary.total_requests}</div>
               <div class="metric"><b>${txt.approvedDays}</b><br/>${summary.leave_summary.approved_days}</div>
               <div class="metric"><b>${txt.pending}</b><br/>${summary.leave_summary.pending_count}</div>`;

        const rows = type === 'attendance'
            ? attendanceRows.map((r) => `<tr><td>${r.check_in_time ? formatDate(r.check_in_time, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td><td>${r.check_out_time ? formatDate(r.check_out_time, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td><td style="text-align:right;">${r.hours_worked.toFixed(2)}</td></tr>`).join('')
            : leaveRows.map((r) => `<tr><td>${formatDate(r.start_date, { dateStyle: 'medium' })}</td><td>${formatDate(r.end_date, { dateStyle: 'medium' })}</td><td>${leaveTypeLabel(r.leave_type)}</td><td>${leaveStatusLabel(r.status)}</td></tr>`).join('');
        const tableHead = type === 'attendance'
            ? `<tr><th>${txt.checkIn}</th><th>${txt.checkOut}</th><th style="text-align:right;">${txt.hours}</th></tr>`
            : `<tr><th>${txt.start}</th><th>${txt.end}</th><th>${txt.type}</th><th>${txt.status}</th></tr>`;
        const tableRows = rows || `<tr><td colspan="${type === 'attendance' ? 3 : 4}" style="text-align:center;">${txt.noRecords}</td></tr>`;

        const w = window.open('', '_blank');
        if (!w) {
            showToast(txt.popupBlocked, 'error');
            return;
        }
        w.document.write(`
          <html><head><title>${title}</title>
            <style>
              body{font-family:Arial,sans-serif;background:#0b1220;color:#e5e7eb;padding:24px}
              .card{background:#111827;border:1px solid #243045;border-radius:12px;padding:16px;margin-bottom:14px}
              .meta{color:#93a4c0;font-size:12px}
              .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:8px}
              table{width:100%;border-collapse:collapse;font-size:12px}
              th,td{border:1px solid #243045;padding:8px;text-align:left}
              th{background:#182033}
            </style>
          </head><body>
            <div class="card"><h2>${title}</h2><div class="meta">${employee.full_name} • ${employee.email} • ${startDate} ${txt.to} ${endDate}</div></div>
            <div class="card"><div class="metrics">${metrics}</div></div>
            <div class="card"><table><thead>${tableHead}</thead><tbody>${tableRows}</tbody></table></div>
            <script>window.onload=function(){window.print();window.close();}</script>
          </body></html>
        `);
        w.document.close();
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    if (!summary) {
        return (
            <div className="space-y-4">
                <button className="btn-ghost !px-0" onClick={() => router.push('/dashboard/admin/staff')}>
                    <ArrowLeft size={16} /> {txt.backToStaff}
                </button>
                <div className="chart-card border border-border p-6 space-y-3">
                    <h2 className="text-lg font-semibold text-foreground">{txt.couldNotLoad}</h2>
                    <p className="text-sm text-muted-foreground">{loadError || txt.unknownError}</p>
                    <button className="btn-primary" onClick={fetchSummary}><Calendar size={14} /> {txt.retry}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <button className="btn-ghost !px-0" onClick={() => router.push('/dashboard/admin/staff')}>
                <ArrowLeft size={16} /> {txt.backToStaff}
            </button>

            <div>
                <h1 className="text-2xl font-bold text-foreground">{summary.employee.full_name}</h1>
                <p className="text-sm text-muted-foreground mt-1">{summary.employee.email} • {summary.employee.role}</p>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{txt.dateRange}</p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyPreset('7d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${preset === '7d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.last7Days}</button>
                    <button onClick={() => applyPreset('30d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${preset === '30d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.last30Days}</button>
                    <button onClick={() => applyPreset('custom')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${preset === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.custom}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="date" className="input-dark" value={startDate} onChange={(e) => { setPreset('custom'); setStartDate(e.target.value); }} />
                    <input type="date" className="input-dark" value={endDate} min={startDate} onChange={(e) => { setPreset('custom'); setEndDate(e.target.value); }} />
                </div>
                <button className="btn-primary" onClick={fetchSummary}><Calendar size={14} /> {txt.apply}</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">{txt.daysPresent}</p><p className="text-xl font-bold text-foreground">{summary.attendance_summary.days_present}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">{txt.totalHours}</p><p className="text-xl font-bold text-foreground">{summary.attendance_summary.total_hours.toFixed(2)}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">{txt.avgDay}</p><p className="text-xl font-bold text-foreground">{summary.attendance_summary.avg_hours_per_day.toFixed(2)}</p></div>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">{txt.attendanceRecords}</h3>
                    <button className="btn-ghost" onClick={() => printSection('attendance')}><Printer size={14} /> {txt.printAttendance}</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[620px]">
                        <thead><tr><th>{txt.checkIn}</th><th>{txt.checkOut}</th><th className="text-end">{txt.hours}</th></tr></thead>
                        <tbody>
                            {attendanceRows.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground text-sm">{txt.noAttendance}</td></tr>}
                            {attendanceRows.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.check_in_time ? formatDate(r.check_in_time, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                                    <td>{r.check_out_time ? formatDate(r.check_out_time, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                                    <td className="text-end font-mono">{r.hours_worked.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">{txt.totalRequests}</p><p className="text-xl font-bold text-foreground">{summary.leave_summary.total_requests}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">{txt.approvedDays}</p><p className="text-xl font-bold text-foreground">{summary.leave_summary.approved_days}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">{txt.pendingRequests}</p><p className="text-xl font-bold text-foreground">{summary.leave_summary.pending_count}</p></div>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">{txt.leaveRecords}</h3>
                    <button className="btn-ghost" onClick={() => printSection('leaves')}><Printer size={14} /> {txt.printLeaves}</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[620px]">
                        <thead><tr><th>{txt.start}</th><th>{txt.end}</th><th>{txt.type}</th><th>{txt.status}</th></tr></thead>
                        <tbody>
                            {leaveRows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">{txt.noLeaves}</td></tr>}
                            {leaveRows.map((r) => (
                                <tr key={r.id}>
                                    <td>{formatDate(r.start_date, { dateStyle: 'medium' })}</td>
                                    <td>{formatDate(r.end_date, { dateStyle: 'medium' })}</td>
                                    <td>{leaveTypeLabel(r.leave_type)}</td>
                                    <td><span className={`badge ${r.status === 'APPROVED' ? 'badge-green' : r.status === 'DENIED' ? 'badge-red' : 'badge-amber'}`}>{leaveStatusLabel(r.status)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
