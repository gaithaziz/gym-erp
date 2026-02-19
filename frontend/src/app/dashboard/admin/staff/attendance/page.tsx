'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Clock, Edit2, Check, X } from 'lucide-react';

interface AttendanceLog {
    id: string;
    user_id: string;
    user_name: string;
    check_in_time: string | null;
    check_out_time: string | null;
    hours_worked: number | null;
}

export default function AttendancePage() {
    const [logs, setLogs] = useState<AttendanceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editIn, setEditIn] = useState('');
    const [editOut, setEditOut] = useState('');

    useEffect(() => { fetchLogs(); }, []);

    const fetchLogs = async () => {
        try {
            const res = await api.get('/hr/attendance');
            setLogs(res.data.data);
        } catch (err) { console.error(err); }
        setLoading(false);
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
        } catch (err) { alert('Failed to update'); }
    };

    const fmt = (iso: string | null) => {
        if (!iso) return '—';
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
                            {logs.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-[#333] text-sm">No attendance records</td></tr>
                            )}
                            {logs.map((log) => (
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
                                        {log.hours_worked != null ? `${log.hours_worked}h` : '—'}
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
