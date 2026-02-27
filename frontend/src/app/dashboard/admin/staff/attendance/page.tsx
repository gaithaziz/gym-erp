'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Check, X, Edit2, Printer } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

interface AttendanceLog {
    id: string;
    user_id: string;
    user_name: string;
    check_in_time: string | null;
    check_out_time: string | null;
    hours_worked: number | null;
}

export default function AttendancePage() {
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const txt = locale === 'ar'
        ? {
            startAfterEnd: 'لا يمكن أن يكون تاريخ البداية بعد تاريخ النهاية.',
            loadFailed: 'فشل تحميل سجلات الحضور',
            updateFailed: 'فشل تحديث سجل الحضور',
            popupBlocked: 'تم حظر النافذة المنبثقة. اسمح بالنوافذ للطباعة.',
            noAttendance: 'لا توجد سجلات حضور',
            attendanceSummary: 'ملخص الحضور',
            range: 'النطاق',
            allDates: 'كل التواريخ',
            to: 'إلى',
            employee: 'الموظف',
            clockIn: 'تسجيل الدخول',
            clockOut: 'تسجيل الخروج',
            hours: 'الساعات',
            attendanceTimesheet: 'سجل الحضور',
            attendanceSubtitle: 'عرض وتصحيح سجلات حضور الموظفين',
            printAttendanceSummary: 'طباعة ملخص الحضور',
            dateSlicer: 'تصفية التاريخ',
            today: 'اليوم',
            last7Days: 'آخر 7 أيام',
            last30Days: 'آخر 30 يومًا',
            custom: 'مخصص',
            startDate: 'تاريخ البداية',
            endDate: 'تاريخ النهاية',
            totalRecords: 'إجمالي السجلات:',
            page: 'الصفحة',
            of: 'من',
            actions: 'الإجراءات',
            previous: 'السابق',
            next: 'التالي',
        }
        : {
            startAfterEnd: 'Start date cannot be after end date.',
            loadFailed: 'Failed to load attendance logs',
            updateFailed: 'Failed to update attendance record',
            popupBlocked: 'Popup blocked. Allow popups to print.',
            noAttendance: 'No attendance records',
            attendanceSummary: 'Attendance Summary',
            range: 'Range',
            allDates: 'All Dates',
            to: 'to',
            employee: 'Employee',
            clockIn: 'Clock In',
            clockOut: 'Clock Out',
            hours: 'Hours',
            attendanceTimesheet: 'Attendance Timesheet',
            attendanceSubtitle: 'View and correct staff attendance records',
            printAttendanceSummary: 'Print Attendance Summary',
            dateSlicer: 'Date Slicer',
            today: 'Today',
            last7Days: 'Last 7 Days',
            last30Days: 'Last 30 Days',
            custom: 'Custom',
            startDate: 'Start Date',
            endDate: 'End Date',
            totalRecords: 'Total records:',
            page: 'Page',
            of: 'of',
            actions: 'Actions',
            previous: 'Previous',
            next: 'Next',
        };
    const PAGE_SIZE = 50;
    const [logs, setLogs] = useState<AttendanceLog[]>([]);
    const [totalLogs, setTotalLogs] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editIn, setEditIn] = useState('');
    const [editOut, setEditOut] = useState('');
    const [datePreset, setDatePreset] = useState<'all' | 'today' | '7d' | '30d' | 'custom'>('7d');

    const toDateInput = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const [startDate, setStartDate] = useState(toDateInput(sevenDaysAgo));
    const [endDate, setEndDate] = useState(toDateInput(today));

    const fetchLogs = useCallback(async () => {
        if (startDate > endDate) {
            showToast(txt.startAfterEnd, 'error');
            return;
        }
        setLoading(true);
        try {
            const params: Record<string, string | number> = {
                limit: PAGE_SIZE,
                offset: (page - 1) * PAGE_SIZE,
            };
            if (datePreset !== 'all') {
                params.start_date = startDate;
                params.end_date = endDate;
            }
            const res = await api.get('/hr/attendance', {
                params,
            });
            setLogs(res.data.data);
            setTotalLogs(Number(res.headers['x-total-count'] || 0));
        } catch {
            showToast(txt.loadFailed, 'error');
        }
        setLoading(false);
    }, [PAGE_SIZE, datePreset, endDate, page, showToast, startDate]);

    useEffect(() => { setTimeout(() => fetchLogs(), 0); }, [fetchLogs]);

    const filteredLogs = logs;
    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));

    const applyPreset = (preset: 'all' | 'today' | '7d' | '30d' | 'custom') => {
        setPage(1);
        setDatePreset(preset);
        if (preset === 'custom' || preset === 'all') return;

        const now = new Date();
        const start = new Date(now);
        if (preset === 'today') start.setDate(now.getDate());
        if (preset === '7d') start.setDate(now.getDate() - 6);
        if (preset === '30d') start.setDate(now.getDate() - 29);

        setStartDate(toDateInput(start));
        setEndDate(toDateInput(now));
    };

    const startEdit = (log: AttendanceLog) => {
        setEditingId(log.id);
        setEditIn(log.check_in_time ? log.check_in_time.slice(0, 16) : '');
        setEditOut(log.check_out_time ? log.check_out_time.slice(0, 16) : '');
    };

    const saveEdit = async () => {
        if (!editingId) return;
        try {
            await api.put(`/hr/attendance/${editingId}`, {
                check_in_time: editIn ? new Date(editIn).toISOString() : undefined,
                check_out_time: editOut ? new Date(editOut).toISOString() : undefined,
            });
            setEditingId(null);
            fetchLogs();
        } catch {
            showToast(txt.updateFailed, 'error');
        }
    };

    const fmt = (iso: string | null) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return formatDate(d, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const printAttendance = () => {
        const w = window.open('', '_blank');
        if (!w) {
            showToast(txt.popupBlocked, 'error');
            return;
        }
        const rows = filteredLogs.map((log) => (
            `<tr><td>${log.user_name}</td><td>${fmt(log.check_in_time)}</td><td>${fmt(log.check_out_time)}</td><td style="text-align:right;">${log.hours_worked ?? 0}</td></tr>`
        )).join('') || `<tr><td colspan="4" style="text-align:center;">${txt.noAttendance}</td></tr>`;
        w.document.write(`
        <html><head><title>${txt.attendanceSummary}</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.meta{margin-bottom:10px;color:#555}</style>
        </head><body>
        <h2>${txt.attendanceSummary}</h2>
        <div class="meta">${txt.range}: ${datePreset === 'all' ? txt.allDates : `${startDate} ${txt.to} ${endDate}`}</div>
        <table><thead><tr><th>${txt.employee}</th><th>${txt.clockIn}</th><th>${txt.clockOut}</th><th style="text-align:right;">${txt.hours}</th></tr></thead><tbody>${rows}</tbody></table>
        <script>window.onload=function(){window.print();window.close();}</script>
        </body></html>`);
        w.document.close();
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">{txt.attendanceTimesheet}</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">{txt.attendanceSubtitle}</p>
                <button className="btn-ghost mt-3" onClick={printAttendance}><Printer size={14} /> {txt.printAttendanceSummary}</button>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{txt.dateSlicer}</p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyPreset('all')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.allDates}</button>
                    <button onClick={() => applyPreset('today')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'today' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.today}</button>
                    <button onClick={() => applyPreset('7d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '7d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.last7Days}</button>
                    <button onClick={() => applyPreset('30d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '30d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.last30Days}</button>
                    <button onClick={() => applyPreset('custom')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{txt.custom}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">{txt.startDate}</label>
                        <input
                            type="date"
                            className="input-dark"
                            value={startDate}
                            onChange={(e) => {
                                setPage(1);
                                setDatePreset('custom');
                                setStartDate(e.target.value);
                                if (e.target.value > endDate) setEndDate(e.target.value);
                            }}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">{txt.endDate}</label>
                        <input
                            type="date"
                            className="input-dark"
                            value={endDate}
                            min={startDate}
                            onChange={(e) => {
                                setPage(1);
                                setDatePreset('custom');
                                setEndDate(e.target.value);
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="chart-card overflow-hidden !p-0">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{txt.totalRecords} {totalLogs}</span>
                    <span className="text-xs text-muted-foreground">{txt.page} {page} {txt.of} {totalPages}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>{txt.employee}</th>
                                <th>{txt.clockIn}</th>
                                <th>{txt.clockOut}</th>
                                <th className="text-right">{txt.hours}</th>
                                <th className="text-center">{txt.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-[#333] text-sm">{txt.noAttendance}</td></tr>
                            )}
                            {filteredLogs.map((log) => (
                                <tr key={log.id}>
                                    <td className="!text-white font-medium">{log.user_name}</td>
                                    <td>
                                        {editingId === log.id ? (
                                            <input type="datetime-local" className="input-dark !p-1.5 text-xs !rounded-lg" value={editIn} onChange={e => setEditIn(e.target.value)} />
                                        ) : fmt(log.check_in_time)}
                                    </td>
                                    <td>
                                        {editingId === log.id ? (
                                            <input type="datetime-local" className="input-dark !p-1.5 text-xs !rounded-lg" value={editOut} onChange={e => setEditOut(e.target.value)} />
                                        ) : fmt(log.check_out_time)}
                                    </td>
                                    <td className="text-right font-mono text-sm !text-white">
                                        {log.hours_worked != null ? `${log.hours_worked}h` : '-'}
                                    </td>
                                    <td className="text-center">
                                        {editingId === log.id ? (
                                            <div className="flex justify-center gap-2">
                                                <button onClick={saveEdit} className="text-[#34d399] hover:text-[#10b981] p-1 rounded hover:bg-[#10b981]/10"><Check size={16} /></button>
                                                <button onClick={() => setEditingId(null)} className="text-[#f87171] hover:text-[#ef4444] p-1 rounded hover:bg-[#ef4444]/10"><X size={16} /></button>
                                            </div>
                                        ) : (
                                            <button onClick={() => startEdit(log)} className="text-[#6B6B6B] hover:text-[#FF6B00] transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={page <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                        {txt.previous}
                    </button>
                    <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={page >= totalPages}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    >
                        {txt.next}
                    </button>
                </div>
            </div>
        </div>
    );
}
