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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Attendance Timesheet</h1>
                <p className="text-sm text-slate-400 mt-1">View and correct staff attendance records</p>
            </div>

            <div className="chart-card overflow-hidden !p-0">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-3 font-medium">Employee</th>
                            <th className="px-6 py-3 font-medium">Clock In</th>
                            <th className="px-6 py-3 font-medium">Clock Out</th>
                            <th className="px-6 py-3 font-medium text-right">Hours</th>
                            <th className="px-6 py-3 font-medium text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {logs.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-8 text-slate-300 text-sm">No attendance records</td></tr>
                        )}
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-700">{log.user_name}</td>
                                <td className="px-6 py-4 text-slate-500">
                                    {editingId === log.id ? (
                                        <input type="datetime-local" className="border border-slate-200 rounded-lg px-2 py-1 text-sm" value={editIn} onChange={e => setEditIn(e.target.value)} />
                                    ) : fmt(log.check_in_time)}
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                    {editingId === log.id ? (
                                        <input type="datetime-local" className="border border-slate-200 rounded-lg px-2 py-1 text-sm" value={editOut} onChange={e => setEditOut(e.target.value)} />
                                    ) : fmt(log.check_out_time)}
                                </td>
                                <td className="px-6 py-4 text-right font-mono text-sm">
                                    {log.hours_worked != null ? `${log.hours_worked}h` : '—'}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {editingId === log.id ? (
                                        <div className="flex justify-center gap-2">
                                            <button onClick={saveEdit} className="text-emerald-500 hover:text-emerald-700"><Check size={16} /></button>
                                            <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
                                        </div>
                                    ) : (
                                        <button onClick={() => startEdit(log)} className="text-slate-400 hover:text-blue-500 transition-colors">
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
    );
}
