'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Check, X, Search, Printer } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';
import { useLocale } from '@/context/LocaleContext';

interface LeaveRequest {
    id: string;
    user_id: string;
    user_name: string;
    start_date: string;
    end_date: string;
    leave_type: string;
    status: string;
    reason: string | null;
}

export default function AdminLeavesPage() {
    const { locale, formatDate } = useLocale();
    const { showToast } = useFeedback();
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const txt = locale === 'ar'
        ? {
            loadError: 'فشل في تحميل الإجازات',
            updateError: 'فشل في تحديث الحالة',
            popupBlocked: 'تم حظر النافذة. اسمح بالنوافذ المنبثقة للطباعة.',
            noRequests: 'لا توجد طلبات إجازة',
            allDates: 'كل التواريخ',
            summaryTitle: 'ملخص إجازات الموارد البشرية',
            range: 'النطاق',
            status: 'الحالة',
            type: 'النوع',
            staff: 'الموظف',
            start: 'البداية',
            end: 'النهاية',
            leaveRequests: 'طلبات الإجازة',
            subtitle: 'إدارة إجازات الموظفين',
            printSummary: 'طباعة ملخص الإجازات',
            filters: 'الفلاتر',
            allStatus: 'كل الحالات',
            pending: 'قيد الانتظار',
            approved: 'موافق',
            denied: 'مرفوض',
            allTypes: 'كل الأنواع',
            sick: 'مرضي',
            vacation: 'إجازة',
            other: 'أخرى',
            searchPlaceholder: 'ابحث باسم الموظف أو بريده',
            staffMember: 'الموظف',
            period: 'الفترة',
            typeReason: 'النوع والسبب',
            action: 'الإجراء',
            noFound: 'لا توجد طلبات إجازة',
            to: 'إلى',
            approve: 'موافقة',
            deny: 'رفض',
        }
        : {
            loadError: 'Failed to load leaves',
            updateError: 'Failed to update status',
            popupBlocked: 'Popup blocked. Allow popups to print.',
            noRequests: 'No leave requests',
            allDates: 'All Dates',
            summaryTitle: 'HR Leaves Summary',
            range: 'Range',
            status: 'Status',
            type: 'Type',
            staff: 'Staff',
            start: 'Start',
            end: 'End',
            leaveRequests: 'Leave Requests',
            subtitle: 'Manage staff time off',
            printSummary: 'Print Leaves Summary',
            filters: 'Filters',
            allStatus: 'All Status',
            pending: 'Pending',
            approved: 'Approved',
            denied: 'Denied',
            allTypes: 'All Types',
            sick: 'Sick',
            vacation: 'Vacation',
            other: 'Other',
            searchPlaceholder: 'Search by staff name or email',
            staffMember: 'Staff Member',
            period: 'Period',
            typeReason: 'Type & Reason',
            action: 'Action',
            noFound: 'No leave requests found',
            to: 'to',
            approve: 'Approve',
            deny: 'Deny',
        };
    const statusLabel = (status: string) => {
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

    const fetchLeaves = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (typeFilter !== 'ALL') params.leave_type = typeFilter;
            if (search.trim()) params.search = search.trim();
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            const res = await api.get('/hr/leaves', { params });
            setLeaves(res.data.data || []);
        } catch (err) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail || txt.loadError, 'error');
        } finally {
            setLoading(false);
        }
    }, [endDate, search, showToast, startDate, statusFilter, typeFilter, txt.loadError]);

    useEffect(() => {
        setTimeout(() => fetchLeaves(), 0);
    }, [fetchLeaves]);

    const updateStatus = async (id: string, status: string) => {
        try {
            await api.put(`/hr/leaves/${id}`, { status });
            fetchLeaves();
        } catch (err) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail || txt.updateError, 'error');
        }
    };

    const printLeaves = () => {
        const w = window.open('', '_blank');
        if (!w) {
            showToast(txt.popupBlocked, 'error');
            return;
        }
        const rows = leaves.map((l) => (
            `<tr><td>${l.user_name}</td><td>${formatDate(l.start_date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</td><td>${formatDate(l.end_date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</td><td>${leaveTypeLabel(l.leave_type)}</td><td>${statusLabel(l.status)}</td></tr>`
        )).join('') || `<tr><td colspan="5" style="text-align:center;">${txt.noRequests}</td></tr>`;
        const range = startDate || endDate ? `${startDate || '...'} ${txt.to} ${endDate || '...'}` : txt.allDates;
        const printStatus = statusFilter === 'ALL' ? txt.allStatus : statusLabel(statusFilter);
        const printType = typeFilter === 'ALL' ? txt.allTypes : leaveTypeLabel(typeFilter);
        w.document.write(`
        <html><head><title>${txt.summaryTitle}</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.meta{margin-bottom:10px;color:#555}</style>
        </head><body>
        <h2>${txt.summaryTitle}</h2>
        <div class="meta">${txt.range}: ${range} - ${txt.status}: ${printStatus} - ${txt.type}: ${printType}</div>
        <table><thead><tr><th>${txt.staff}</th><th>${txt.start}</th><th>${txt.end}</th><th>${txt.type}</th><th>${txt.status}</th></tr></thead><tbody>${rows}</tbody></table>
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
        <div className="space-y-8 p-4 sm:p-0">
            <div>
                <h1 className="text-2xl font-bold text-foreground font-mono">{txt.leaveRequests}</h1>
                <p className="text-sm text-muted-foreground mt-1">{txt.subtitle}</p>
                <button className="btn-ghost mt-3" onClick={printLeaves}><Printer size={14} /> {txt.printSummary}</button>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{txt.filters}</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select className="input-dark" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ALL">{txt.allStatus}</option>
                        <option value="PENDING">{txt.pending}</option>
                        <option value="APPROVED">{txt.approved}</option>
                        <option value="DENIED">{txt.denied}</option>
                    </select>
                    <select className="input-dark" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="ALL">{txt.allTypes}</option>
                        <option value="SICK">{txt.sick}</option>
                        <option value="VACATION">{txt.vacation}</option>
                        <option value="OTHER">{txt.other}</option>
                    </select>
                    <input type="date" className="input-dark" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    <input type="date" className="input-dark" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} />
                </div>
                <div className="field-with-icon">
                    <Search size={14} className="field-icon" />
                    <input className="input-dark input-with-icon" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={txt.searchPlaceholder} />
                </div>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-start table-dark min-w-[700px]">
                        <thead>
                            <tr>
                                <th>{txt.staffMember}</th>
                                <th>{txt.period}</th>
                                <th>{txt.typeReason}</th>
                                <th>{txt.status}</th>
                                <th className="text-center">{txt.action}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaves.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">{txt.noFound}</td></tr>
                            )}
                            {leaves.map((l) => (
                                <tr key={l.id}>
                                    <td className="font-medium text-foreground">{l.user_name}</td>
                                    <td>
                                        <div className="text-sm">{formatDate(l.start_date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                                        <div className="text-xs text-muted-foreground">{txt.to} {formatDate(l.end_date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className="badge badge-gray">{leaveTypeLabel(l.leave_type)}</span>
                                        </div>
                                        {l.reason && <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]" title={l.reason}>{l.reason}</p>}
                                    </td>
                                    <td>
                                        <span className={`badge ${l.status === 'APPROVED' ? 'badge-green' :
                                            l.status === 'DENIED' ? 'badge-red' : 'badge-amber'
                                            }`}>
                                            {statusLabel(l.status)}
                                        </span>
                                    </td>
                                    <td>
                                        {l.status === 'PENDING' ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => updateStatus(l.id, 'APPROVED')} className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors" title={txt.approve}>
                                                    <Check size={16} />
                                                </button>
                                                <button onClick={() => updateStatus(l.id, 'DENIED')} className="p-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors" title={txt.deny}>
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : <div className="text-center text-xs text-muted-foreground">-</div>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

