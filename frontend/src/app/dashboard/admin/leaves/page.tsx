'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Check, X, Search, Printer } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';

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
    const { showToast } = useFeedback();
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

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
            showToast(
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to load leaves',
                'error'
            );
        } finally {
            setLoading(false);
        }
    }, [endDate, search, showToast, startDate, statusFilter, typeFilter]);

    useEffect(() => {
        setTimeout(() => fetchLeaves(), 0);
    }, [fetchLeaves]);

    const updateStatus = async (id: string, status: string) => {
        try {
            await api.put(`/hr/leaves/${id}`, { status });
            fetchLeaves();
        } catch (err) {
            showToast(
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to update status',
                'error'
            );
        }
    };

    const printLeaves = () => {
        const w = window.open('', '_blank');
        if (!w) {
            showToast('Popup blocked. Allow popups to print.', 'error');
            return;
        }
        const rows = leaves.map((l) => (
            `<tr><td>${l.user_name}</td><td>${new Date(l.start_date).toLocaleDateString()}</td><td>${new Date(l.end_date).toLocaleDateString()}</td><td>${l.leave_type}</td><td>${l.status}</td></tr>`
        )).join('') || '<tr><td colspan="5" style="text-align:center;">No leave requests</td></tr>';
        const range = startDate || endDate ? `${startDate || '...'} to ${endDate || '...'}` : 'All Dates';
        w.document.write(`
        <html><head><title>HR Leaves Summary</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.meta{margin-bottom:10px;color:#555}</style>
        </head><body>
        <h2>HR Leaves Summary</h2>
        <div class="meta">Range: ${range} - Status: ${statusFilter} - Type: ${typeFilter}</div>
        <table><thead><tr><th>Staff</th><th>Start</th><th>End</th><th>Type</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
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
                <h1 className="text-2xl font-bold text-foreground font-mono">Leave Requests</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage staff time off</p>
                <button className="btn-ghost mt-3" onClick={printLeaves}><Printer size={14} /> Print Leaves Summary</button>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filters</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select className="input-dark" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ALL">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="DENIED">Denied</option>
                    </select>
                    <select className="input-dark" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="ALL">All Types</option>
                        <option value="SICK">Sick</option>
                        <option value="VACATION">Vacation</option>
                        <option value="OTHER">Other</option>
                    </select>
                    <input type="date" className="input-dark" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    <input type="date" className="input-dark" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} />
                </div>
                <div className="field-with-icon">
                    <Search size={14} className="field-icon" />
                    <input className="input-dark input-with-icon" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by staff name or email" />
                </div>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[700px]">
                        <thead>
                            <tr>
                                <th>Staff Member</th>
                                <th>Period</th>
                                <th>Type & Reason</th>
                                <th>Status</th>
                                <th className="text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaves.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No leave requests found</td></tr>
                            )}
                            {leaves.map((l) => (
                                <tr key={l.id}>
                                    <td className="font-medium text-foreground">{l.user_name}</td>
                                    <td>
                                        <div className="text-sm">{new Date(l.start_date).toLocaleDateString()}</div>
                                        <div className="text-xs text-muted-foreground">to {new Date(l.end_date).toLocaleDateString()}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className="badge badge-gray">{l.leave_type}</span>
                                        </div>
                                        {l.reason && <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]" title={l.reason}>{l.reason}</p>}
                                    </td>
                                    <td>
                                        <span className={`badge ${l.status === 'APPROVED' ? 'badge-green' :
                                            l.status === 'DENIED' ? 'badge-red' : 'badge-amber'
                                            }`}>
                                            {l.status}
                                        </span>
                                    </td>
                                    <td>
                                        {l.status === 'PENDING' ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => updateStatus(l.id, 'APPROVED')} className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors" title="Approve">
                                                    <Check size={16} />
                                                </button>
                                                <button onClick={() => updateStatus(l.id, 'DENIED')} className="p-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors" title="Deny">
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
