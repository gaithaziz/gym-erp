'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Calendar, Printer } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';

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
    const { showToast } = useFeedback();
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<StaffSummaryResponse | null>(null);
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
        if (!id) return;
        if (startDate > endDate) {
            showToast('Start date cannot be after end date.', 'error');
            return;
        }
        setLoading(true);
        try {
            const res = await api.get(`/hr/staff/${id}/summary`, { params: { start_date: startDate, end_date: endDate } });
            setSummary(res.data.data);
        } catch (err) {
            showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to load staff summary', 'error');
        } finally {
            setLoading(false);
        }
    }, [endDate, id, showToast, startDate]);

    useEffect(() => { setTimeout(() => fetchSummary(), 0); }, [fetchSummary]);

    const attendanceRows = useMemo(() => summary?.attendance_summary.records ?? [], [summary]);
    const leaveRows = useMemo(() => summary?.leave_summary.records ?? [], [summary]);

    const printSection = (type: 'attendance' | 'leaves') => {
        if (!summary) return;
        const employee = summary.employee;
        const title = type === 'attendance' ? 'Attendance Summary' : 'Leave Summary';
        const metrics = type === 'attendance'
            ? `<div class="metric"><b>Days Present</b><br/>${summary.attendance_summary.days_present}</div>
               <div class="metric"><b>Total Hours</b><br/>${summary.attendance_summary.total_hours.toFixed(2)}</div>
               <div class="metric"><b>Avg/Day</b><br/>${summary.attendance_summary.avg_hours_per_day.toFixed(2)}</div>`
            : `<div class="metric"><b>Total Requests</b><br/>${summary.leave_summary.total_requests}</div>
               <div class="metric"><b>Approved Days</b><br/>${summary.leave_summary.approved_days}</div>
               <div class="metric"><b>Pending</b><br/>${summary.leave_summary.pending_count}</div>`;

        const rows = type === 'attendance'
            ? attendanceRows.map((r) => `<tr><td>${r.check_in_time ? new Date(r.check_in_time).toLocaleString() : '-'}</td><td>${r.check_out_time ? new Date(r.check_out_time).toLocaleString() : '-'}</td><td style="text-align:right;">${r.hours_worked.toFixed(2)}</td></tr>`).join('')
            : leaveRows.map((r) => `<tr><td>${new Date(r.start_date).toLocaleDateString()}</td><td>${new Date(r.end_date).toLocaleDateString()}</td><td>${r.leave_type}</td><td>${r.status}</td></tr>`).join('');
        const tableHead = type === 'attendance'
            ? '<tr><th>Check In</th><th>Check Out</th><th style="text-align:right;">Hours</th></tr>'
            : '<tr><th>Start</th><th>End</th><th>Type</th><th>Status</th></tr>';
        const tableRows = rows || `<tr><td colspan="${type === 'attendance' ? 3 : 4}" style="text-align:center;">No records</td></tr>`;

        const w = window.open('', '_blank');
        if (!w) {
            showToast('Popup blocked. Allow popups to print.', 'error');
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
            <div class="card"><h2>${title}</h2><div class="meta">${employee.full_name} • ${employee.email} • ${startDate} to ${endDate}</div></div>
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

    if (!summary) return null;

    return (
        <div className="space-y-6">
            <button className="btn-ghost !px-0" onClick={() => router.push('/dashboard/admin/staff')}>
                <ArrowLeft size={16} /> Back to Staff
            </button>

            <div>
                <h1 className="text-2xl font-bold text-foreground">{summary.employee.full_name}</h1>
                <p className="text-sm text-muted-foreground mt-1">{summary.employee.email} • {summary.employee.role}</p>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyPreset('7d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${preset === '7d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Last 7 Days</button>
                    <button onClick={() => applyPreset('30d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${preset === '30d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Last 30 Days</button>
                    <button onClick={() => applyPreset('custom')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${preset === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Custom</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="date" className="input-dark" value={startDate} onChange={(e) => { setPreset('custom'); setStartDate(e.target.value); }} />
                    <input type="date" className="input-dark" value={endDate} min={startDate} onChange={(e) => { setPreset('custom'); setEndDate(e.target.value); }} />
                </div>
                <button className="btn-primary" onClick={fetchSummary}><Calendar size={14} /> Apply</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">Days Present</p><p className="text-xl font-bold text-foreground">{summary.attendance_summary.days_present}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-xl font-bold text-foreground">{summary.attendance_summary.total_hours.toFixed(2)}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">Avg Hours / Day</p><p className="text-xl font-bold text-foreground">{summary.attendance_summary.avg_hours_per_day.toFixed(2)}</p></div>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">Attendance Records</h3>
                    <button className="btn-ghost" onClick={() => printSection('attendance')}><Printer size={14} /> Print Attendance Summary</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[620px]">
                        <thead><tr><th>Check In</th><th>Check Out</th><th className="text-right">Hours</th></tr></thead>
                        <tbody>
                            {attendanceRows.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground text-sm">No attendance records</td></tr>}
                            {attendanceRows.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.check_in_time ? new Date(r.check_in_time).toLocaleString() : '-'}</td>
                                    <td>{r.check_out_time ? new Date(r.check_out_time).toLocaleString() : '-'}</td>
                                    <td className="text-right font-mono">{r.hours_worked.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">Total Requests</p><p className="text-xl font-bold text-foreground">{summary.leave_summary.total_requests}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">Approved Days</p><p className="text-xl font-bold text-foreground">{summary.leave_summary.approved_days}</p></div>
                <div className="kpi-card border border-border"><p className="text-xs text-muted-foreground">Pending Requests</p><p className="text-xl font-bold text-foreground">{summary.leave_summary.pending_count}</p></div>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">Leave Records</h3>
                    <button className="btn-ghost" onClick={() => printSection('leaves')}><Printer size={14} /> Print Leaves Summary</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[620px]">
                        <thead><tr><th>Start</th><th>End</th><th>Type</th><th>Status</th></tr></thead>
                        <tbody>
                            {leaveRows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No leave records</td></tr>}
                            {leaveRows.map((r) => (
                                <tr key={r.id}>
                                    <td>{new Date(r.start_date).toLocaleDateString()}</td>
                                    <td>{new Date(r.end_date).toLocaleDateString()}</td>
                                    <td>{r.leave_type}</td>
                                    <td><span className={`badge ${r.status === 'APPROVED' ? 'badge-green' : r.status === 'DENIED' ? 'badge-red' : 'badge-amber'}`}>{r.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
