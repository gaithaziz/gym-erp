'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Check, X, Edit2 } from 'lucide-react';
import { useFeedback } from '@/components/FeedbackProvider';

interface AttendanceLog {
    id: string;
    user_id: string;
    user_name: string;
    check_in_time: string | null;
    check_out_time: string | null;
    hours_worked: number | null;
}

export default function AttendancePage() {
    const { showToast } = useFeedback();
    const [logs, setLogs] = useState<AttendanceLog[]>([]);
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
            showToast('Start date cannot be after end date.', 'error');
            return;
        }
        setLoading(true);
        try {
            const res = await api.get('/hr/attendance', {
                params: {
                    limit: 500,
                },
            });
            setLogs(res.data.data);
        } catch {
            showToast('Failed to load attendance logs', 'error');
        }
        setLoading(false);
    }, [startDate, endDate, showToast]);

    useEffect(() => { setTimeout(() => fetchLogs(), 0); }, [fetchLogs]);

    const filteredLogs = useMemo(() => {
        if (datePreset === 'all') return logs;
        return logs.filter((log) => {
            if (!log.check_in_time) return false;
            const d = new Date(log.check_in_time);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const checkInDate = `${y}-${m}-${day}`;
            return checkInDate >= startDate && checkInDate <= endDate;
        });
    }, [logs, startDate, endDate, datePreset]);

    const applyPreset = (preset: 'all' | 'today' | '7d' | '30d' | 'custom') => {
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
            showToast('Failed to update attendance record', 'error');
        }
    };

    const fmt = (iso: string | null) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Attendance Timesheet</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">View and correct staff attendance records</p>
            </div>

            <div className="chart-card p-4 border border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Slicer</p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyPreset('all')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>All Dates</button>
                    <button onClick={() => applyPreset('today')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'today' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Today</button>
                    <button onClick={() => applyPreset('7d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '7d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Last 7 Days</button>
                    <button onClick={() => applyPreset('30d')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === '30d' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Last 30 Days</button>
                    <button onClick={() => applyPreset('custom')} className={`px-3 py-1.5 text-xs border rounded-sm transition-colors ${datePreset === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Custom</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
                        <input
                            type="date"
                            className="input-dark"
                            value={startDate}
                            onChange={(e) => {
                                setDatePreset('custom');
                                setStartDate(e.target.value);
                                if (e.target.value > endDate) setEndDate(e.target.value);
                            }}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">End Date</label>
                        <input
                            type="date"
                            className="input-dark"
                            value={endDate}
                            min={startDate}
                            onChange={(e) => {
                                setDatePreset('custom');
                                setEndDate(e.target.value);
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="chart-card overflow-hidden !p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-dark min-w-[600px]">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th className="text-right">Hours</th>
                                <th className="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-[#333] text-sm">No attendance records</td></tr>
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
            </div>
        </div>
    );
}
