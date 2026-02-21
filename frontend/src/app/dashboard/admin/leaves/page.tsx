'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Check, X } from 'lucide-react';
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

    const fetchLeaves = async () => {
        try {
            const res = await api.get('/hr/leaves');
            setLeaves(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaves();
    }, []);

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
