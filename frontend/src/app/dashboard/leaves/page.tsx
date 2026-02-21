'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { useFeedback } from '@/components/FeedbackProvider';

interface LeaveRequest {
    id: string;
    start_date: string;
    end_date: string;
    leave_type: string;
    status: string;
    reason: string | null;
}

export default function MyLeavesPage() {
    const { showToast } = useFeedback();
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);

    // form state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [leaveType, setLeaveType] = useState('SICK');
    const [reason, setReason] = useState('');

    const fetchLeaves = async () => {
        try {
            const res = await api.get('/hr/leaves/me');
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/hr/leaves', {
                start_date: startDate,
                end_date: endDate,
                leave_type: leaveType,
                reason: reason || null
            });
            setIsAddOpen(false);
            setStartDate('');
            setEndDate('');
            setReason('');
            fetchLeaves();
        } catch (err) {
            showToast(
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to submit request',
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-mono">My Leaves</h1>
                    <p className="text-sm text-muted-foreground mt-1">Request and track your time off</p>
                </div>
                <button onClick={() => setIsAddOpen(true)} className="btn-primary flex items-center gap-2">
                    <Plus size={18} /> Request Leave
                </button>
            </div>

            <div className="chart-card overflow-hidden !p-0 border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Type</th>
                                <th>Reason</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaves.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No leave requests yet</td></tr>
                            )}
                            {leaves.map((l) => (
                                <tr key={l.id}>
                                    <td className="font-medium text-foreground">
                                        {new Date(l.start_date).toLocaleDateString()} - {new Date(l.end_date).toLocaleDateString()}
                                    </td>
                                    <td><span className="badge badge-gray">{l.leave_type}</span></td>
                                    <td className="text-muted-foreground">{l.reason || '-'}</td>
                                    <td>
                                        <span className={`badge ${l.status === 'APPROVED' ? 'badge-green' :
                                            l.status === 'DENIED' ? 'badge-red' : 'badge-amber'
                                            }`}>
                                            {l.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Request Leave">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">Start Date</label>
                            <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="input-dark w-full" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">End Date</label>
                            <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="input-dark w-full" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">Leave Type</label>
                        <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="input-dark w-full">
                            <option value="SICK">Sick</option>
                            <option value="VACATION">Vacation</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">Reason (Optional)</label>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} className="input-dark w-full h-24 resize-none" placeholder="Brief reason..." />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" className="btn-primary">Submit Request</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
