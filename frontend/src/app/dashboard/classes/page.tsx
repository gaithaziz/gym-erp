'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Plus, Calendar as CalendarIcon, Users, Settings, X, Check, Search, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';

// Types
type ClassTemplate = {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    duration_minutes: number;
    capacity: number;
    color: string | null;
    is_active: boolean;
};

type ClassSession = {
    id: string;
    template_id: string;
    template_name: string;
    coach_id: string;
    coach_name: string | null;
    starts_at: string;
    ends_at: string;
    capacity: number;
    capacity_override: number | null;
    status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
    reserved_count: number;
    pending_count: number;
    waitlist_count: number;
};

type UserData = {
    id: string;
    full_name: string;
    role: string;
};

export default function ClassesDashboard() {
    const { user } = useAuth();
    const [view, setView] = useState<'SESSIONS' | 'TEMPLATES'>('SESSIONS');
    const [templates, setTemplates] = useState<ClassTemplate[]>([]);
    const [sessions, setSessions] = useState<ClassSession[]>([]);
    const [coaches, setCoaches] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);

    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showSessionModal, setShowSessionModal] = useState(false);

    // Form states
    const [templateForm, setTemplateForm] = useState({ name: '', description: '', duration_minutes: 60, capacity: 20 });
    const [sessionForm, setSessionForm] = useState({ template_id: '', coach_id: '', starts_at: '', capacity_override: '', recur_weekly_count: '0' });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [tempRes, sessRes, staffRes] = await Promise.all([
                api.get('/classes/templates'),
                api.get('/classes/sessions'),
                api.get('/hr/staff') // Fetch staff to select coaches
            ]);
            setTemplates(tempRes.data || []);
            setSessions(sessRes.data || []);
            setCoaches((staffRes.data.data || []).filter((s: any) => ['ADMIN', 'MANAGER', 'COACH'].includes(s.role)));
        } catch (error) {
            console.error('Failed to load classes data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/classes/templates', templateForm);
            setShowTemplateModal(false);
            setTemplateForm({ name: '', description: '', duration_minutes: 60, capacity: 20 });
            fetchData();
        } catch (error) {
            alert('Failed to create template');
        }
    };

    const handleCreateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const startsAtISO = new Date(sessionForm.starts_at).toISOString();
            await api.post('/classes/sessions', {
                template_id: sessionForm.template_id,
                coach_id: sessionForm.coach_id,
                starts_at: startsAtISO,
                capacity_override: sessionForm.capacity_override ? parseInt(sessionForm.capacity_override) : null,
                recur_weekly_count: parseInt(sessionForm.recur_weekly_count)
            });
            setShowSessionModal(false);
            setSessionForm({ template_id: '', coach_id: '', starts_at: '', capacity_override: '', recur_weekly_count: '0' });
            fetchData();
        } catch (error) {
            alert('Failed to create session');
        }
    };

    const cancelSession = async (id: string) => {
        if (!confirm('Cancel this session? This will cancel all reservations.')) return;
        try {
            await api.post(`/classes/sessions/${id}/cancel`);
            fetchData();
        } catch (err) {
            alert('Failed to cancel session');
        }
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight">Classes & Reservations</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage class schedule, templates, and member bookings</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowTemplateModal(true)}
                        className="btn-secondary"
                    >
                        <Settings size={16} /> New Template
                    </button>
                    <button
                        onClick={() => setShowSessionModal(true)}
                        className="btn-primary"
                    >
                        <CalendarIcon size={16} /> Schedule Session
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 border-b border-border pb-2">
                <button
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${view === 'SESSIONS' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setView('SESSIONS')}
                >
                    Scheduled Sessions
                </button>
                <button
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${view === 'TEMPLATES' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setView('TEMPLATES')}
                >
                    Class Templates
                </button>
            </div>

            {view === 'SESSIONS' ? (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-muted/50 border-b border-border">
                            <tr>
                                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date & Time</th>
                                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Class</th>
                                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Coach</th>
                                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Capacity</th>
                                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sessions.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No sessions scheduled.</td></tr>
                            ) : sessions.map((s) => (
                                <tr key={s.id} className="hover:bg-muted/20">
                                    <td className="p-4">
                                        <div className="font-medium text-foreground">{format(new Date(s.starts_at), 'MMM d, yyyy')}</div>
                                        <div className="text-sm text-muted-foreground">{format(new Date(s.starts_at), 'h:mm a')}</div>
                                    </td>
                                    <td className="p-4 font-bold">{s.template_name}</td>
                                    <td className="p-4">{s.coach_name}</td>
                                    <td className="p-4">
                                        <div className="flex flex-col text-sm">
                                            <span className="text-foreground">{s.reserved_count} / {s.capacity} Booked</span>
                                            {(s.pending_count > 0 || s.waitlist_count > 0) && (
                                                <span className="text-orange-500 text-xs mt-1">{s.pending_count} pending, {s.waitlist_count} waitlist</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${s.status === 'SCHEDULED' ? 'bg-blue-500/10 text-blue-500' : s.status === 'COMPLETED' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {s.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        {s.status === 'SCHEDULED' && (
                                            <button onClick={() => cancelSession(s.id)} className="text-red-500 hover:text-red-600 text-sm font-medium">Cancel</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map(t => (
                        <div key={t.id} className="kpi-card p-4">
                            <h3 className="font-bold text-lg mb-1">{t.name}</h3>
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{t.description || 'No description'}</p>
                            <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
                                <span className="flex items-center gap-1"><Clock size={14} /> {t.duration_minutes}m</span>
                                <span className="flex items-center gap-1"><Users size={14} /> {t.capacity} max</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}
            {showTemplateModal && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h2 className="font-bold text-lg">New Class Template</h2>
                            <button onClick={() => setShowTemplateModal(false)}><X size={20} className="text-muted-foreground" /></button>
                        </div>
                        <form onSubmit={handleCreateTemplate} className="p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Class Name</label>
                                <input required type="text" className="input-field" value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Description</label>
                                <textarea className="input-field" value={templateForm.description} onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })} />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Duration (min)</label>
                                    <input required type="number" min="5" className="input-field" value={templateForm.duration_minutes} onChange={e => setTemplateForm({ ...templateForm, duration_minutes: parseInt(e.target.value) })} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Default Capacity</label>
                                    <input required type="number" min="1" className="input-field" value={templateForm.capacity} onChange={e => setTemplateForm({ ...templateForm, capacity: parseInt(e.target.value) })} />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-2">
                                <button type="button" className="btn-secondary" onClick={() => setShowTemplateModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Create Template</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showSessionModal && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h2 className="font-bold text-lg">Schedule Class Session</h2>
                            <button onClick={() => setShowSessionModal(false)}><X size={20} className="text-muted-foreground" /></button>
                        </div>
                        <form onSubmit={handleCreateSession} className="p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Template</label>
                                <select required className="input-field" value={sessionForm.template_id} onChange={e => setSessionForm({ ...sessionForm, template_id: e.target.value })}>
                                    <option value="">Select Template...</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Coach</label>
                                <select required className="input-field" value={sessionForm.coach_id} onChange={e => setSessionForm({ ...sessionForm, coach_id: e.target.value })}>
                                    <option value="">Select Coach...</option>
                                    {coaches.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.role})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Start Date & Time</label>
                                <input required type="datetime-local" className="input-field" value={sessionForm.starts_at} onChange={e => setSessionForm({ ...sessionForm, starts_at: e.target.value })} />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Capacity Override (Opt)</label>
                                    <input type="number" min="1" className="input-field" value={sessionForm.capacity_override} onChange={e => setSessionForm({ ...sessionForm, capacity_override: e.target.value })} placeholder="Default" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Repeat Weekly</label>
                                    <input type="number" min="0" max="52" className="input-field" value={sessionForm.recur_weekly_count} onChange={e => setSessionForm({ ...sessionForm, recur_weekly_count: e.target.value })} placeholder="0" />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-2">
                                <button type="button" className="btn-secondary" onClick={() => setShowSessionModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Schedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
